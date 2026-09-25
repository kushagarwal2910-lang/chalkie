import { cookies } from "next/headers";
import { BYOK_COOKIE } from "@/lib/provider-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // 1. Clear server-side in-memory research indexes
  if (globalThis.chalkieResearchIndexes) {
    globalThis.chalkieResearchIndexes.clear();
  }

  // Provider cooldowns are real limits, shared across requests using those keys.
  // Clearing a workspace must not reset them for this user or other users.

  // 3. Clear the BYOK cookie
  const cookieStore = await cookies();
  cookieStore.delete(BYOK_COOKIE);

  return Response.json({
    ok: true,
    message: "Research indexes and personal credential cookies have been cleared. Provider retry windows are unchanged.",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return POST();
}
