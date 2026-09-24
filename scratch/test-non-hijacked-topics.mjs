import { repairAndValidateLessonPlan } from "../lib/lesson-layout.ts";

console.log("=== Testing Non-Hijacking of Diverse Topics ===");

// 1. OSI Model should NOT become a Neural Network
const osiPlan = {
  id: "lesson-osi",
  title: "The 7 Layers of the OSI Model",
  question: "How does the OSI model work across layer 1 and layer 2?",
  summary: "The OSI model characterizes computing functions into 7 abstraction layers.",
  diagramType: "flowchart",
  visualStrategy: "Stack of layers from physical to application.",
  sources: [],
  objects: [
    { id: "layer-1-physical", role: "component", shapeType: "custom", label: "Layer 1 - Physical", parts: [{ type: "rect", x: 10, y: 10, width: 200, height: 40, fill: "blue", stroke: "cyan", text: "Physical" }] },
    { id: "layer-2-datalink", role: "component", shapeType: "custom", label: "Layer 2 - Data Link", parts: [{ type: "rect", x: 10, y: 10, width: 200, height: 40, fill: "green", stroke: "white", text: "Data Link" }] },
  ],
  connections: [],
  segments: [
    { id: "s1", title: "Physical Layer", narration: "Data signals traverse physical cables at layer 1.", targetIds: ["layer-1-physical"], action: "reveal", durationMs: 5000 },
  ],
};

const repairedOsi = repairAndValidateLessonPlan(osiPlan);
if (repairedOsi.objects.some(o => o.id === "nn-input-layer" || o.id === "nn-formula-loss")) {
  throw new Error("FAILED: OSI model was hijacked into a Neural Network!");
}
if (repairedOsi.objects[0].id !== "layer-1-physical") {
  throw new Error("FAILED: OSI model object IDs were lost!");
}
console.log("✓ OSI Model preserved cleanly without neural network hijacking!");

// 2. GPS Satellite should NOT become Moon-Earth Orbital Mechanics
const gpsPlan = {
  id: "lesson-gps",
  title: "How GPS Satellites Triangulate Position",
  question: "How do GPS satellites in orbit calculate our exact position on Earth?",
  summary: "GPS satellites orbit Earth and transmit atomic clock timestamps for trilateration.",
  diagramType: "mechanism",
  visualStrategy: "Satellites orbiting and intersecting signal spheres on Earth.",
  sources: [],
  objects: [
    { id: "gps-sat-1", role: "component", shapeType: "custom", label: "GPS Satellite 1", parts: [{ type: "rect", x: 10, y: 10, width: 140, height: 60, fill: "blue", stroke: "cyan", text: "Satellite 1" }] },
    { id: "ground-receiver", role: "subject", shapeType: "custom", label: "Ground Receiver", parts: [{ type: "ellipse", x: 10, y: 10, width: 80, height: 80, fill: "slate", stroke: "yellow", text: "GPS Device" }] },
  ],
  connections: [],
  segments: [
    { id: "s1", title: "Atomic Timing", narration: "GPS satellite sends accurate timing pulses.", targetIds: ["gps-sat-1"], action: "focus", durationMs: 6000 },
  ],
};

const repairedGps = repairAndValidateLessonPlan(gpsPlan);
if (repairedGps.objects.some(o => o.id === "moon-earth-orbital-system" || o.id === "vector-force-balance")) {
  throw new Error("FAILED: GPS lesson was hijacked into Moon-Earth orbit!");
}
if (repairedGps.objects[0].id !== "gps-sat-1") {
  throw new Error("FAILED: GPS object IDs were lost!");
}
console.log("✓ GPS satellite lesson preserved cleanly without Moon-Earth hijacking!");

// 3. Convolutional Neural Network with real parts should NOT be clobbered into a 3-neuron MLP
const cnnPlan = {
  id: "lesson-cnn",
  title: "How Convolutional Neural Networks Process Images",
  question: "Explain convolutional layers and kernel feature maps in deep learning",
  summary: "CNNs apply convolution kernels to extract spatial features before classification.",
  diagramType: "mechanism",
  visualStrategy: "Input image matrix flowing into feature map kernels.",
  sources: [],
  objects: [
    { id: "conv-input-image", role: "input", shapeType: "custom", label: "Input Image 28x28", parts: [{ type: "rect", x: 10, y: 10, width: 100, height: 100, fill: "slate", stroke: "blue", text: "Pixels" }] },
    { id: "conv-kernel-filter", role: "component", shapeType: "custom", label: "3x3 Feature Kernel", parts: [{ type: "rect", x: 10, y: 10, width: 60, height: 60, fill: "violet", stroke: "cyan", text: "Weights" }] },
  ],
  connections: [],
  segments: [
    { id: "s1", title: "Pixel Scanning", narration: "The kernel slides across image pixels to extract edges.", targetIds: ["conv-input-image"], action: "trace", durationMs: 7000 },
  ],
};

const repairedCnn = repairAndValidateLessonPlan(cnnPlan);
if (repairedCnn.objects.some(o => o.id === "nn-formula-loss")) {
  throw new Error("FAILED: CNN was hijacked into the canonical 3-neuron MLP!");
}
if (repairedCnn.objects[0].id !== "conv-input-image") {
  throw new Error("FAILED: CNN objects were clobbered!");
}
console.log("✓ Convolutional Neural Network preserved cleanly!");

console.log("\n=================================================================");
console.log("ALL NON-HIJACKING TESTS PASSED! Top-level diversity guaranteed!");
console.log("=================================================================");
