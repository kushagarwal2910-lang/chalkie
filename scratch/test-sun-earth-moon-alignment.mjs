import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";

console.log("=== Testing Sun -> Earth -> Moon Case ===");

// Emulating what an LLM might return for "explain solar eclipse" or "Sun Earth Moon alignment"
const rawPlan = {
  id: "lesson-sun-earth-moon",
  title: "Sun, Earth, and Moon System",
  question: "Explain the alignment of Sun, Earth, and Moon during an eclipse",
  summary: "The Sun, Earth, and Moon form linear alignments producing solar and lunar eclipses.",
  diagramType: "mechanism",
  visualStrategy: "Show Sun illuminating Earth and Moon in alignment.",
  sources: [],
  objects: [
    // Often LLMs emit a container for the title or alignment floating at top right
    { id: "align-container", role: "container", shapeType: "custom", label: ": Sun -> Earth -> Moon (Eclipse Alignment)", x: 1050, y: 50, width: 240, height: 160, parts: [] },
    // Sun marked as container or subject
    { id: "sun", role: "container", shapeType: "custom", label: "Sun", x: 100, y: 150, width: 160, height: 160, parts: [] },
    // Earth
    { id: "earth", role: "subject", shapeType: "custom", label: "Earth", x: 450, y: 150, width: 160, height: 160, parts: [] },
    // Moon
    { id: "moon", role: "component", shapeType: "custom", label: "Moon", x: 750, y: 160, width: 140, height: 140, parts: [] },
  ],
  connections: [
    { id: "c1", from: "sun", to: "earth", label: "sunlight", color: "yellow", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
    { id: "c2", from: "earth", to: "moon", label: "shadow", color: "blue", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
  ],
  segments: [
    { id: "s1", title: "The Sun", narration: "The Sun emits light.", targetIds: ["sun"], action: "reveal", durationMs: 5000 },
    { id: "s2", title: "Earth & Moon Alignment", narration: "Earth casts a shadow onto the Moon.", targetIds: ["earth", "moon"], action: "trace", durationMs: 6000 },
  ],
};

const repaired = repairAndValidateLessonPlan(rawPlan);

console.log("Repaired objects count:", repaired.objects.length);
for (const obj of repaired.objects) {
  console.log(`- [${obj.id}] role=${obj.role} label="${obj.label}" parts=${obj.parts.length}`);
  for (const p of obj.parts) {
    console.log(`    part: type=${p.type} data="${p.data}" text="${p.text}" fill=${p.fill}`);
  }
}

// 1. Check that Sun was reclassified from container to subject
const sunObj = repaired.objects.find((o) => o.id === "sun");
if (!sunObj || sunObj.role === "container") {
  throw new Error("FAILED: Sun was not reclassified to subject!");
}
if (!sunObj.parts.some((p) => p.data === "sun" && p.text === "Sun")) {
  throw new Error("FAILED: Sun parts were not synthesized with data='sun' and text='Sun'!");
}
console.log("✓ Sun reclassified to subject with authentic sun parts!");

// 2. Check that Earth does NOT have data: celestial-moon-earth
const earthObj = repaired.objects.find((o) => o.id === "earth");
if (earthObj.parts.some((p) => p.data === "celestial-moon-earth")) {
  throw new Error("FAILED: Earth was incorrectly injected with celestial-moon-earth sub-system!");
}
console.log("✓ Earth has clean celestial parts without duplicate moon-earth perpetual simulation!");

// 3. Normalize layout
const normalized = normalizeLessonLayout(repaired);
console.log("\nNormalized objects count:", normalized.objects.length);
for (const obj of normalized.objects) {
  console.log(`- [${obj.id}] role=${obj.role} label="${obj.label}" x=${obj.x} y=${obj.y} w=${obj.width} h=${obj.height}`);
}

// Check that empty container "align-container" was pruned!
if (normalized.objects.some((o) => o.id === "align-container")) {
  throw new Error("FAILED: Ghost empty container 'align-container' was not pruned!");
}
console.log("✓ Ghost container was pruned from final objects!");

// Check that labels do not have leading colons
for (const obj of normalized.objects) {
  if (/^[:\s\-—]+/.test(obj.label)) {
    throw new Error(`FAILED: Object [${obj.id}] label "${obj.label}" still has leading punctuation!`);
  }
}
console.log("✓ All object labels cleanly stripped of leading punctuation!");

console.log("\n=================================================================");
console.log("ALL SUN -> EARTH -> MOON VERIFICATIONS PASSED!");
console.log("=================================================================");
