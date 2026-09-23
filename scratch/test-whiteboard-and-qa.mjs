import assert from "node:assert/strict";
import { normalizeLessonLayout } from "../lib/lesson-layout.ts";

console.log("=== 1. Testing CPU Lesson Layout & Collision Resolution ===");

const rawCpuLesson = {
  id: "cpu-lesson",
  title: "How a CPU Works",
  question: "How a CPU works",
  summary: "A CPU executes instructions using the fetch-decode-execute cycle.",
  diagramType: "mechanism",
  visualStrategy: "chip container with internal pipeline stages",
  sources: [],
  objects: [
    {
      id: "cpu-chip",
      label: "CPU Chip",
      role: "container",
      shapeType: "geo",
      geo: "rectangle",
      color: "slate",
      x: 100,
      y: 100,
      width: 400, // deliberately too small for 3 stages
      height: 200,
      parts: []
    },
    {
      id: "fetch-stage",
      label: "Fetch",
      role: "component",
      shapeType: "note", // improper note from LLM
      color: "yellow",
      x: 120,
      y: 120, // overlapping
      width: 140,
      height: 90,
      parts: []
    },
    {
      id: "decode-stage",
      label: "Decode",
      role: "component",
      shapeType: "note", // improper note from LLM
      color: "yellow",
      x: 160, // heavily overlapping fetch
      y: 120,
      width: 140,
      height: 90,
      parts: []
    },
    {
      id: "execute-stage",
      label: "Execute",
      role: "component",
      shapeType: "note", // improper note from LLM
      color: "yellow",
      x: 200, // heavily overlapping decode
      y: 120,
      width: 140,
      height: 90,
      parts: []
    }
  ],
  connections: [
    {
      id: "fetch-to-decode",
      from: "fetch-stage",
      to: "decode-stage",
      label: "Instruction",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      bend: 0,
      color: "blue",
      arrowhead: "arrow"
    },
    {
      id: "decode-to-execute",
      from: "decode-stage",
      to: "execute-stage",
      label: "Signals",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      bend: 0,
      color: "blue",
      arrowhead: "arrow"
    },
    {
      id: "execute-to-fetch",
      from: "execute-stage",
      to: "fetch-stage",
      label: "Next PC",
      route: "elbow",
      fromAnchor: "bottom",
      toAnchor: "bottom",
      bend: 0,
      color: "slate",
      arrowhead: "arrow"
    }
  ],
  segments: [
    {
      id: "step-fetch",
      title: "Fetch",
      narration: "The CPU retrieves instructions from memory into the instruction register.",
      targetIds: ["fetch-stage"],
      action: "reveal",
      durationMs: 3000
    },
    {
      id: "step-decode",
      title: "Decode",
      narration: "The control unit interprets the opcode and prepares execution signals.",
      targetIds: ["decode-stage"],
      action: "reveal",
      durationMs: 3000
    },
    {
      id: "step-execute",
      title: "Execute",
      narration: "The ALU executes the operation and stores the result.",
      targetIds: ["execute-stage"],
      action: "reveal",
      durationMs: 3000
    }
  ]
};

const normalized = normalizeLessonLayout(rawCpuLesson);

const fetchObj = normalized.objects.find(o => o.id === "fetch-stage");
const decodeObj = normalized.objects.find(o => o.id === "decode-stage");
const executeObj = normalized.objects.find(o => o.id === "execute-stage");
const chipObj = normalized.objects.find(o => o.id === "cpu-chip");

console.log("Fetch Stage:", { x: fetchObj.x, y: fetchObj.y, w: fetchObj.width, h: fetchObj.height });
console.log("Decode Stage:", { x: decodeObj.x, y: decodeObj.y, w: decodeObj.width, h: decodeObj.height });
console.log("Execute Stage:", { x: executeObj.x, y: executeObj.y, w: executeObj.width, h: executeObj.height });
console.log("CPU Chip Container:", { x: chipObj.x, y: chipObj.y, w: chipObj.width, h: chipObj.height });

// Verify horizontal ordering and zero overlap between pipeline stages
assert(fetchObj.x + fetchObj.width <= decodeObj.x, "Fetch and Decode must not overlap");
assert(decodeObj.x + decodeObj.width <= executeObj.x, "Decode and Execute must not overlap");
const gap1 = decodeObj.x - (fetchObj.x + fetchObj.width);
const gap2 = executeObj.x - (decodeObj.x + decodeObj.width);
console.log(`Gap 1 (Fetch->Decode): ${gap1}px, Gap 2 (Decode->Execute): ${gap2}px`);
assert(gap1 >= 50, "Gap 1 must be at least 50px");
assert(gap2 >= 50, "Gap 2 must be at least 50px");

// Verify container encloses all three stages with padding
assert(chipObj.x < fetchObj.x, "Chip container must start before Fetch");
assert(chipObj.x + chipObj.width > executeObj.x + executeObj.width, "Chip container must end after Execute");
assert(chipObj.y < fetchObj.y, "Chip container must start above stages");
assert(chipObj.y + chipObj.height > fetchObj.y + fetchObj.height, "Chip container must extend below stages");
console.log("✓ Pipeline alignment and container enclosure passed!");

console.log("\n=== 2. Testing Follow-Up Q&A: Existing Canvas Concept (coverage: 'existing') ===");

