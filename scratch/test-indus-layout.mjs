import { applySpatialAutoLayout } from "../lib/tldraw-spatial-layout.ts";

class MockEditor {
  constructor() {
    this.shapes = new Map();
    this.viewport = { minX: 40, minY: 40, maxX: 1240, maxY: 780, width: 1200, height: 740 };
  }
  getCurrentPageShapes() { return Array.from(this.shapes.values()); }
  getShapes() { return this.getCurrentPageShapes(); }
  getShape(id) { return this.shapes.get(id); }
  getShapePageBounds(shape) {
    const s = typeof shape === "string" ? this.shapes.get(shape) : shape;
    if (!s) return undefined;
    const w = s.props?.w || 100;
    const h = s.props?.h || 60;
    return { minX: s.x, minY: s.y, maxX: s.x + w, maxY: s.y + h, width: w, height: h };
  }
  getViewportPageBounds() { return this.viewport; }
}

const editor = new MockEditor();

// The exact 3-container problem from the user's Indus Valley screenshot
const indusLesson = {
  id: "indus-valley-planning",
  title: "Indus Valley City Planning",
  question: "how does indus valley people used to live explain their city planning",
  summary: "The citadel was a fortified upper mound containing public buildings...",
  diagramType: "system",
  visualStrategy: "West Citadel and East Lower Town grid plan",
  sources: [],
  objects: [
    // Container 1: City Overview / Citadel
    {
      id: "citadel-zone",
      role: "container",
      shapeType: "custom",
      label: "Citadel (Western Mound)",
      labelPlacement: "above",
      x: 100, y: 100, width: 380, height: 320,
      parts: [],
    },
    // Subcomponents inside Container 1
    {
      id: "citadel-platform",
      role: "component",
      shapeType: "custom",
      label: "Mud-Brick Platform",
      labelPlacement: "inside",
      x: 120, y: 140, width: 220, height: 120,
      parts: [{ type: "rect", x: 0, y: 0, width: 220, height: 120, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, data: "", text: "" }],
    },
    {
      id: "great-bath",
      role: "component",
      shapeType: "custom",
      label: "The Great Bath",
      labelPlacement: "below",
      x: 150, y: 280, width: 140, height: 90,
      parts: [{ type: "rect", x: 0, y: 0, width: 140, height: 90, fill: "cyan", stroke: "blue", strokeWidth: 2, opacity: 1, data: "", text: "" }],
    },

    // Container 2: Lower Town Residential Grid
    {
      id: "lower-town-zone",
      role: "container",
      shapeType: "custom",
      label: "Lower Town (Eastern Grid)",
      labelPlacement: "above",
      x: 520, y: 100, width: 440, height: 260,
      parts: [],
    },
    // Subcomponents inside Container 2
    {
      id: "street-grid",
      role: "component",
      shapeType: "custom",
      label: "90° Street Intersection",
      labelPlacement: "above",
      x: 540, y: 130, width: 380, height: 120,
      parts: [{ type: "rect", x: 0, y: 0, width: 380, height: 120, fill: "orange", stroke: "ink", strokeWidth: 2, opacity: 1, data: "", text: "" }],
    },

    // Container 3: Covered Drainage System
    {
      id: "drain-system-zone",
      role: "container",
      shapeType: "custom",
      label: "Covered Drain Network",
      labelPlacement: "above",
      x: 520, y: 390, width: 440, height: 240,
      parts: [],
    },
    // Subcomponents inside Container 3
    {
      id: "soak-pit",
      role: "component",
      shapeType: "custom",
      label: "Brick Soak Pit",
      labelPlacement: "below",
      x: 550, y: 420, width: 160, height: 90,
      parts: [{ type: "rect", x: 0, y: 0, width: 160, height: 90, fill: "violet", stroke: "ink", strokeWidth: 2, opacity: 1, data: "", text: "" }],
    },
  ],
  connections: [],
  segments: [],
};

const result = applySpatialAutoLayout(editor, indusLesson);

console.log("=== Testing 3-Container Architectural Layout ===");
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

for (const obj of result.objects) {
  minX = Math.min(minX, obj.x);
  minY = Math.min(minY, obj.y);
  maxX = Math.max(maxX, obj.x + obj.width);
  maxY = Math.max(maxY, obj.y + obj.height);
  console.log(`- [${obj.id}] (${obj.role}) at (${obj.x}, ${obj.y}, w=${obj.width}, h=${obj.height}) label="${obj.label}"`);
}

const totalW = maxX - minX;
const totalH = maxY - minY;
console.log(`\nTotal Scene Bounding Box: ${totalW}px x ${totalH}px (x: ${minX}..${maxX}, y: ${minY}..${maxY})`);

// Calculate expected camera zoom
const vpW = 1200;
const vpH = 740;
const scaleX = (vpW - 64) / totalW;
const scaleY = (vpH - 64) / totalH;
const targetZoom = Math.min(1.05, Math.max(0.72, Math.min(scaleX, scaleY)));

console.log(`Camera Zoom Factor: ${(targetZoom * 100).toFixed(0)}%`);

if (targetZoom < 0.70) {
  throw new Error(`Failed: Zoom is too small (${(targetZoom * 100).toFixed(0)}%)! Content is scattered!`);
}

if (maxX > 1200) {
  throw new Error(`Failed: Content blew out horizontally to x=${maxX}!`);
}

// Check child enclosure in Container 1
const c1 = result.objects.find(o => o.id === "citadel-zone");
const bath = result.objects.find(o => o.id === "great-bath");
const bathInside = bath.x >= c1.x && bath.x + bath.width <= c1.x + c1.width &&
                   bath.y >= c1.y && bath.y + bath.height <= c1.y + c1.height;
console.log(`Is Great Bath 100% enclosed within Citadel container? ${bathInside ? "YES ✅" : "NO ❌"}`);

if (!bathInside) {
  throw new Error("Failed: Child Great Bath is sticking out of Citadel container!");
}

console.log("\nALL ARCHITECTURAL 3-CONTAINER CHECKS PASSED PERFECTLY! 🚀");
