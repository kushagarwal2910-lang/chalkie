import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";
import { applyElkLayout } from "../lib/elk-spatial-layout.ts";
import { formatNarrationForSpeech } from "../lib/speech-formatter.ts";
import { createDemoLesson } from "../lib/demo-lesson.ts";

console.log("=== 1. Testing formatNarrationForSpeech ===");
const testNarration = "At the input layer, feature values x₁ through x₃ flow into h₁ through h₄ with weights W₁ and output ŷ, then ΔW adjusts weights via ∂L/∂W and ½ (y - ŷ)².";
const spoken = formatNarrationForSpeech(testNarration);
console.log("Original:", testNarration);
console.log("Spoken:  ", spoken);
if (!spoken.includes("x 1") || !spoken.includes("h 1") || !spoken.includes("y-hat") || !spoken.includes("delta W") || !spoken.includes("one-half")) {
  throw new Error("Speech formatter failed to expand mathematical symbols!");
}
console.log("✓ formatNarrationForSpeech passed!");

console.log("\n=== 2. Testing Neural Network Lesson Consolidation ===");
const rawDemo = createDemoLesson("How a Neural Network Learns");
// Add an extra fake LLM fragment (like the old stray "Loss" box) to test that repair filters it out
rawDemo.objects.push({
  id: "stray-loss-box",
  role: "formula",
  shapeType: "custom",
  label: "Loss",
  labelPlacement: "above",
  x: 500,
  y: 100,
  width: 200,
  height: 150,
  parts: [{ type: "rect", x: 10, y: 10, width: 180, height: 130, fill: "slate", stroke: "blue", strokeWidth: 1.5, opacity: 0.7, data: "", text: "" }],
});

const repaired = repairAndValidateLessonPlan(rawDemo);
console.log("Repaired objects count:", repaired.objects.length);
console.log("Object IDs:", repaired.objects.map(o => o.id));

if (repaired.objects.length !== 4) {
  throw new Error(`Expected exactly 4 consolidated objects, found ${repaired.objects.length}`);
}
if (repaired.objects.some(o => o.id === "stray-loss-box" || o.label.toLowerCase() === "loss")) {
  throw new Error("Stray loss box was NOT filtered out!");
}
console.log("✓ Stray fragments successfully eliminated!");

console.log("\n=== 3. Testing Layout Normalization & ELK Layout ===");
const normalized = normalizeLessonLayout(repaired);
const laidOut = await applyElkLayout(normalized);

console.log("Laid out objects:");
for (const obj of laidOut.objects) {
  console.log(`- ${obj.id} (${obj.label}): x=${Math.round(obj.x)}, y=${Math.round(obj.y)}, w=${Math.round(obj.width)}, h=${Math.round(obj.height)}`);
}

// Check formula parts coordinate order (verify Loss is NOT at y=12 under the title!)
const formula = laidOut.objects.find(o => o.id === "nn-formula-loss");
console.log("\nFormula parts:");
for (const p of formula.parts) {
  console.log(`  [${p.type}] y=${p.y}, text="${p.text || ''}"`);
}

const firstText = formula.parts.find(p => p.type === "text");
if (firstText && firstText.y < 50) {
  throw new Error(`Formula text shifted too high (y=${firstText.y}), will collide with title pill!`);
}

console.log("\n=== 4. Testing Segments Audio-Visual Alignment ===");
console.log("Segments count:", laidOut.segments.length);
for (const seg of laidOut.segments) {
  console.log(`- ${seg.title} -> target: [${seg.targetIds.join(', ')}]`);
  console.log(`  Narration: "${seg.narration}"`);
}

if (laidOut.segments.length !== 4) {
  throw new Error(`Expected 4 segments, found ${laidOut.segments.length}`);
}
if (laidOut.segments[0].targetIds[0] !== "nn-input-layer") throw new Error("Segment 0 target mismatch!");
if (laidOut.segments[1].targetIds[0] !== "nn-hidden-layer") throw new Error("Segment 1 target mismatch!");
if (laidOut.segments[2].targetIds[0] !== "nn-output-layer") throw new Error("Segment 2 target mismatch!");
if (laidOut.segments[3].targetIds[0] !== "nn-formula-loss") throw new Error("Segment 3 target mismatch!");

console.log("\n✓ ALL TESTS PASSED SUCCESSFULLY!");