const existingDoubtPlan = {
  id: "doubt-decode",
  title: "Role of the Decode Stage",
  answer: "The decode stage decodes the binary opcode using the control unit.",
  coverage: "existing",
  visualStrategy: "focus on decode block",
  targetIds: ["decode-stage"],
  objects: [],
  connections: [],
  segments: [
    {
      id: "seg-decode-detail",
      title: "Control Unit Decoding",
      narration: "Right here in the Decode stage, the control unit reads the instruction bits to enable the ALU.",
      targetIds: ["decode-stage"],
      action: "focus",
      durationMs: 3500
    }
  ]
};

function mergeFollowUp(current, plan) {
  const startIndex = current.segments.length;
  if (plan.coverage === "existing") {
    return {
      startIndex,
      lesson: {
        ...current,
        segments: [...current.segments, ...plan.segments],
      },
    };
  }
  const currentMaxX = current.objects.length ? Math.max(...current.objects.map((o) => o.x + o.width)) : 0;
  const currentMinY = current.objects.length ? Math.min(...current.objects.map((o) => o.y)) : 24;
  const extensionMinX = plan.objects.length ? Math.min(...plan.objects.map((o) => o.x)) : 24;
  const extensionMinY = plan.objects.length ? Math.min(...plan.objects.map((o) => o.y)) : 24;
  const xOffset = currentMaxX + 180 - extensionMinX;
  const yOffset = currentMinY - extensionMinY;
  const newObjects = plan.objects.map((o) => ({ ...o, x: o.x + xOffset, y: o.y + yOffset }));
  return {
    startIndex,
    lesson: {
      ...current,
      objects: [...current.objects, ...newObjects],
      connections: [...current.connections, ...plan.connections],
      segments: [...current.segments, ...plan.segments],
    },
  };
}

const mergedExisting = mergeFollowUp(normalized, existingDoubtPlan);
console.log("Merged existing objects count:", mergedExisting.lesson.objects.length);
assert.equal(mergedExisting.lesson.objects.length, normalized.objects.length, "No new objects should be added for existing canvas concept");
assert.equal(mergedExisting.startIndex, 3, "Start index should be 3 (after the 3 initial steps)");
assert.deepEqual(mergedExisting.lesson.segments[3].targetIds, ["decode-stage"], "Step 3 must target existing decode-stage");
console.log("✓ Existing doubt handling passed! (Laser will point to existing shape without canvas bloat)");

console.log("\n=== 3. Testing Follow-Up Q&A: New Concept from RAG (coverage: 'append') ===");

const appendDoubtPlan = {
  id: "doubt-cache",
  title: "L1 Cache Memory Integration",
  answer: "L1 Cache sits directly adjacent to the fetch unit to prevent memory latency.",
  coverage: "append",
  visualStrategy: "cache block beside fetch",
  targetIds: ["l1-cache"],
  objects: [
    {
      id: "l1-cache",
      label: "L1 Cache",
      role: "component",
      shapeType: "geo",
      geo: "rectangle",
      color: "cyan",
      x: 100,
      y: 100,
      width: 140,
      height: 90,
      parts: []
    },
    {
      id: "ram-module",
      label: "Main RAM",
      role: "component",
      shapeType: "geo",
      geo: "rectangle",
      color: "green",
      x: 320,
      y: 100,
      width: 140,
      height: 90,
      parts: []
    }
  ],
  connections: [
    {
      id: "ram-to-cache",
      from: "ram-module",
      to: "l1-cache",
      label: "Bus Line",
      route: "straight",
      fromAnchor: "left",
      toAnchor: "right",
      bend: 0,
      color: "cyan",
      arrowhead: "arrow"
    },
    {
      id: "cache-to-fetch",
      from: "l1-cache",
      to: "fetch-stage",
      label: "SRAM Hit",
      route: "curve",
      fromAnchor: "left",
      toAnchor: "right",
      bend: 20,
      color: "blue",
      arrowhead: "arrow"
    }
  ],
  segments: [
    {
      id: "seg-cache-explain",
      title: "L1 Cache Speed",
      narration: "Here is the high-speed L1 cache sitting between main memory and the fetch stage.",
      targetIds: ["l1-cache"],
      action: "reveal",
      durationMs: 4000
    }
  ]
};

const mergedAppend = mergeFollowUp(normalized, appendDoubtPlan);
console.log("Initial objects count:", normalized.objects.length);
console.log("Merged append objects count:", mergedAppend.lesson.objects.length);
assert(mergedAppend.lesson.objects.length > normalized.objects.length, "Appended objects must be added to the infinite canvas");

// Verify that appended objects are placed beside the initial lesson without collision
const maxOriginalX = Math.max(...normalized.objects.map(o => o.x + o.width));
const minAppendedX = Math.min(...mergedAppend.lesson.objects.slice(normalized.objects.length).map(o => o.x));
console.log(`Max original X: ${maxOriginalX}px, Min appended X: ${minAppendedX}px`);
assert(minAppendedX > maxOriginalX, "Appended extension must be placed to the right on the infinite canvas");
console.log("✓ Appended doubt handling on infinite canvas passed!");

console.log("\nALL VERIFICATION CHECKS PASSED!");
