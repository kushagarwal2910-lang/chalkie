import { z } from "zod";
import { groqFetch, type GroqQuotaSnapshot } from "@/lib/groq-pool";
import { providerFailureResponse, ProviderResponseError } from "@/lib/provider-response";

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
  catch { return Response.json({ error: "Invalid speech request", code: "INVALID_REQUEST", message: "Enter speech text between 1 and 4000 characters.", retryable: false }, { status: 400 }); }
  let providerStatus: GroqQuotaSnapshot | undefined;
  try {
    const response = await groqFetch("/audio/speech", {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english", voice: input.voice, input: input.text, response_format: "wav" }),
    }, {
      sessionId: input.sessionId,
      preferredKeyId: input.preferredGroqKeyId,
      signal: request.signal,
      timeoutMs: 55_000,
      onStatus: (status) => { providerStatus = status; },
    });
    const contentType = response.headers.get("content-type") || "audio/wav";
    if (!response.body || (!contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream"))) {
      throw new ProviderResponseError("Speech provider did not return audio");
    }
    request.signal.throwIfAborted();
    const headers: Record<string, string> = { "Content-Type": contentType, "Cache-Control": "no-store" };
    if (providerStatus) headers["X-Chalkie-Provider-Status"] = encodeURIComponent(JSON.stringify(providerStatus));
    return new Response(response.body, { headers });
  } catch (error) {
    return providerFailureResponse(error, providerStatus);
  }
}
