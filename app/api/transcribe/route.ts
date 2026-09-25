import { groqFetch, type GroqQuotaSnapshot } from "@/lib/groq-pool";
import { providerFailureResponse, ProviderResponseError } from "@/lib/provider-response";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let incoming: FormData;
  try { incoming = await request.formData(); }
  catch { return Response.json({ error: "Invalid audio request", code: "INVALID_REQUEST", message: "Send an audio file as form data.", retryable: false }, { status: 400 }); }
  const audio = incoming.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "An audio file is required", code: "INVALID_REQUEST", retryable: false }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return Response.json({ error: "Audio must be smaller than 25 MB", code: "INVALID_REQUEST", retryable: false }, { status: 413 });
  const form = new FormData();
  form.set("file", audio, audio.name || "question.webm");
  form.set("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  form.set("response_format", "json");
  let providerStatus: GroqQuotaSnapshot | undefined;
  try {
    const response = await groqFetch("/audio/transcriptions", { method: "POST", body: form, signal: request.signal }, {
      sessionId: String(incoming.get("sessionId") || "voice").slice(0, 120),
      preferredKeyId: String(incoming.get("preferredGroqKeyId") || "").slice(0, 32) || undefined,
      signal: request.signal,
      timeoutMs: 55_000,
      onStatus: (status) => { providerStatus = status; },
    });
    const result = await response.json() as { text?: unknown };
    if (typeof result.text !== "string") throw new ProviderResponseError("Transcription did not contain text");
    request.signal.throwIfAborted();
    return Response.json({ text: result.text, providerStatus }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return providerFailureResponse(error, providerStatus);
  }
}
