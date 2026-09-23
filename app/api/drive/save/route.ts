import { cookies } from "next/headers";
import { z } from "zod";
import { decryptDriveSession, driveConfigured, encryptDriveSession, type DriveSession } from "@/lib/drive-session";
import { lessonPlanSchema } from "@/lib/lesson-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({ lesson: lessonPlanSchema });

async function refresh(session: DriveSession): Promise<DriveSession> {
  if (session.expiresAt > Date.now() + 60000) return session;
  if (!session.refreshToken) throw new Error("Google Drive permission expired");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: session.refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("Google Drive permission could not be refreshed");
  const token = await response.json() as { access_token: string; expires_in?: number };
  return { ...session, accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 };
}

export async function POST(request: Request) {
  if (!driveConfigured()) return Response.json({ error: "Google Drive sync is not configured" }, { status: 503 });
  const cookieStore = await cookies();
  const cookie = cookieStore.get("chalkie_drive")?.value;
  if (!cookie) return Response.json({ error: "Google Drive is not connected", connectUrl: "/api/auth/google/start" }, { status: 401 });

  let input: z.infer<typeof inputSchema>;
  try { input = inputSchema.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid lesson backup" }, { status: 400 }); }

  try {
    let session = decryptDriveSession(cookie);
    session = await refresh(session);
    const boundary = `chalkie-${crypto.randomUUID()}`;
    const filename = `${input.lesson.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "chalkie-lesson"}.json`;
    const metadata = JSON.stringify({ name: filename, mimeType: "application/json", appProperties: { app: "chalkie", lessonId: input.lesson.id } });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(input.lesson, null, 2)}\r\n--${boundary}--`;
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status})`);
    cookieStore.set("chalkie_drive", encryptDriveSession(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return Response.json({ ok: true, file: await response.json() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Drive sync failed" }, { status: 500 });
  }
}
