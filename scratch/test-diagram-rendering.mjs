import { normalizeLessonLayout } from '../lib/lesson-layout.ts';

// Test a simulated hydraulic lesson plan with sparse/offset coordinates and containers
const sampleLesson = {
  id: "test-hydraulic-system",
  title: "How a Hydraulic System Multiplies Force",
  question: "How does a hydraulic system multiply force?",
  summary: "Pascal's principle states that pressure applied to an enclosed fluid is transmitted undiminished.",
  diagramType: "mechanism",
  visualStrategy: "Show a fluid chamber connecting a small input piston to a large output piston",
  sources: [],
  objects: [
    {
      id: "chamber",
      role: "container",
      label: "Hydraulic Chamber with Fluid Volume",
      labelPlacement: "above",
      x: 100,
      y: 120,
      width: 700,
      height: 380,
      parts: [
        // Part emitted with 0 strokeWidth or white stroke to test auto-highlighting
        { type: "rect", x: 0, y: 0, width: 700, height: 380, fill: "cyan", stroke: "white", strokeWidth: 0, opacity: 0.1, data: "", text: "" },
      ],
    },
    {
      id: "input-piston",
      role: "input",
      label: "Input Piston (A1)",
      labelPlacement: "below",
      x: 120,
      y: 180,
      width: 120,
      height: 180,
      parts: [
        // Part emitted with canvas-relative coordinates (x=130, y=190)
        { type: "rect", x: 130, y: 190, width: 80, height: 140, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, data: "", text: "" },
      ],
    },
    {
      id: "output-piston",
      role: "output",
      label: "Output Piston (A2)",
      labelPlacement: "below",
      x: 580,
      y: 140,
      width: 200,
      height: 240,
      parts: [
        { type: "rect", x: 10, y: 10, width: 180, height: 200, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, data: "", text: "" },
      ],
    },
  ],
  connections: [
    {
      id: "fluid-link",
      from: "input-piston",
      to: "output-piston",
      label: "pressure transmission",
      color: "blue",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
  ],
  segments: [
    {
      id: "step-1",
      title: "Input Force",
      narration: "A small force applied to the input piston creates pressure.",
      targetIds: ["input-piston"],
      action: "focus",
      durationMs: 4000,
    },
    {
      id: "step-2",
      title: "Pressure Transmission",
      narration: "Pressure is transmitted undiminished through the fluid.",
      targetIds: ["chamber"],
      action: "reveal",
      durationMs: 4000,
    },
    {
      id: "step-3",
      title: "Force Multiplication",
      narration: "The larger area yields a multiplied output force.",
      targetIds: ["output-piston"],
      action: "reveal",
      durationMs: 4000,
    },
  ],
};

console.log("Normalizing layout...");
const normalized = normalizeLessonLayout(sampleLesson);

for (const obj of normalized.objects) {
  console.log(`\nObject [${obj.id}] (role: ${obj.role}):`);
  console.log(`  Position: (${obj.x}, ${obj.y}), Size: ${obj.width}x${obj.height}`);
  for (const [i, p] of obj.parts.entries()) {
    console.log(`  Part ${i} [${p.type}]: at (${p.x}, ${p.y}), size: ${p.width}x${p.height}, stroke: ${p.stroke} (w: ${p.strokeWidth}), opacity: ${p.opacity}`);
    if (p.width <= 0 || p.height <= 0) {
      console.error(`  ERROR: Part ${i} has zero or negative dimension!`);
      process.exit(1);
    }
    if (p.x < 0 || p.y < 0 || p.x > obj.width || p.y > obj.height) {
      console.error(`  ERROR: Part ${i} coordinates outside parent object!`);
      process.exit(1);
    }
  }
}

console.log("\nAll visual objects and parts successfully validated with positive non-zero boundaries!");
