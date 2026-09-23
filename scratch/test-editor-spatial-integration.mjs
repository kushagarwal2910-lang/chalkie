import {
  applySpatialAutoLayout,
  getExistingCanvasBounds,
  getCanvasViewportBounds,
  checkBoundingBoxIntersection,
} from "../lib/tldraw-spatial-layout.ts";

console.log("=== Testing tldraw SDK Spatial Layout Integration ===");

// 1. Mock tldraw Editor instance
class MockEditor {
  constructor() {
    this.shapes = new Map();
    this.viewport = { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
  }

  // SDK Feature 1: getShapes() / getCurrentPageShapes()
  getCurrentPageShapes() {
    return Array.from(this.shapes.values());
  }

  getShapes() {
    return this.getCurrentPageShapes();
  }

  getShape(id) {
    return this.shapes.get(id);
  }

  // SDK Feature 2: getShapePageBounds(shape)
  getShapePageBounds(shape) {
    const s = typeof shape === "string" ? this.shapes.get(shape) : shape;
    if (!s) return undefined;
    return {
      minX: s.x,
      minY: s.y,
      maxX: s.x + (s.props?.w || 100),
      maxY: s.y + (s.props?.h || 60),
      width: s.props?.w || 100,
      height: s.props?.h || 60,
    };
  }

  // SDK Feature 3: getViewportPageBounds()
  getViewportPageBounds() {
    return this.viewport;
  }

  // SDK Feature 4: createShapes() / updateShapes()
  createShapes(shapePartials) {
    for (const partial of shapePartials) {
      this.shapes.set(partial.id, {
        id: partial.id,
        type: partial.type || "chalk-visual",
        x: partial.x,
        y: partial.y,
        props: partial.props || {},
      });
    }
  }

  updateShapes(shapePartials) {
    for (const partial of shapePartials) {
      const existing = this.shapes.get(partial.id);
      if (existing) {
        if (partial.x !== undefined) existing.x = partial.x;
        if (partial.y !== undefined) existing.y = partial.y;
        if (partial.props) Object.assign(existing.props, partial.props);
      }
    }
  }
}

const editor = new MockEditor();

// Pre-populate an existing shape on canvas (e.g. from an earlier question)
editor.createShapes([
  {
    id: "shape:existing_header",
    type: "chalk-visual",
    x: 60,
    y: 60,
    props: { w: 300, h: 140 },
  },
]);

console.log("1. Existing shape on canvas bounds verified:");
const existingBounds = getExistingCanvasBounds(editor);
console.log(existingBounds);
if (existingBounds.length !== 1 || existingBounds[0].w !== 300) {
  throw new Error("Failed to read existing bounds");
}

// 2. Mock incoming LLM lesson with overlapping shapes and extreme coordinates
const incomingLLMLesson = {
  id: "test-lesson",
  title: "Test Lesson",
  question: "How does CPU work?",
  summary: "Testing spatial auto-layout",
  diagramType: "mechanism",
  visualStrategy: "Diagram",
  sources: [],
  connections: [],
  segments: [
    { id: "s1", title: "Step 1", narration: "Intro", targetIds: ["alu"], action: "focus", durationMs: 4000 },
  ],
  objects: [
    // Direct collision with existing_header!
    {
      id: "alu",
      role: "component",
      shapeType: "custom",
      label: "ALU",
      labelPlacement: "below",
      x: 70, // Overlaps existing_header (x: 60, y: 60, w: 300, h: 140)
      y: 70,
      width: 240,
      height: 160,
      parts: [],
    },
    // Direct collision with alu!
    {
      id: "registers",
      role: "component",
      shapeType: "custom",
      label: "Registers",
      labelPlacement: "below",
      x: 80, // Overlaps alu
      y: 80,
      width: 200,
      height: 140,
      parts: [],
    },
    // Extreme coordinates far outside visible viewport!
    {
      id: "clock",
      role: "component",
      shapeType: "custom",
      label: "Clock Generator",
      labelPlacement: "below",
      x: 8500, // Extreme X
      y: -4200, // Extreme Y
      width: 180,
      height: 100,
      parts: [],
    },
  ],
};

console.log("\n2. Intercepting LLM payload with applySpatialAutoLayout...");
const correctedLesson = applySpatialAutoLayout(editor, incomingLLMLesson);

console.log("\n3. Verifying corrected coordinates:");
const placedObjects = correctedLesson.objects;
for (const obj of placedObjects) {
  console.log(`- ${obj.id}: x=${obj.x}, y=${obj.y}, w=${obj.width}, h=${obj.height}`);

  // Must be within viewport page bounds
  const vp = editor.getViewportPageBounds();
  if (obj.x < vp.minX || obj.x + obj.width > vp.maxX) {
    throw new Error(`Shape ${obj.id} placed outside viewport X bounds! (x: ${obj.x})`);
  }
  if (obj.y < vp.minY || obj.y + obj.height > vp.maxY) {
    throw new Error(`Shape ${obj.id} placed outside viewport Y bounds! (y: ${obj.y})`);
  }
}

// 4. Verify ZERO collisions between any pair of shapes (including existing shapes)
const allPlaced = [
  ...existingBounds,
  ...placedObjects.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })),
];

for (let i = 0; i < allPlaced.length; i++) {
  for (let j = i + 1; j < allPlaced.length; j++) {
    const a = allPlaced[i];
    const b = allPlaced[j];
    const collides = checkBoundingBoxIntersection(a, b, 20);
    if (collides) {
      throw new Error(`Collision detected between ${a.id} and ${b.id}!`);
    }
  }
}

console.log("\n✓ ZERO collisions detected across all shapes!");
console.log("✓ All shapes successfully bounded within getViewportPageBounds()!");
console.log("=== Integration Test Passed Successfully ===");
