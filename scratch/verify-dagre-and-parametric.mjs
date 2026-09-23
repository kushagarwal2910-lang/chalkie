import { applySpatialAutoLayout } from "../lib/tldraw-spatial-layout.ts";
import { normalizeLessonLayout } from "../lib/lesson-layout.ts";
import { visualPartSchema } from "../lib/lesson-schema.ts";

console.log("=== STEP 1: Verify visualPartSchema with new primitives ===");
const testParts = [
  { type: "orbit", data: "4", width: 260, height: 260, stroke: "slate" },
  { type: "cluster", data: "protons:6|neutrons:6", width: 100, height: 100, fill: "red", stroke: "blue" },
  { type: "quarks", data: "u,u,d", width: 120, height: 120 }
];

for (const p of testParts) {
  const parsed = visualPartSchema.parse(p);
  console.log(`✓ Part ${p.type} parsed successfully:`, parsed.type, `data="${parsed.data}"`);
}

console.log("\n=== STEP 2: Verify Atom lesson with Dagre Auto-Layout ===");
const mockAtomLesson = {
  id: "atom-structure-overview",
  title: "Atom Structure Overview",
  question: "How is an atom structured?",
  summary: "Comprehensive view of the atom, nucleus, and subatomic quarks.",
  diagramType: "structure",
  visualStrategy: "Bohr orbital model connected to proton and neutron quark close-ups",
  sources: [],
  objects: [
    {
      id: "atom-overview",
      label: "Atom Structure",
      role: "container",
      shapeType: "custom",
      width: 440,
      height: 320,
      x: 0,
      y: 0,
      parts: [
        { type: "cluster", data: "protons:6|neutrons:6", fill: "red", stroke: "blue", width: 100, height: 100, x: 170, y: 110 },
        { type: "orbit", data: "2", stroke: "slate", width: 200, height: 200, x: 120, y: 60 },
        { type: "orbit", data: "4", stroke: "slate", width: 300, height: 300, x: 70, y: 10 }
      ]
    },
    {
      id: "proton-node",
      label: "Proton (uud)",
      role: "component",
      shapeType: "custom",
      width: 140,
      height: 140,
      x: 0,
      y: 0,
      parts: [
        { type: "ellipse", width: 130, height: 130, x: 5, y: 5, fill: "none", stroke: "ink", strokeWidth: 2 },
        { type: "quarks", data: "u,u,d", width: 120, height: 120, x: 10, y: 10 }
      ]
    },
    {
      id: "neutron-node",
      label: "Neutron (udd)",
      role: "component",
      shapeType: "custom",
      width: 140,
      height: 140,
      x: 0,
      y: 0,
      parts: [
        { type: "ellipse", width: 130, height: 130, x: 5, y: 5, fill: "none", stroke: "ink", strokeWidth: 2 },
        { type: "quarks", data: "u,d,d", width: 120, height: 120, x: 10, y: 10 }
      ]
    }
  ],
  connections: [
    { id: "c1", from: "atom-overview", to: "proton-node", label: "" },
    { id: "c2", from: "atom-overview", to: "neutron-node", label: "" }
  ],
  segments: [
    { id: "s1", title: "Atom and Nucleus", narration: "The atom consists of a dense nucleus surrounded by orbiting electron shells.", durationMs: 6000, targetIds: ["atom-overview"] },
    { id: "s2", title: "Protons and Neutrons", narration: "Zooming in, protons and neutrons are composed of valence quarks.", durationMs: 7000, targetIds: ["proton-node", "neutron-node"] }
  ]
};

// Normalize
const normalized = normalizeLessonLayout(mockAtomLesson);
console.log(`✓ Normalized lesson: ${normalized.objects.length} objects, ${normalized.connections.length} connections`);

// Mock Editor
const mockEditor = {
  getViewportPageBounds: () => ({ minX: 40, minY: 40, width: 1280, height: 800 }),
  getCurrentPageShapes: () => [],
  getShapePageBounds: () => null,
};

// Apply Dagre Spatial Layout
const layouted = applySpatialAutoLayout(mockEditor, normalized);
console.log(`\n=== STEP 3: Validate Placed Objects & Collisions ===`);
for (const obj of layouted.objects) {
  console.log(`- ${obj.id} ("${obj.label}"): pos=(${obj.x}, ${obj.y}), size=(${obj.width}x${obj.height}) -> bounds [${obj.x}, ${obj.y}, ${obj.x+obj.width}, ${obj.y+obj.height}]`);
}

console.log(`\n=== STEP 4: Validate Routed Connections ===`);
for (const conn of layouted.connections) {
  console.log(`- ${conn.id}: ${conn.from} (${conn.fromAnchor}) -> ${conn.to} (${conn.toAnchor}), bend=${conn.bend}`);
}

// Overlap check
let collisions = 0;
for (let i = 0; i < layouted.objects.length; i++) {
  for (let j = i + 1; j < layouted.objects.length; j++) {
    const a = layouted.objects[i];
    const b = layouted.objects[j];
    const collide = a.x < b.x + b.width + 16 && a.x + a.width + 16 > b.x && a.y < b.y + b.height + 16 && a.y + a.height + 16 > b.y;
    if (collide) {
      console.error(`❌ Collision found between ${a.id} and ${b.id}`);
      collisions++;
    }
  }
}

if (collisions === 0) {
  console.log(`\n✓ SUCCESS: ZERO COLLISIONS! All objects have guaranteed clearance and clean arrow docking.`);
} else {
  console.error(`\n❌ FAILED: ${collisions} collisions detected.`);
  process.exit(1);
}
