import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

const samplePlan = {
  id: "test-lesson",
  title: "Test Lesson",
  question: "How does a neuron transmit signals?",
  diagramType: "mechanism",
  visualStrategy: "Neuron signaling mechanism with soma, axon, and synapse",
  objects: [
    {
      id: "soma",
      role: "container",
      label: "Neuron Soma",
      width: 320,
      height: 240,
      x: 100,
      y: 100,
      parts: [],
    },
    {
      id: "nucleus",
      role: "component",
      label: "Cell Nucleus",
      width: 100,
      height: 100,
      x: 150,
      y: 150,
      parts: [],
    },
    {
      id: "axon",
      role: "component",
      label: "Axon Terminal",
      width: 220,
      height: 120,
      x: 480,
      y: 140,
      parts: [],
    },
    {
      id: "synapse",
      role: "output",
      label: "Synaptic Cleft",
      width: 180,
      height: 110,
      x: 750,
      y: 140,
      parts: [],
    },
  ],
  connections: [
    {
      id: "conn-1",
      from: "soma",
      to: "axon",
      label: "action potential",
      fromAnchor: "right",
      toAnchor: "left",
      route: "straight",
    },
    {
      id: "conn-2",
      from: "axon",
      to: "synapse",
      label: "neurotransmitter release",
      fromAnchor: "right",
      toAnchor: "left",
      route: "straight",
    },
  ],
  segments: [
    {
      id: "seg-1",
      title: "Neuron Soma",
      narration: "The cell body initiates the electrical impulse.",
      targetIds: ["soma"],
      action: "reveal",
      durationMs: 4000,
    },
  ],
};

const elkGraph = {
  id: "root",
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.spacing.nodeNode": "48",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.padding": "[top=40,left=40,bottom=40,right=40]",
  },
  children: [
    {
      id: "soma",
      width: 320,
      height: 240,
      layoutOptions: {
        "elk.padding": "[top=60,left=24,bottom=24,right=24]",
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": "(320, 240)",
      },
      children: [
        { id: "nucleus", width: 100, height: 100 },
      ],
    },
    { id: "axon", width: 220, height: 120 },
    { id: "synapse", width: 180, height: 110 },
  ],
  edges: [
    { id: "conn-1", sources: ["soma"], targets: ["axon"] },
    { id: "conn-2", sources: ["axon"], targets: ["synapse"] },
  ],
};

const layouted = await elk.layout(elkGraph);
console.log("ELK output root:", { width: layouted.width, height: layouted.height });
for (const child of layouted.children) {
  console.log(`Node ${child.id}: x=${child.x}, y=${child.y}, w=${child.width}, h=${child.height}`);
  if (child.children) {
    for (const sub of child.children) {
      console.log(`  SubNode ${sub.id}: x=${sub.x} (abs: ${child.x + sub.x}), y=${sub.y} (abs: ${child.y + sub.y}), w=${sub.width}, h=${sub.height}`);
    }
  }
}
