import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";

console.log("=== Testing User Screenshot Puri Case ===");

const userScreenshotCase = {
  id: "lesson-puri-test",
  title: "Puri Frying Process",
  question: "Why does a puri puff up when fried?",
  summary: "Steam generation inside dough creates rapid expansion.",
  diagramType: "mechanism",
  visualStrategy: "Hero Breakdown",
  sources: [],
  objects: [
    {
      id: "puri-template",
      role: "subject",
      shapeType: "custom-template",
      label: "Puri Frying Process",
      labelPlacement: "above",
      x: 100,
      y: 100,
      width: 680,
      height: 440,
      parts: [
        {
          type: "rect",
          x: 0,
          y: 0,
          width: 680,
          height: 440,
          data: JSON.stringify({
            templateType: "hero-breakdown",
            title: "Puri Frying Process",
            subtitle: "Core Architecture & Subsystems",
            hero: {
              label: "Raw Dough",
              detail: "Wheat flour + water",
              badge: "Core Unit",
              specs: [{ label: "Water Content", value: "~10%" }],
            },
            components: [
              { label: "Hot Oil", detail: "~180-190°C", badge: "Part 01" },
              { label: "Steam", detail: "Rapidly expands", badge: "Part 02" },
              { label: "Puffed Puri", detail: "Air pocket inside", badge: "Part 03" },
            ],
          }),
          text: "hero-breakdown",
          fill: "slate",
          stroke: "slate",
          strokeWidth: 2,
          opacity: 1,
        },
      ],
      props: {
        templateType: "hero-breakdown",
        title: "Puri Frying Process",
        subtitle: "Core Architecture & Subsystems",
        data: {
          hero: {
            label: "Raw Dough",
            detail: "Wheat flour + water",
            badge: "Core Unit",
            specs: [{ label: "Water Content", value: "~10%" }],
          },
          components: [
            { label: "Hot Oil", detail: "~180-190°C", badge: "Part 01" },
            { label: "Steam", detail: "Rapidly expands", badge: "Part 02" },
            { label: "Puffed Puri", detail: "Air pocket inside", badge: "Part 03" },
          ],
        },
      },
    },
    // The loose filler objects the model emitted in the screenshot:
    {
      id: "oil-particles",
      role: "input",
      shapeType: "custom",
      label: "Oil",
      x: 20,
      y: 150,
      width: 60,
      height: 60,
      parts: [{ type: "particles", x: 0, y: 0, width: 60, height: 60, fill: "orange", stroke: "orange", strokeWidth: 1, opacity: 1, data: "12", text: "" }],
    },
    {
      id: "water-dots",
      role: "component",
      shapeType: "custom",
      label: "Water",
      x: 800,
      y: 200,
      width: 80,
      height: 60,
      parts: [{ type: "particles", x: 0, y: 0, width: 80, height: 60, fill: "blue", stroke: "blue", strokeWidth: 1, opacity: 1, data: "10", text: "" }],
    },
    {
      id: "puffed-puri-circle",
      role: "output",
      shapeType: "custom",
      label: "Puffed Puri",
      x: 950,
      y: 120,
      width: 100,
      height: 100,
      parts: [{ type: "ellipse", x: 0, y: 0, width: 100, height: 100, fill: "orange", stroke: "ink", strokeWidth: 2, opacity: 1, data: "", text: "" }],
    },
  ],
  connections: [
    {
      id: "conn-1",
      from: "oil-particles",
      to: "puri-template",
      label: "Oil",
      color: "orange",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
    {
      id: "conn-2",
      from: "water-dots",
      to: "puffed-puri-circle",
      label: "expand",
      color: "orange",
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
      title: "Raw Dough",
      narration: "The raw dough is dropped into hot oil.",
      targetIds: ["puri-template"],
      action: "focus",
      durationMs: 5000,
    },
    {
      id: "seg-2",
      title: "Steam expansion",
      narration: "Water turns to steam and expands rapidly.",
      targetIds: ["water-dots"],
      action: "focus",
      durationMs: 5000,
    },
  ],
};

const cleaned = repairAndValidateLessonPlan(userScreenshotCase);

console.log("Results after repairAndValidateLessonPlan:");
console.log("Objects count:", cleaned.objects.length);
console.log("Objects IDs:", cleaned.objects.map((o) => o.id));
console.log("Connections count:", cleaned.connections.length);
console.log("Segment 2 targetIds:", cleaned.segments[1].targetIds);
console.log("Template position:", `x=${cleaned.objects[0].x}, y=${cleaned.objects[0].y}, w=${cleaned.objects[0].width}, h=${cleaned.objects[0].height}`);

if (cleaned.objects.length === 1 && cleaned.objects[0].id === "puri-template" && cleaned.connections.length === 0) {
  console.log("✅ SUCCESS: Loose filler shapes & stabbing arrows eliminated! Template is clean centerpiece.");
} else {
  console.error("❌ FAILED: Redundant objects still present!");
}
