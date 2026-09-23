import { normalizeLessonLayout } from "../lib/lesson-layout.ts";
import { applySpatialAutoLayout } from "../lib/tldraw-spatial-layout.ts";

// Test the exact scenario reported by the user:
// The LLM emitted 5 disconnected objects with empty parts:
// "Orbit", "Earth", "Moon", "gravity", "velocity"
console.log("=== Testing Auto-Repair of User's Exact Reported Payload ===");

// We can import repairAndValidateLessonPlan indirectly or test its behavior through a mock
// Let's create the exact raw plan the user encountered:
const userRawPlan = {
  id: "lesson-user-moon",
  title: "Why the Moon Doesn't Fall Into Earth",
  question: "Why does Moon doesn't fall into the Earth when it's attracting it",
  summary: "The Moon orbits Earth due to a balance between its tangential velocity and Earth's gravitational pull.",
  diagramType: "mechanism",
  visualStrategy: "Show Earth, Moon, gravity, velocity and orbit.",
  sources: [],
  objects: [
    { id: "orbit", role: "container", shapeType: "custom", label: "Orbit", labelPlacement: "above", x: 100, y: 100, width: 480, height: 380, parts: [] },
    { id: "earth", role: "subject", shapeType: "geo", label: "Earth", labelPlacement: "inside", x: 600, y: 200, width: 90, height: 90, parts: [] },
    { id: "moon", role: "component", shapeType: "geo", label: "Moon", labelPlacement: "inside", x: 450, y: 220, width: 50, height: 40, parts: [] },
    { id: "gravity", role: "component", shapeType: "geo", label: "gravity", labelPlacement: "inside", x: 450, y: 280, width: 50, height: 40, parts: [] },
    { id: "velocity", role: "component", shapeType: "geo", label: "velocity", labelPlacement: "inside", x: 450, y: 340, width: 50, height: 40, parts: [] },
  ],
  connections: [
    { id: "c1", from: "earth", to: "moon", label: "gravity", color: "red", route: "straight", fromAnchor: "left", toAnchor: "right", arrowhead: "arrow", bend: 0 },
  ],
  segments: [
    { id: "s1", title: "Overview", narration: "You can see an orbit, and a grey color circle as Moon which is revolving around the orbit and at the center there is Earth, and you can see a tangent velocity and you can see a red arrow indicating gravity.", targetIds: ["orbit", "earth", "moon", "gravity", "velocity"], action: "reveal", durationMs: 12000 },
  ],
};

import { repairAndValidateLessonPlan } from "../lib/lesson-layout.ts";

const repaired = repairAndValidateLessonPlan(userRawPlan);
console.log("Repaired objects count:", repaired.objects.length);

for (const obj of repaired.objects) {
  console.log(`\nObject [${obj.id}] label="${obj.label}" shapeType=${obj.shapeType} w=${obj.width} h=${obj.height}`);
  console.log(`  Parts count: ${obj.parts.length}`);
  for (const p of obj.parts) {
    console.log(`    - type=${p.type} data="${p.data}" fill=${p.fill} stroke=${p.stroke} text="${p.text}"`);
  }
}

// Check assertions:
const masterOrbit = repaired.objects.find((o) => o.id === "moon-earth-orbital-system");
if (!masterOrbit || !masterOrbit.parts.some((p) => p.type === "orbit" && p.data === "celestial-moon-earth")) {
  throw new Error("FAILED: Master orbital system not found or celestial-moon-earth part missing!");
}

const vectorBalance = repaired.objects.find((o) => o.id === "vector-force-balance");
if (!vectorBalance || vectorBalance.parts.length < 3) {
  throw new Error("FAILED: Vector force balance explainer missing or incomplete!");
}

if (repaired.objects.length !== 2) {
  throw new Error(`FAILED: Expected exactly 2 consolidated unified objects, got ${repaired.objects.length}!`);
}


for (const seg of repaired.segments) {
  if (seg.targetIds.includes("earth") || seg.targetIds.includes("moon") || seg.targetIds.includes("orbit")) {
    throw new Error("FAILED: Segment still targeting stale fragmented IDs!");
  }
}

console.log("\nTesting full normalizeLessonLayout(userRawPlan)...");
const normalized = normalizeLessonLayout(userRawPlan);
console.log("Normalized objects count:", normalized.objects.length);
for (const obj of normalized.objects) {
  console.log(`- [${obj.id}] x=${obj.x} y=${obj.y} w=${obj.width} h=${obj.height} label="${obj.label}"`);
}
console.log("Normalized connections:", normalized.connections);

console.log("\n=================================================================");
console.log("SUCCESS: 5 fragmented cards are CONSOLIDATED into 2 unified systems!");
console.log("Living Moon-Earth Orbit + Vector Force Balance verified!");
console.log("=================================================================");

