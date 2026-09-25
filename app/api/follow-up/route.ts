import type { NextRequest } from "next/server";
import { z } from "zod";
import { createFollowUpWithGroq } from "@/lib/groq";
import type { GroqCallOptions } from "@/lib/groq-pool";
import { providerEventStream } from "@/lib/provider-response";
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

export async function POST(request: NextRequest) {
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid follow-up request", code: "INVALID_REQUEST", message: "The follow-up request or current lesson is invalid.", retryable: false }, { status: 400 }); }

  return providerEventStream(request, async (send, signal) => {
    const groqOptions: GroqCallOptions = {
      sessionId: input.sessionId,
      preferredKeyId: input.preferredGroqKeyId,
      signal,
      timeoutMs: 180_000,
      onStatus: (status) => send("provider_status", status),
    };
    send("status", { stage: "understanding", message: "Understanding your doubt" });
    send("status", { stage: "retrieving", message: "Retrieving from this lesson's research index" });
    const research = await retrieveSessionContext(input.question, input.sessionId, input.currentLesson.sources, groqOptions);
    send("status", { stage: "checking_canvas", message: research.indexed ? "Checking the indexed evidence against the current canvas" : "Checking saved source evidence against the current canvas" });
    const plan = await createFollowUpWithGroq(input.question, research.context, research.sources, input.currentLesson, groqOptions);
    send("decision", { coverage: plan.coverage, targetIds: plan.targetIds, title: plan.title });
    if (plan.coverage === "append") {
      send("status", { stage: "sketching", message: "Preparing a connected visual beside the lesson" });
      for (const [index, object] of plan.objects.entries()) {
        send("sketch", { index, total: plan.objects.length, id: object.id, label: object.label });
      }
    } else {
      send("status", { stage: "pointing", message: "The answer is already on the board—lining up the laser" });
    }
    send("followup", { plan });
  });
}
