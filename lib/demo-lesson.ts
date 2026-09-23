import type { LessonPlan, VisualPart } from "@/lib/lesson-schema";

const part = (value: Partial<VisualPart> & Pick<VisualPart, "type">): VisualPart => ({
  x: 0, y: 0, width: 0, height: 0, data: "", text: "", fill: "none", stroke: "ink", strokeWidth: 2, opacity: 1, ...value,
});

export function createDemoLesson(question = "How do neural networks learn?"): LessonPlan {
  return {
    id: `lesson-${Date.now()}`,
    title: question.replace(/[?.!]+$/, "").slice(0, 82),
    question,
    summary: "A prediction is compared with the correct answer, then feedback adjusts the network before the cycle repeats.",
    diagramType: "cycle",
    visualStrategy: "A looping signal path with a layered network, prediction gauge, error pulse, and feedback motion.",
    sources: [
      { id: "source-mit", title: "Introduction to Deep Learning", url: "https://introtodeeplearning.com/", publisher: "MIT", summary: "Core concepts behind training neural networks.", score: 0.97 },
    ],
    objects: [
      { id: "example", role: "input", shapeType: "custom", label: "example", labelPlacement: "below", x: 40, y: 230, width: 150, height: 120, parts: [part({ type: "rect", x: 18, y: 16, width: 64, height: 58, fill: "violet", stroke: "violet", strokeWidth: 2 }), part({ type: "line", x: 32, y: 45, width: 14, height: -12, stroke: "white", strokeWidth: 3 }), part({ type: "line", x: 46, y: 33, width: 22, height: 26, stroke: "white", strokeWidth: 3 })] },
      { id: "network", role: "subject", shapeType: "custom", label: "network", labelPlacement: "below", x: 270, y: 145, width: 260, height: 260, parts: [part({ type: "ellipse", x: 8, y: 12, width: 18, height: 18, fill: "blue", stroke: "blue", strokeWidth: 2 }), part({ type: "ellipse", x: 41, y: 5, width: 18, height: 18, fill: "cyan", stroke: "cyan", strokeWidth: 2 }), part({ type: "ellipse", x: 41, y: 38, width: 18, height: 18, fill: "cyan", stroke: "cyan", strokeWidth: 2 }), part({ type: "ellipse", x: 74, y: 22, width: 18, height: 18, fill: "blue", stroke: "blue", strokeWidth: 2 }), part({ type: "line", x: 26, y: 21, width: 15, height: -7, stroke: "slate", strokeWidth: 1.5 }), part({ type: "line", x: 26, y: 21, width: 15, height: 26, stroke: "slate", strokeWidth: 1.5 }), part({ type: "line", x: 59, y: 14, width: 15, height: 17, stroke: "slate", strokeWidth: 1.5 }), part({ type: "line", x: 59, y: 47, width: 15, height: -16, stroke: "slate", strokeWidth: 1.5 })] },
      { id: "prediction", role: "output", shapeType: "custom", label: "prediction", labelPlacement: "below", x: 650, y: 85, width: 180, height: 150, parts: [part({ type: "path", data: "M15 72 A38 38 0 0 1 85 72", fill: "none", stroke: "orange", strokeWidth: 4 }), part({ type: "line", x: 50, y: 70, width: 22, height: -32, stroke: "ink", strokeWidth: 3 }), part({ type: "ellipse", x: 46, y: 66, width: 8, height: 8, fill: "ink", stroke: "ink", strokeWidth: 1 })] },
      { id: "error", role: "force", shapeType: "custom", label: "error signal", labelPlacement: "below", x: 700, y: 350, width: 160, height: 130, parts: [part({ type: "polyline", data: "6,55 20,55 28,22 40,82 52,40 64,55 94,55", fill: "none", stroke: "red", strokeWidth: 4 })] },
      { id: "feedback", role: "component", shapeType: "custom", label: "adjustment", labelPlacement: "below", x: 310, y: 500, width: 250, height: 120, parts: [part({ type: "path", data: "M88 50 A38 34 0 1 1 30 23", fill: "none", stroke: "green", strokeWidth: 4 }), part({ type: "polygon", data: "25,13 42,20 29,32", fill: "green", stroke: "green", strokeWidth: 1 })] },
    ],
    connections: [
      { id: "example-network", from: "example", to: "network", label: "signal", color: "violet", route: "elbow", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: 0 },
      { id: "network-prediction", from: "network", to: "prediction", label: "guess", color: "blue", route: "curve", fromAnchor: "right", toAnchor: "left", arrowhead: "arrow", bend: -35 },
      { id: "prediction-error", from: "prediction", to: "error", label: "compare", color: "orange", route: "elbow", fromAnchor: "bottom", toAnchor: "top", arrowhead: "arrow", bend: 0 },
      { id: "error-feedback", from: "error", to: "feedback", label: "gradient", color: "red", route: "curve", fromAnchor: "left", toAnchor: "right", arrowhead: "arrow", bend: 45 },
      { id: "feedback-network", from: "feedback", to: "network", label: "update", color: "green", route: "elbow", fromAnchor: "top", toAnchor: "bottom", arrowhead: "arrow", bend: 0 },
    ],
    segments: [
      { id: "step-predict", title: "Make a prediction", narration: "The example enters the network, where layers combine signals into a current best guess.", targetIds: ["example", "network", "prediction"], action: "flow", durationMs: 9000 },
      { id: "step-measure", title: "Measure the miss", narration: "The prediction is compared with the correct answer, turning the miss into an error signal.", targetIds: ["prediction", "error"], action: "pulse", durationMs: 9000 },
      { id: "step-feedback", title: "Adjust and repeat", narration: "That signal travels backward and nudges the network before the next example begins the cycle again.", targetIds: ["error", "feedback", "network"], action: "flow", durationMs: 10000 },
    ],
  };
}
