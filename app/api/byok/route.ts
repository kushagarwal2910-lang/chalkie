import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getGroqQuotaSnapshot } from "@/lib/groq-pool";
import { BYOK_COOKIE, byokEncryptionConfigured, encryptProviderCredentials, readByokCookie, resolveProviderCredentials } from "@/lib/provider-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keySchema = z.string().trim().min(24).max(180).regex(/^gsk_[A-Za-z0-9_-]+$/, "Use a valid Groq API key beginning with gsk_");
const inputSchema = z.object({
  groqKeys: z.array(z.string().max(180)).max(3).transform((keys) => [...new Set(keys.map((key) => key.trim()).filter(Boolean))]).pipe(z.array(keySchema).max(3)).optional().default([]),
  tavilyKey: z.string().trim().max(220).optional().transform((value) => value || undefined).refine((value) => !value || value.length >= 20, "Use a valid Tavily API key"),
}).refine((data) => data.groqKeys.length > 0 || Boolean(data.tavilyKey), {
  message: "Provide at least one Groq API key or a Tavily API key",
});

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; }
  catch { return false; }
}

export async function GET(request: NextRequest) {
  const hasPersonalKeyCookie = Boolean((await cookies()).get(BYOK_COOKIE)?.value);
  const credentials = await resolveProviderCredentials();
  const preferredKeyId = request.nextUrl.searchParams.get("preferredKeyId") || undefined;
  const quota = await getGroqQuotaSnapshot(request.nextUrl.searchParams.get("sessionId") || undefined, preferredKeyId);
  return Response.json({
    configured: credentials.groqKeys.length > 0,
    source: credentials.source,
    tavilyConfigured: Boolean(credentials.tavilyKey),
    tavilySource: credentials.tavilySource,
    encryptionReady: byokEncryptionConfigured(),
    personalKeysNeedReentry: hasPersonalKeyCookie && credentials.source !== "byok",
    quota,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin credential updates are not allowed" }, { status: 403 });
  if (!byokEncryptionConfigured()) return Response.json({ error: "BYOK_ENCRYPTION_SECRET must be configured before saving keys" }, { status: 503 });
  let input: z.infer<typeof inputSchema>;
  try { input = inputSchema.parse(await request.json()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid provider keys" }, { status: 400 }); }

  const existing = await readByokCookie();
  const groqKeysToSave = input.groqKeys.length > 0 ? input.groqKeys : (existing?.groqKeys ?? []);
  const tavilyKeyToSave = input.tavilyKey !== undefined ? input.tavilyKey : existing?.tavilyKey;

  const cookieStore = await cookies();
  cookieStore.set(BYOK_COOKIE, encryptProviderCredentials({ version: 1, groqKeys: groqKeysToSave, tavilyKey: tavilyKeyToSave, savedAt: Date.now() }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    priority: "high",
  });
  return Response.json({ ok: true, savedGroqKeys: groqKeysToSave.length, tavilyConfigured: Boolean(tavilyKeyToSave) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin credential updates are not allowed" }, { status: 403 });
  (await cookies()).delete(BYOK_COOKIE);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
