import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { driveConfigured, encryptDriveSession } from "@/lib/drive-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("chalkie_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!driveConfigured() || !code || !state || state !== expectedState) return NextResponse.redirect(new URL("/?drive=error", request.url));

  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) return NextResponse.redirect(new URL("/?drive=error", request.url));
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  const encrypted = encryptDriveSession({ accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 });
  cookieStore.set("chalkie_drive", encrypted, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  cookieStore.delete("chalkie_oauth_state");
  return NextResponse.redirect(new URL("/?drive=connected", request.url));
}
