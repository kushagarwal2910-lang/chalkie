import { getGroqClient, createLessonWithGroq } from "../lib/groq.ts";

const question = "how does indus valley people used to live explain their city planning";
console.log("Generating sample lesson for:", question);

try {
  const lesson = await createLessonWithGroq(question, "Indus Valley civilization city planning, citadel, lower town, great bath, drainage system.", []);
  console.log("\nLesson Title:", lesson.title);
  console.log("Diagram Type:", lesson.diagramType);
  console.log("Objects count:", lesson.objects.length);
  console.log("\nObjects generated:");
  for (const obj of lesson.objects) {
    console.log(`- [${obj.id}] role=${obj.role} shapeType=${obj.shapeType} x=${obj.x} y=${obj.y} w=${obj.width} h=${obj.height} parts=${obj.parts.length} label="${obj.label}"`);
    for (const p of obj.parts) {
      console.log(`    part: type=${p.type} x=${p.x} y=${p.y} w=${p.width} h=${p.height} fill=${p.fill} stroke=${p.stroke}`);
    }
  }
} catch (err) {
  console.error("Error:", err);
}
