import { lessonPlanSchema } from "../lib/lesson-schema.ts";
import { repairAndValidateLessonPlan, normalizeLessonLayout } from "../lib/lesson-layout.ts";

console.log("=== Testing Chalkie Canvas Templates System ===");

// 1. Test: Direct Neural Network custom-template
const neuralNetworkPlan = {
  id: "lesson-nn-test",
  title: "Neural Networks & Deep Learning",
  question: "How do neural networks work?",
  summary: "An overview of perceptrons, hidden layers, and feedforward propagation.",
  diagramType: "system",
  visualStrategy: "Network Graph",
  sources: [],
  objects: [
    {
      id: "nn-architecture",
      role: "subject",
      shapeType: "custom-template",
      label: "Multilayer Perceptron",
      labelPlacement: "above",
      x: 80,
      y: 80,
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
            templateType: "network-graph",
            title: "Multilayer Perceptron (MLP)",
            subtitle: "3-Layer Feedforward Network",
            groups: [
              { label: "Input Layer", color: "blue", nodes: ["x₁", "x₂", "x₃"] },
              { label: "Hidden Layer", color: "violet", nodes: ["h₁", "h₂", "h₃", "h₄"] },
              { label: "Output Layer", color: "emerald", nodes: ["ŷ"] },
            ],
            connections: "fully-connected",
          }),
          text: "network-graph",
          fill: "slate",
          stroke: "slate",
          strokeWidth: 2,
          opacity: 1,
        },
      ],
      props: {
        templateType: "network-graph",
        title: "Multilayer Perceptron (MLP)",
        themeColor: "violet",
        data: {
          groups: [
            { label: "Input Layer", color: "blue", nodes: ["x₁", "x₂", "x₃"] },
            { label: "Hidden Layer", color: "violet", nodes: ["h₁", "h₂", "h₃", "h₄"] },
            { label: "Output Layer", color: "emerald", nodes: ["ŷ"] },
          ],
          connections: "fully-connected",
        },
      },
    },
  ],
  connections: [],
  segments: [
    {
      id: "seg-1",
      title: "Input Layer",
      narration: "Raw numerical inputs enter the network through input nodes.",
      targetIds: ["nn-architecture"],
      action: "focus",
      durationMs: 5000,
    },
    {
      id: "seg-2",
      title: "Hidden Layer Processing",
      narration: "Hidden layers apply weighted sums and non-linear activation functions.",
      targetIds: ["nn-architecture"],
      action: "pulse",
      durationMs: 6000,
    },
  ],
};

const parsedNN = lessonPlanSchema.safeParse(neuralNetworkPlan);
console.log("1. Neural Network Plan Zod Validation:", parsedNN.success ? "✅ PASSED" : `❌ FAILED: ${JSON.stringify(parsedNN.error)}`);

const normalizedNN = normalizeLessonLayout(neuralNetworkPlan);
console.log("2. Normalized NN Object shapeType:", normalizedNN.objects[0].shapeType);
console.log("   Normalized NN Object dimensions:", `${normalizedNN.objects[0].width}x${normalizedNN.objects[0].height}`);

// 2. Test: Auto-Upgrade of Fragmented Neural Network (the exact problem user showed!)
const fragmentedUserCase = {
  id: "lesson-frag-nn",
  title: "Perceptrons & Neural Networks",
  question: "How do neural networks learn?",
  summary: "Testing consolidation of fragmented boxes.",
  diagramType: "structure",
  visualStrategy: "System",
  sources: [],
  objects: [
    {
      id: "big-nn-box",
      role: "container",
      shapeType: "geo",
      label: "Neural Network",
      labelPlacement: "above",
      x: 100,
      y: 100,
      width: 500,
      height: 350,
      parts: [],
    },
    {
      id: "neuron-input-1",
      role: "component",
      shapeType: "geo",
      label: "Input Layer Neuron 1",
      labelPlacement: "below",
      x: 30,
      y: 120,
      width: 40,
      height: 40,
      parts: [],
    },
    {
      id: "neuron-hidden-1",
      role: "component",
      shapeType: "geo",
      label: "Hidden Layer Neuron 1",
      labelPlacement: "below",
      x: 30,
      y: 180,
      width: 40,
      height: 40,
      parts: [],
    },
  ],
  connections: [],
  segments: [
    {
      id: "seg-1",
      title: "Overview",
      narration: "Neural networks process information.",
      targetIds: ["big-nn-box"],
      action: "focus",
      durationMs: 5000,
    },
  ],
};

const repairedFrag = repairAndValidateLessonPlan(fragmentedUserCase);
console.log("3. Fragmented NN Auto-Upgrade Result:");
console.log("   Number of objects:", repairedFrag.objects.length);
console.log("   First object shapeType:", repairedFrag.objects[0].shapeType);
console.log("   First object label:", repairedFrag.objects[0].label);
console.log("   First object templateType:", repairedFrag.objects[0].props?.templateType);
console.log("   Target IDs in segment:", repairedFrag.segments[0].targetIds);

// 3. Test: All 6 templates in lessonPlanSchema
const templateTypes = [
  "network-graph",
  "hero-breakdown",
  "process-cycle",
  "timeline",
  "comparison-grid",
  "layered-stack",
];

for (const t of templateTypes) {
  const plan = {
    id: `lesson-${t}`,
    title: `Test ${t}`,
    question: `Explain ${t}`,
    summary: `Testing ${t}`,
    diagramType: "system",
    visualStrategy: "Template",
    sources: [],
    objects: [
      {
        id: `obj-${t}`,
        role: "subject",
        shapeType: "custom-template",
        label: `Diagram for ${t}`,
        width: 640,
        height: 420,
        parts: [],
        props: { templateType: t, data: {} },
      },
    ],
    connections: [],
    segments: [
      {
        id: "s1",
        title: "Step 1",
        narration: `Explaining ${t}`,
        targetIds: [`obj-${t}`],
        action: "focus",
        durationMs: 5000,
      },
    ],
  };

  const res = lessonPlanSchema.safeParse(plan);
  if (!res.success) {
    console.error(`❌ Template ${t} failed validation:`, res.error);
  } else {
    console.log(`✅ Template ${t} passed schema validation`);
  }
}

console.log("=== All Tests Completed Successfully ===");
