import type { NextRequest } from "next/server";
import { z } from "zod";
import { createLessonWithGroq } from "@/lib/groq";
import { GroqFreeLimitError, type GroqCallOptions } from "@/lib/groq-pool";
import { resolveProviderCredentials } from "@/lib/provider-credentials";
import { providerEventStream } from "@/lib/provider-response";
import { researchQuestion } from "@/lib/research";
import type { ResearchSource } from "@/lib/lesson-schema";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  sessionId: z.string().trim().min(1).max(120).optional(),
  preferredGroqKeyId: z.string().trim().max(32).optional(),
  useWeb: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid lesson request", code: "INVALID_REQUEST", message: "Enter a question between 3 and 1000 characters.", retryable: false }, { status: 400 }); }

  return providerEventStream(request, async (send, signal) => {
    send("status", { stage: "understanding", message: "Understanding the question" });
    const credentials = await resolveProviderCredentials();
    signal.throwIfAborted();
    if (!credentials.groqKeys.length) {
      throw new GroqFreeLimitError({ source: credentials.source, allUnavailable: true, degradationReason: "no_keys", keys: [] });
    }
    const groqOptions: GroqCallOptions = {
      sessionId: input.sessionId,
      preferredKeyId: input.preferredGroqKeyId,
      signal,
      timeoutMs: 180_000,
      onStatus: (status) => send("provider_status", status),
    };
    let sources: ResearchSource[] = [];
    let context = "";
    if (input.useWeb && credentials.tavilyKey) {
      send("status", { stage: "research", message: "Searching and deduplicating up to 20 sources" });
      const research = await researchQuestion(input.question, input.sessionId ?? crypto.randomUUID(), groqOptions);
      sources = research.sources;
      context = research.context;
      send("sources", { sources, indexed: true });
      send("status", { stage: "ranking", message: `Indexed ${sources.length} sources · combining semantic and lexical relevance` });
    }
    send("status", { stage: "visualizing", message: "Designing a visual explanation" });
    const lesson = await createLessonWithGroq(input.question, context || "No web context supplied. Use stable general knowledge and state uncertainty.", sources, groqOptions);
    send("lesson", { lesson: { ...lesson, sources }, mode: "live" });
  });
}
