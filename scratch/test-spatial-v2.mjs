import {
  applySpatialAutoLayout,
  getExistingCanvasBounds,
  getCanvasViewportBounds,
  checkBoundingBoxIntersection,
  normalizeShapeId,
} from "../lib/tldraw-spatial-layout.ts";

console.log("=== Comprehensive Testing: Chalkie Spatial Auto-Layout Engine v2 ===");

// 1. Mock tldraw Editor instance simulating full Editor API
class MockEditor {
  constructor() {
    this.shapes = new Map();
    this.viewport = { minX: 50, minY: 50, maxX: 1250, maxY: 850, width: 1200, height: 800 };
  }

  getCurrentPageShapes() {
    return Array.from(this.shapes.values());
  }

  getShapes() {
    return this.getCurrentPageShapes();
  }

  getShape(id) {
    return this.shapes.get(id);
  }

  getShapePageBounds(shape) {
    const s = typeof shape === "string" ? this.shapes.get(shape) : shape;
    if (!s) return undefined;
    const w = s.props?.w || 100;
    const h = s.props?.h || 60;
    return {
      minX: s.x,
      minY: s.y,
      maxX: s.x + w,
      maxY: s.y + h,
      width: w,
      height: h,
    };
  }

  getViewportPageBounds() {
    return this.viewport;
  }

  createShapes(shapePartials) {
    for (const partial of shapePartials) {
      this.shapes.set(partial.id, {
        id: partial.id,
        type: partial.type || "chalk-visual",
        x: partial.x,
        y: partial.y,
        props: partial.props || { w: 100, h: 60 },
        meta: partial.meta || {},
      });
    }
  }

  updateShapes(shapePartials) {
    for (const partial of shapePartials) {
      const existing = this.shapes.get(partial.id);
      if (existing) {
        Object.assign(existing, partial);
      }
    }
  }
}

const editor = new MockEditor();

// TEST 1: Shape ID normalization and exclusion
console.log("\n--- TEST 1: Shape ID Normalization and Exclusion ---");
editor.createShapes([
  { id: "shape:existing_teacher_note", type: "note", x: 60, y: 60, props: { w: 150, h: 100 }, meta: { chalkieId: "existing_teacher_note" } },
]);

const existingBoxes = getExistingCanvasBounds(editor, new Set(["new_lesson_shape"]));
console.log(`Found ${existingBoxes.length} pre-existing obstacle shape:`, existingBoxes.map(b => b.id));
if (existingBoxes.length !== 1 || existingBoxes[0].id !== "shape:existing_teacher_note") {
  throw new Error("Failed: Existing shape was not recognized!");
}

