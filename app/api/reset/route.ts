import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { BYOK_COOKIE } from "@/lib/provider-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. Clear server-side in-memory research indexes
  if (globalThis.chalkieResearchIndexes) {
    globalThis.chalkieResearchIndexes.clear();
  }

  // 2. Clear server-side in-memory Groq pool states
  if (globalThis.chalkieGroqPoolStates) {
    globalThis.chalkieGroqPoolStates.clear();
  }

  // 3. Clear the BYOK cookie
  const cookieStore = await cookies();
  cookieStore.delete(BYOK_COOKIE);

  return Response.json({
    ok: true,
    message: "Server caches, research indexes, key pool states, and cookies have been cleared.",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
