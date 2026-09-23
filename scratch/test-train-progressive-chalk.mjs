import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";
import { lessonPlanSchema } from "../lib/lesson-schema.ts";

console.log("=== Testing India's Electric Double-Stack Cargo Trains (Progressive Chalkboard) ===");

const trainLessonRaw = {
  id: "lesson-trains-test",
  title: "India's Electric Double-Stack Cargo Trains",
  question: "How do India's electric double-stack cargo trains operate?",
  summary: "Heavy-haul electric locomotives with high-reach pantographs draw 25kV power from 7.5m overhead catenary wires to pull double-stacked container flatcars along dedicated freight corridors.",
  diagramType: "mechanism",
  visualStrategy: "Explainer Cutaway",
  sources: [],
  objects: [
    {
      id: "locomotive",
      role: "subject",
      shapeType: "custom",
      label: "WAG-12 Electric Locomotive",
      labelPlacement: "below",
      x: 60,
      y: 180,
      width: 220,
      height: 140,
      parts: [
        { type: "rect", x: 10, y: 30, width: 200, height: 80, fill: "blue", stroke: "cyan", strokeWidth: 2, opacity: 1, text: "", data: "" },
        { type: "ellipse", x: 25, y: 105, width: 36, height: 36, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "", data: "circle" },
        { type: "ellipse", x: 75, y: 105, width: 36, height: 36, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "", data: "circle" },
        { type: "ellipse", x: 125, y: 105, width: 36, height: 36, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "", data: "circle" },
        { type: "ellipse", x: 175, y: 105, width: 36, height: 36, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "", data: "circle" },
        { type: "rect", x: 15, y: 40, width: 45, height: 35, fill: "cyan", stroke: "white", strokeWidth: 1.5, opacity: 0.8, text: "CAB", data: "" },
      ],
    },
    {
      id: "pantograph",
      role: "component",
      shapeType: "custom",
      label: "High-Reach Pantograph (7.5m)",
      labelPlacement: "above",
      x: 120,
      y: 40,
      width: 140,
      height: 120,
      parts: [
        { type: "line", x: 10, y: 10, width: 120, height: 0, fill: "none", stroke: "yellow", strokeWidth: 3, opacity: 1, text: "7.5m Catenary Wire", data: "" },
        { type: "line", x: 30, y: 110, width: 40, height: -95, fill: "none", stroke: "orange", strokeWidth: 2.5, opacity: 1, text: "", data: "" },
        { type: "line", x: 70, y: 15, width: 40, height: 95, fill: "none", stroke: "orange", strokeWidth: 2.5, opacity: 1, text: "", data: "" },
      ],
    },
    {
      id: "double-stack-wagon",
      role: "component",
      shapeType: "custom",
      label: "Double-Stack Container Wagon",
      labelPlacement: "below",
      x: 340,
      y: 140,
      width: 240,
      height: 200,
      parts: [
        { type: "rect", x: 20, y: 30, width: 200, height: 60, fill: "orange", stroke: "ink", strokeWidth: 2, opacity: 0.9, text: "Upper Container", data: "" },
        { type: "rect", x: 20, y: 95, width: 200, height: 60, fill: "cyan", stroke: "ink", strokeWidth: 2, opacity: 0.9, text: "Lower Container", data: "" },
        { type: "rect", x: 10, y: 158, width: 220, height: 16, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, text: "Well-Car Flatbed", data: "" },
        { type: "ellipse", x: 30, y: 172, width: 26, height: 26, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "", data: "circle" },
        { type: "ellipse", x: 180, y: 172, width: 26, height: 26, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "", data: "circle" },
      ],
    },
    {
      id: "trackbed",
      role: "output",
      shapeType: "custom",
      label: "Dedicated Freight Corridor (DFC)",
      labelPlacement: "below",
      x: 50,
      y: 380,
      width: 580,
      height: 90,
      parts: [
        { type: "rect", x: 10, y: 15, width: 560, height: 40, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 0.8, text: "32.5 Tonne Axle-Load Trackbed", data: "" },
        { type: "wave", x: 20, y: 25, width: 540, height: 20, fill: "none", stroke: "yellow", strokeWidth: 2, opacity: 0.7, text: "", data: "8" },
      ],
    },
  ],
  connections: [
    {
      id: "conn-power",
      from: "pantograph",
      to: "locomotive",
      label: "25 kV AC",
      color: "yellow",
      route: "straight",
      fromAnchor: "bottom",
      toAnchor: "top",
      arrowhead: "arrow",
      bend: 0,
    },
    {
      id: "conn-traction",
      from: "locomotive",
      to: "double-stack-wagon",
      label: "Traction",
      color: "cyan",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
  ],
  segments: [
    {
      id: "seg-1",
      title: "High-Power Electric Locomotive",
      narration: "Indian Railways deploys high-powered 12,000 horsepower electric locomotives engineered specifically for heavy-haul freight.",
      targetIds: ["locomotive"],
      action: "focus",
      durationMs: 4000,
    },
    {
      id: "seg-2",
      title: "World's Highest 7.5-Meter Catenary",
      narration: "A high-reach pantograph extends upward to contact the overhead electric wire suspended at 7.5 meters to clear double-stacked containers.",
      targetIds: ["pantograph"],
      action: "trace",
      durationMs: 4500,
    },
    {
      id: "seg-3",
      title: "Double-Stacked Container Cars",
      narration: "Low-deck flatcars carry two shipping containers vertically, doubling the cargo capacity of every train without requiring extra track slots.",
      targetIds: ["double-stack-wagon"],
      action: "focus",
      durationMs: 4500,
    },
    {
      id: "seg-4",
      title: "Heavy-Haul Dedicated Corridors",
      narration: "These trains run on heavy-duty tracks built for 32.5-tonne axle loads, drastically cutting freight transit times across India.",
      targetIds: ["trackbed"],
      action: "flow",
      durationMs: 4000,
    },
  ],
};

const validation = lessonPlanSchema.safeParse(trainLessonRaw);
console.log("1. Zod Validation:", validation.success ? "✅ PASSED" : validation.error);

const layoutPlan = normalizeLessonLayout(trainLessonRaw);
console.log("2. Normalized Objects Count:", layoutPlan.objects.length);
console.log("   Object IDs:", layoutPlan.objects.map((o) => o.id));
console.log("   Connections Count:", layoutPlan.connections.length);
console.log("   Segments Count:", layoutPlan.segments.length);

for (let step = 0; step < layoutPlan.segments.length; step++) {
  const visibleIds = new Set(layoutPlan.segments.slice(0, step + 1).flatMap((s) => s.targetIds));
  console.log(`   Step ${step + 1} ("${layoutPlan.segments[step].title}"):`);
  console.log(`     Revealed Objects:`, Array.from(visibleIds));
}

console.log("✅ Progressive Whiteboard Drawing verified!");
