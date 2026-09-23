// Test payload that caused the real-world failure in the server log:
// - fill: "gray"
// - labelPlacement: "right" / "left"
// - sources[0].score: 85
// - objects with 2 parts (previously flagged as "Sparse visual objects")
// - untaught objects (previously flagged as "Untaught visual objects")

export const sampleFailingPayload = {
  id: "rocket-launch-scene",
  title: "Rocket Launch Mechanism",
  question: "how does rocket gets launched from earth",
  summary: "A rocket generates massive thrust to overcome gravity via staged propulsion.",
  diagramType: "mechanism",
  visualStrategy: "Exploded cutaway of the multi-stage rocket and launch platform",
  sources: [
    {
      id: "src-1",
      title: "NASA Rocket Basics",
      url: "https://nasa.gov/rocket-basics",
      publisher: "NASA",
      summary: "Newton's third law in action.",
      score: 85, // <= FAILED with maximum: 1
    },
  ],
  objects: [
    {
      id: "launch-pad",
      role: "environment",
      shapeType: "custom",
      label: "Launch Platform",
      labelPlacement: "below",
      x: 100,
      y: 500,
      width: 400,
      height: 100,
      parts: [
        {
          type: "rect",
          x: 0,
          y: 0,
          width: 400,
          height: 100,
          data: "",
          text: "",
          fill: "gray", // <= FAILED with invalid_enum_value
          stroke: "slate",
          strokeWidth: 2,
          opacity: 1,
        },
      ],
    },
    {
      id: "rocket-macro", // <= FAILED with "Sparse visual objects"
      role: "subject",
      shapeType: "custom",
      label: "Multi-Stage Rocket",
      labelPlacement: "right", // <= FAILED with invalid_enum_value
      x: 200,
      y: 100,
      width: 200,
      height: 400,
      parts: [
        {
          type: "rect",
          x: 50,
          y: 50,
          width: 100,
          height: 300,
          data: "",
          text: "",
          fill: "white",
          stroke: "ink",
          strokeWidth: 3,
          opacity: 1,
        },
        {
          type: "polygon",
          x: 50,
          y: 0,
          width: 100,
          height: 50,
          data: "0,50 50,0 100,50",
          text: "",
          fill: "red",
          stroke: "ink",
          strokeWidth: 2,
          opacity: 1,
        },
      ],
    },
    {
      id: "engine-macro", // <= FAILED with "Sparse visual objects" and untaught
      role: "component",
      shapeType: "custom",
      label: "Rocket Engine",
      labelPlacement: "left", // <= FAILED with invalid_enum_value
      x: 220,
      y: 420,
      width: 160,
      height: 100,
      parts: [
        {
          type: "path",
          x: 30,
          y: 10,
          width: 100,
          height: 80,
          data: "M 20 0 L 80 0 L 95 70 L 5 70 Z",
          text: "",
          fill: "gray", // <= FAILED
          stroke: "orange",
          strokeWidth: 2,
          opacity: 1,
        },
      ],
    },
  ],
  connections: [
    {
      id: "c1",
      from: "engine-macro",
      to: "launch-pad",
      label: "Exhaust Thrust",
      color: "orange",
      route: "straight",
      fromAnchor: "bottom",
      toAnchor: "top",
      arrowhead: "arrow",
      bend: 0,
    },
  ],
  segments: [
    {
      id: "seg-1",
      title: "Ignition",
      narration: "The engine ignites, building immense downward thrust.",
      targetIds: ["rocket-macro"], // <= untaught engine-macro and launch-pad
      action: "focus",
      durationMs: 4000,
    },
    {
      id: "seg-2",
      title: "Liftoff",
      narration: "Overcoming gravity, the rocket clears the pad.",
      targetIds: ["rocket-macro"],
      action: "move",
      durationMs: 5000,
    },
  ],
};

console.log("Sample test payload ready");

import { lessonPlanSchema } from "../lib/lesson-schema.ts";
import { normalizeLessonLayout } from "../lib/lesson-layout.ts";

try {
  console.log("1. Parsing with resilient schema...");
  const parsed = lessonPlanSchema.parse(sampleFailingPayload);
  console.log("✓ Schema parsed successfully!");
  console.log("  - Source score normalized to:", parsed.sources[0].score);
  console.log("  - Launch pad fill:", parsed.objects[0].parts[0].fill);
  console.log("  - Rocket labelPlacement:", parsed.objects[1].labelPlacement);
  console.log("  - Engine labelPlacement:", parsed.objects[2].labelPlacement);

  console.log("\n2. Normalizing layout...");
  const layout = normalizeLessonLayout(parsed);
  console.log("✓ Layout normalized successfully!");
  console.log("  - Objects count:", layout.objects.length);
  console.log("  - Connections count:", layout.connections.length);
  console.log("  - Segments count:", layout.segments.length);
  console.log("\nALL TESTS PASSED!");
} catch (e) {
  console.error("Test failed:", e);
  process.exit(1);
}


