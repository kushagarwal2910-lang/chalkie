import { groqFetch, GroqFreeLimitError, type GroqQuotaSnapshot } from "@/lib/groq-pool";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const incoming = await request.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "An audio file is required" }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return Response.json({ error: "Audio must be smaller than 25 MB" }, { status: 413 });

  const form = new FormData();
  form.set("file", audio, audio.name || "question.webm");
  form.set("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  form.set("response_format", "json");

  let providerStatus: GroqQuotaSnapshot | undefined;
  try {
    const response = await groqFetch("/audio/transcriptions", {
      method: "POST",
      body: form,
    }, {
      sessionId: String(incoming.get("sessionId") || "voice"),
      preferredKeyId: String(incoming.get("preferredGroqKeyId") || "") || undefined,
      timeoutMs: 55_000,
      onStatus: (status) => { providerStatus = status; },
    });
    return Response.json({ ...(await response.json()) as Record<string, unknown>, providerStatus });
  } catch (error) {
    if (error instanceof GroqFreeLimitError) return Response.json({ error: error.message, code: error.code, providerStatus: error.quota }, { status: 429 });
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }
}
