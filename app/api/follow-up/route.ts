import { NextRequest } from "next/server";
import { z } from "zod";
import { createFollowUpWithGroq } from "@/lib/groq";
import { GroqFreeLimitError, type GroqCallOptions } from "@/lib/groq-pool";
import { lessonPlanSchema } from "@/lib/lesson-schema";
import { retrieveSessionContext } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  question: z.string().trim().min(2).max(1000),
  sessionId: z.string().trim().min(1).max(120),
  preferredGroqKeyId: z.string().trim().max(32).optional(),
  currentLesson: lessonPlanSchema,
});

function event(type: string, data: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid follow-up request" }, { status: 400 });
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
        const groqOptions: GroqCallOptions = {
          sessionId: input.sessionId,
          preferredKeyId: input.preferredGroqKeyId,
          onStatus: (status) => send("provider_status", status),
        };
        send("status", { stage: "understanding", message: "Understanding your doubt" });
        send("status", { stage: "retrieving", message: "Retrieving from this lesson's research index" });
        const research = await retrieveSessionContext(input.question, input.sessionId, input.currentLesson.sources, groqOptions);
        send("status", {
          stage: "checking_canvas",
          message: research.indexed ? "Checking the indexed evidence against the current canvas" : "Checking saved source evidence against the current canvas",
        });

        const plan = await createFollowUpWithGroq(
          input.question,
          research.context,
          research.sources,
          input.currentLesson,
          groqOptions,
        );
        send("decision", { coverage: plan.coverage, targetIds: plan.targetIds, title: plan.title });

        if (plan.coverage === "append") {
          send("status", { stage: "sketching", message: "Preparing a connected visual beside the lesson" });
          for (const [index, object] of plan.objects.entries()) {
            send("sketch", { index, total: plan.objects.length, id: object.id, label: object.label });
            await new Promise((resolve) => setTimeout(resolve, 45));
          }
        } else {
          send("status", { stage: "pointing", message: "The answer is already on the board—lining up the laser" });
        }

        send("followup", { plan });
        send("done", { ok: true });
      } catch (error) {
        if (error instanceof GroqFreeLimitError) {
          send("provider_status", error.quota);
          send("error", { code: error.code, message: error.message });
          return;
        }
        console.error("[chalkie] follow-up failed", error);
        send("error", { message: "Chalkie could not finish that follow-up. Please ask again." });
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
