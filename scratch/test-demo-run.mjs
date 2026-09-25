import { createDemoLesson } from "../lib/demo-lesson.ts";
import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";
import { applyElkLayout } from "../lib/elk-spatial-layout.ts";

async function main() {
  const raw = createDemoLesson();
  console.log("Raw diagramType:", raw.diagramType);
  console.log("Raw objects:", raw.objects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })));
  
  const repaired = repairAndValidateLessonPlan(raw);
  console.log("Repaired objects count:", repaired.objects.length);
  
  const normalized = normalizeLessonLayout(repaired);
  console.log("Normalized objects:", normalized.objects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })));
  
  const elked = await applyElkLayout(normalized);
  console.log("ELK objects:", elked.objects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })));
  console.log("ELK connections:", elked.connections);
}

main().catch(console.error);
