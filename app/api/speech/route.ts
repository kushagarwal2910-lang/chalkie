import { z } from "zod";
import { groqFetch, GroqFreeLimitError, type GroqQuotaSnapshot } from "@/lib/groq-pool";

export const runtime = "nodejs";
export const maxDuration = 60;

const speechSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  voice: z.string().max(40).default("autumn"),
  sessionId: z.string().trim().max(120).optional(),
  preferredGroqKeyId: z.string().trim().max(32).optional(),
});

export async function POST(request: Request) {
  let input: z.infer<typeof speechSchema>;
  try { input = speechSchema.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid speech request" }, { status: 400 }); }

  let providerStatus: GroqQuotaSnapshot | undefined;
  try {
    const response = await groqFetch("/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english", voice: input.voice, input: input.text, response_format: "wav" }),
    }, {
      sessionId: input.sessionId,
      preferredKeyId: input.preferredGroqKeyId,
      timeoutMs: 55_000,
      onStatus: (status) => { providerStatus = status; },
    });
    const headers: Record<string, string> = { "Content-Type": response.headers.get("content-type") || "audio/wav", "Cache-Control": "no-store" };
    if (providerStatus) headers["X-Chalkie-Provider-Status"] = encodeURIComponent(JSON.stringify(providerStatus));
    return new Response(response.body, { headers });
  } catch (error) {
    if (error instanceof GroqFreeLimitError) return Response.json({ error: error.message, code: error.code, providerStatus: error.quota }, { status: 429 });
    return Response.json({ error: "Speech generation failed" }, { status: 502 });
  }
}
