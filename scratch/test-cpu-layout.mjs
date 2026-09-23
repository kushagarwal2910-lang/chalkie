// Test layout normalization for a CPU pipeline with container and stages
import { normalizeLessonLayout } from "../lib/lesson-layout.ts";

const cpuLesson = {
  id: "test-cpu",
  title: "How a CPU Works",
  question: "How a CPU Works",
  summary: "The CPU executes instructions through a continuous fetch, decode, and execute cycle.",
  diagramType: "system",
  visualStrategy: "A CPU chip container with internal stages (Fetch, Decode, Execute) connected by control lines.",
  sources: [],
  objects: [
    {
      id: "cpu-chip",
      role: "container",
      shapeType: "frame",
      label: "CPU Core",
      labelPlacement: "inside",
      x: 100,
      y: 80,
      width: 600,
      height: 380,
      parts: [],
    },
    // The LLM previously emitted these with overlapping X coordinates or small widths
    {
      id: "fetch-stage",
      role: "input",
      shapeType: "geo",
      label: "Fetch",
      labelPlacement: "above",
      x: 140,
      y: 120,
      width: 140,
      height: 90,
      parts: [],
    },
    {
      id: "decode-stage",
      role: "component",
      shapeType: "geo",
      label: "Decode",
      labelPlacement: "above",
      x: 180, // Colliding with Fetch!
      y: 120,
      width: 140,
      height: 90,
      parts: [],
    },
    {
      id: "execute-stage",
      role: "output",
      shapeType: "geo",
      label: "Execute",
      labelPlacement: "above",
      x: 220, // Colliding with Decode!
      y: 120,
      width: 140,
      height: 90,
      parts: [],
    },
  ],
  connections: [
    {
      id: "f-to-d",
      from: "fetch-stage",
      to: "decode-stage",
      label: "Instruction",
      color: "blue",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
    {
      id: "d-to-e",
      from: "decode-stage",
      to: "execute-stage",
      label: "Decoded Ops",
      color: "blue",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
  ],
  segments: [
    { id: "s1", title: "Fetch", narration: "Instruction fetched", targetIds: ["fetch-stage"], action: "reveal", durationMs: 4000 },
    { id: "s2", title: "Decode", narration: "Instruction decoded", targetIds: ["decode-stage"], action: "reveal", durationMs: 4000 },
    { id: "s3", title: "Execute", narration: "Instruction executed", targetIds: ["execute-stage"], action: "reveal", durationMs: 4000 },
  ],
};

console.log("Original objects:");
cpuLesson.objects.forEach(o => console.log(`  ${o.id}: x=${o.x}, y=${o.y}, w=${o.width}, h=${o.height}`));

const normalized = normalizeLessonLayout(cpuLesson);

console.log("\nNormalized objects:");
normalized.objects.forEach(o => console.log(`  ${o.id}: x=${Math.round(o.x)}, y=${Math.round(o.y)}, w=${Math.round(o.width)}, h=${Math.round(o.height)}`));
