import { NextRequest } from "next/server";
import { z } from "zod";
import { createDemoLesson } from "@/lib/demo-lesson";
import { createLessonWithGroq } from "@/lib/groq";
import { GroqFreeLimitError, type GroqCallOptions } from "@/lib/groq-pool";
import { resolveProviderCredentials } from "@/lib/provider-credentials";
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

function event(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch (error) {
    return Response.json({ error: "Invalid lesson request", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (type: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(event(type, data))); }
        catch { closed = true; }
      };
      try {
        send("status", { stage: "understanding", message: "Understanding the question" });
        const credentials = await resolveProviderCredentials();
        const liveMode = credentials.groqKeys.length > 0;
        const groqOptions: GroqCallOptions = {
          sessionId: input.sessionId,
          preferredKeyId: input.preferredGroqKeyId,
          onStatus: (status) => send("provider_status", status),
        };

        if (!liveMode) {
          const isDemoPrompt = /neural network|deep learning/i.test(input.question);
          if (isDemoPrompt) {
            send("status", { stage: "research", message: "Running the built-in demo lesson" });
            await new Promise((resolve) => setTimeout(resolve, 250));
            send("status", { stage: "visualizing", message: "Planning the visual story" });
            await new Promise((resolve) => setTimeout(resolve, 250));
            send("lesson", { lesson: createDemoLesson(input.question), mode: "demo" });
            send("done", { ok: true });
            controller.close();
            return;
          }

          send("provider_status", { source: "none", allUnavailable: true, degradationReason: "no_keys", keys: [] });
          send("error", {
            code: "NO_KEYS_CONFIGURED",
            message: "No Groq API keys configured. Click the key icon in the top right to add your Groq key so Chalkie can research and generate a visual lesson for this topic.",
          });
          controller.close();
          return;
        }

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

        send("status", { stage: "visualizing", message: "Designing a sparse visual explanation" });
        const lesson = await createLessonWithGroq(input.question, context || "No web context supplied. Use stable general knowledge and state uncertainty.", sources, groqOptions);
        send("lesson", { lesson: { ...lesson, sources }, mode: "live" });
        send("done", { ok: true });
      } catch (error) {
        if (error instanceof GroqFreeLimitError) {
          send("provider_status", error.quota);
          send("error", { code: error.code, message: error.message });
          return;
        }
        console.error("[chalkie] lesson generation failed", error);
        const message = error instanceof Error ? error.message : "Lesson generation failed";
        send("error", { message: /Groq request failed|JSON|validation|scene graph/i.test(message) ? "Chalkie could not finish that visual plan. Please try again." : message });
      } finally {
        if (!closed) try { controller.close(); } catch { /* stream already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
