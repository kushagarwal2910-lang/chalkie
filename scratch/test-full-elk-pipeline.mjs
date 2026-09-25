import ELK from "elkjs/lib/elk.bundled.js";
import { normalizeLessonLayout } from "../lib/lesson-layout.ts";

const elk = new ELK();

const samplePlan = {
  id: "test-solar-system",
  title: "Solar Eclipse Alignment",
  question: "How does a solar eclipse happen?",
  diagramType: "spatial",
  visualStrategy: "Sun on left, Moon in center, Earth on right with light rays and shadow",
  objects: [
    {
      id: "sun",
      role: "subject",
      label: "Sun",
      width: 180,
      height: 180,
      x: 100,
      y: 200,
      parts: [{ type: "ellipse", data: "sun", text: "Sun", width: 140, height: 140, x: 20, y: 20 }],
    },
    {
      id: "moon",
      role: "component",
      label: "Moon",
      width: 140,
      height: 140,
      x: 500,
      y: 220,
      parts: [{ type: "ellipse", data: "moon", text: "Moon", width: 100, height: 100, x: 20, y: 20 }],
    },
    {
      id: "earth",
      role: "subject",
      label: "Earth",
      width: 160,
      height: 160,
      x: 900,
      y: 210,
      parts: [{ type: "ellipse", data: "earth", text: "Earth", width: 120, height: 120, x: 20, y: 20 }],
    },
  ],
  connections: [
    {
      id: "sunlight",
      from: "sun",
      to: "moon",
      label: "Solar Radiation",
      fromAnchor: "right",
      toAnchor: "left",
      route: "straight",
    },
    {
      id: "shadow",
      from: "moon",
      to: "earth",
      label: "Umbra Shadow Cone",
      fromAnchor: "right",
      toAnchor: "left",
      route: "straight",
    },
  ],
  segments: [
    {
      id: "seg-1",
      title: "Solar Rays",
      narration: "Sun radiates light toward Moon.",
      targetIds: ["sun", "sunlight"],
      action: "reveal",
      durationMs: 4000,
    },
  ],
};

const normalized = normalizeLessonLayout(samplePlan);
console.log("Normalized objects:", normalized.objects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })));
