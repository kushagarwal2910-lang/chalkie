import type { LessonPlan, VisualPart } from "@/lib/lesson-schema";

const part = (value: Partial<VisualPart> & Pick<VisualPart, "type">): VisualPart => ({
  x: 0, y: 0, width: 0, height: 0, data: "", text: "", fill: "none", stroke: "ink", strokeWidth: 2, opacity: 1, ...value,
});

export function createDemoLesson(question = "How do neural networks learn?"): LessonPlan {
  return {
    id: `lesson-${Date.now()}`,
    title: question.replace(/[?.!]+$/, "").slice(0, 82),
    question,
    summary: "At each layer, features are weighted and transformed, then loss feedback computes gradients to tune network weights.",
    diagramType: "cycle",
    visualStrategy: "A canonical layered neural network with input, hidden, and output stages, connected directly to governing learning equations.",
    sources: [
      { id: "source-mit", title: "Introduction to Deep Learning", url: "https://introtodeeplearning.com/", publisher: "MIT", summary: "Core concepts behind training neural networks.", score: 0.97 },
    ],
    objects: [
      {
        id: "nn-input-layer",
        role: "input",
        shapeType: "custom",
        label: "Input Layer (X)",
        labelPlacement: "above",
        x: 80,
        y: 80,
        width: 180,
        height: 360,
        parts: [
          part({ type: "ellipse", x: 45, y: 70, width: 60, height: 60, fill: "blue", stroke: "cyan", strokeWidth: 2.5, text: "x₁", data: "circle" }),
          part({ type: "ellipse", x: 45, y: 160, width: 60, height: 60, fill: "blue", stroke: "cyan", strokeWidth: 2.5, text: "x₂", data: "circle" }),
          part({ type: "ellipse", x: 45, y: 250, width: 60, height: 60, fill: "blue", stroke: "cyan", strokeWidth: 2.5, text: "x₃", data: "circle" }),
        ],
      },
      {
        id: "nn-hidden-layer",
        role: "component",
        shapeType: "custom",
        label: "Hidden Layer (H)",
        labelPlacement: "above",
        x: 340,
        y: 50,
        width: 200,
        height: 420,
        parts: [
          part({ type: "ellipse", x: 50, y: 70, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, text: "h₁", data: "circle" }),
          part({ type: "ellipse", x: 50, y: 150, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, text: "h₂", data: "circle" }),
          part({ type: "ellipse", x: 50, y: 230, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, text: "h₃", data: "circle" }),
          part({ type: "ellipse", x: 50, y: 310, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, text: "h₄", data: "circle" }),
        ],
      },
      {
        id: "nn-output-layer",
        role: "output",
        shapeType: "custom",
        label: "Output Layer (Ŷ)",
        labelPlacement: "above",
        x: 620,
        y: 80,
        width: 180,
        height: 360,
        parts: [
          part({ type: "ellipse", x: 45, y: 140, width: 64, height: 64, fill: "green", stroke: "green", strokeWidth: 2.5, text: "ŷ", data: "circle" }),
        ],
      },
      {
        id: "nn-formula-loss",
        role: "formula",
        shapeType: "custom",
        label: "Governing Learning Equations",
        labelPlacement: "above",
        x: 880,
        y: 60,
        width: 320,
        height: 380,
        parts: [
          part({ type: "rect", x: 12, y: 55, width: 296, height: 75, fill: "none", stroke: "blue", strokeWidth: 1.5, opacity: 0.85 }),
          part({ type: "text", x: 160, y: 76, width: 280, height: 13, text: "Forward Inference:", fill: "cyan" }),
          part({ type: "text", x: 160, y: 104, width: 280, height: 16, text: "ŷ = σ( W₂ · h + b )", fill: "white" }),
          part({ type: "rect", x: 12, y: 145, width: 296, height: 155, fill: "none", stroke: "green", strokeWidth: 1.5, opacity: 0.85 }),
          part({ type: "text", x: 160, y: 170, width: 280, height: 14, text: "Loss Function (MSE):", fill: "yellow" }),
          part({ type: "text", x: 160, y: 196, width: 280, height: 16, text: "L = ½ ( y - ŷ )²", fill: "yellow" }),
          part({ type: "text", x: 160, y: 232, width: 280, height: 13, text: "Backpropagation Gradient:", fill: "cyan" }),
          part({ type: "text", x: 160, y: 262, width: 280, height: 18, text: "ΔW = -η · ( ∂L / ∂W )", fill: "green" }),
          part({ type: "text", x: 160, y: 330, width: 280, height: 12, text: "η: learning rate  ·  σ: activation", fill: "slate" }),
        ],
      },
    ],
    connections: [
      { id: "conn-in-to-hidden", from: "nn-input-layer", to: "nn-hidden-layer", label: "weights W1", color: "violet", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
      { id: "conn-hidden-to-out", from: "nn-hidden-layer", to: "nn-output-layer", label: "weights W2", color: "green", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
      { id: "conn-out-to-loss", from: "nn-output-layer", to: "nn-formula-loss", label: "loss feedback", color: "yellow", route: "straight", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
    ],
    segments: [
      { id: "seg-nn-input", title: "Input Layer Features", targetIds: ["nn-input-layer"], action: "reveal", durationMs: 7500, narration: "At the input layer, numerical feature values x₁ through x₃ enter the neural network as input signals." },
      { id: "seg-nn-hidden", title: "Hidden Layer Processing", targetIds: ["nn-hidden-layer"], action: "focus", durationMs: 8500, narration: "These features flow across weighted connections into hidden neurons h₁ through h₄, where inputs are multiplied by weights W₁ and activated non-linearly." },
      { id: "seg-nn-output", title: "Output Layer Prediction", targetIds: ["nn-output-layer"], action: "trace", durationMs: 7500, narration: "The activated hidden representations combine across weights W₂ into the output layer to compute the network's prediction, y-hat." },
      { id: "seg-nn-loss-backprop", title: "Loss & Backpropagation", targetIds: ["nn-formula-loss"], action: "pulse", durationMs: 9500, narration: "Finally, the loss function evaluates error between prediction and true labels, and backpropagation calculates gradients to adjust weights by delta W, optimizing accuracy." },
    ],
  };
}