// TEST 2: Hierarchical Container with Internal Components
console.log("\n--- TEST 2: Hierarchical Container Enclosure ---");
const testLessonWithContainer = {
  id: "jet-engine-lesson",
  title: "Jet Engine Working",
  question: "How does a jet engine work?",
  summary: "Internal mechanism of a turbofan engine.",
  diagramType: "mechanism",
  visualStrategy: "Sectioned cutaway inside the outer nacelle container.",
  sources: [],
  objects: [
    // Outer Container
    {
      id: "engine_nacelle",
      role: "container",
      shapeType: "custom",
      label: "Engine Nacelle Housing",
      labelPlacement: "above",
      x: 100,
      y: 120,
      width: 500,
      height: 250,
      parts: [],
    },
    // Sub-components originally proposed inside the container
    {
      id: "fan_stage",
      role: "component",
      shapeType: "custom",
      label: "Intake Fan",
      labelPlacement: "below",
      x: 130,
      y: 160,
      width: 90,
      height: 160,
      parts: [],
    },
    {
      id: "compressor_stage",
      role: "component",
      shapeType: "custom",
      label: "Compressor",
      labelPlacement: "below",
      x: 250,
      y: 180,
      width: 100,
      height: 120,
      parts: [],
    },
    {
      id: "combustion_chamber",
      role: "component",
      shapeType: "custom",
      label: "Combustor",
      labelPlacement: "below",
      x: 380,
      y: 190,
      width: 90,
      height: 100,
      parts: [],
    },
    // Standalone component outside the container
    {
      id: "control_telemetry",
      role: "component",
      shapeType: "custom",
      label: "Cockpit Telemetry",
      labelPlacement: "below",
      x: 100, // Proposed right on top of existing obstacle to test collision avoidance!
      y: 100,
      width: 140,
      height: 80,
      parts: [],
    },
  ],
  connections: [
    {
      id: "conn-1",
      from: "fan_stage",
      to: "compressor_stage",
      label: "Airflow",
      color: "blue",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
    {
      id: "conn-2",
      from: "compressor_stage",
      to: "combustion_chamber",
      label: "Compressed",
      color: "orange",
      route: "straight",
      fromAnchor: "right",
      toAnchor: "left",
      arrowhead: "arrow",
      bend: 0,
    },
  ],
  segments: [],
};

const layoutResult = applySpatialAutoLayout(editor, testLessonWithContainer);

const container = layoutResult.objects.find(o => o.id === "engine_nacelle");
const fan = layoutResult.objects.find(o => o.id === "fan_stage");
const compressor = layoutResult.objects.find(o => o.id === "compressor_stage");
const combustor = layoutResult.objects.find(o => o.id === "combustion_chamber");
const telemetry = layoutResult.objects.find(o => o.id === "control_telemetry");

console.log("Container resolved pos:", { x: container.x, y: container.y, w: container.width, h: container.height });
console.log("Fan resolved pos:", { x: fan.x, y: fan.y, w: fan.width, h: fan.height });
console.log("Compressor resolved pos:", { x: compressor.x, y: compressor.y });
console.log("Combustor resolved pos:", { x: combustor.x, y: combustor.y });
console.log("Telemetry (avoided obstacle):", { x: telemetry.x, y: telemetry.y });

// Verify Fan is strictly INSIDE Container
const fanInside = fan.x >= container.x && fan.x + fan.width <= container.x + container.width &&
                  fan.y >= container.y && fan.y + fan.height <= container.y + container.height;
console.log("Is Fan enclosed cleanly within Container?", fanInside ? "YES ✅" : "NO ❌");
if (!fanInside) {
  throw new Error("Failed: Child was not enclosed in container!");
}

// Verify Telemetry avoided the existing shape at (60, 60, 150, 100)
const telemetryCollidesWithNote = checkBoundingBoxIntersection(
  { x: telemetry.x, y: telemetry.y, w: telemetry.width, h: telemetry.height },
  { x: 60, y: 60, w: 150, h: 100 },
  24
);
console.log("Did Telemetry successfully avoid colliding with existing note?", !telemetryCollidesWithNote ? "YES ✅" : "NO ❌");
if (telemetryCollidesWithNote) {
  throw new Error("Failed: Standalone component collided with existing note!");
}

// TEST 3: Topological Left-to-Right Ordering
console.log("\n--- TEST 3: Topological Left-to-Right Causal Flow ---");
console.log(`Flow check: Fan (${fan.x}) < Compressor (${compressor.x}) < Combustor (${combustor.x})`);
if (!(fan.x < compressor.x && compressor.x < combustor.x)) {
  throw new Error("Failed: Causal topological order was violated!");
}
console.log("Topological flow verified: YES ✅");

// TEST 4: Viewport bounds compliance
console.log("\n--- TEST 4: Viewport Page Bounds Verification ---");
const vp = editor.getViewportPageBounds();
for (const obj of layoutResult.objects) {
  const inViewport = obj.x >= vp.minX && obj.x + obj.width <= vp.maxX &&
                     obj.y >= vp.minY && obj.y + obj.height <= vp.maxY;
  console.log(`- Shape [${obj.id}] at (${obj.x}, ${obj.y}) inside viewport? ${inViewport ? "YES ✅" : "NO ❌"}`);
  if (!inViewport) {
    throw new Error(`Failed: Shape [${obj.id}] was placed outside viewport bounds!`);
  }
}

console.log("\nALL SPATIAL V2 TESTS PASSED WITH 100% SUCCESS! 🚀");
