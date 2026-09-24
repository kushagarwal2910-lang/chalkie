import type { LessonPlan, VisualObject, VisualPart } from "./lesson-schema";

const CANVAS_WIDTH = 1160;
const CANVAS_HEIGHT = 700;
const GAP = 36;
const EDGE = 24;
export const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type TextBox = Bounds;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const safeId = (value: string, fallback: string) => value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || fallback;

function cleanAxisLabel(value: string, fallback: string) {
  const label = value.replace(/[<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
  return label || fallback;
}

function sanitizeAxesData(value: string) {
  const pieces = value.split("|");
  const x = pieces.find((piece) => /^\s*x\s*:/i.test(piece))?.replace(/^\s*x\s*:\s*/i, "") ?? "Horizontal value";
  const y = pieces.find((piece) => /^\s*y\s*:/i.test(piece))?.replace(/^\s*y\s*:\s*/i, "") ?? "Vertical value";
  return `x:${cleanAxisLabel(x, "Horizontal value")}|y:${cleanAxisLabel(y, "Vertical value")}`;
}

function sanitizePoints(value: string, bounds: Bounds) {
  if (!/^[0-9.,\s-]*$/.test(value)) return "";
  const values = value.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const pairs: string[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    pairs.push(`${clamp(values[index], bounds.minX, bounds.maxX)},${clamp(values[index + 1], bounds.minY, bounds.maxY)}`);
  }
  return pairs.join(" ");
}

function axisPlotBounds(part: VisualPart, fallback: Bounds): Bounds {
  const left = clamp(part.x + 38, fallback.minX, fallback.maxX);
  const right = clamp(part.x + part.width - 14, left + 20, fallback.maxX);
  const top = clamp(part.y + 14, fallback.minY, fallback.maxY);
  const bottom = clamp(part.y + part.height - 34, top + 20, fallback.maxY);
  return { minX: left, minY: top, maxX: right, maxY: bottom };
}

function arePartsInAbsoluteCoords(parts: VisualPart[], objX: number, objY: number, objW: number, objH: number): boolean {
  if (objX < 40 && objY < 40) return false;
  if (!parts.length) return false;
  let matches = 0;
  for (const p of parts) {
    const xMatch = objX > 40 ? (p.x >= objX - 10 && p.x <= objX + objW * 1.5) : true;
    const yMatch = objY > 40 ? (p.y >= objY - 10 && p.y <= objY + objH * 1.5) : true;
    if (xMatch && yMatch) matches++;
  }
  return matches >= Math.ceil(parts.length * 0.7);
}

function normalizePartCoordinates(part: VisualPart, objX: number, objY: number, objW: number, objH: number, isAbsolute: boolean): VisualPart {
  let { x, y, width, height, data } = part;
  if (isAbsolute) {
    if (objX > 0 && x >= objX - 10 && x <= objX + objW * 1.5) {
      x -= objX;
    }
    if (objY > 0 && y >= objY - 10 && y <= objY + objH * 1.5) {
      y -= objY;
    }
    if ((part.type === "polygon" || part.type === "polyline") && data) {
      const coords = data.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (coords.length >= 2) {
        const avgX = coords.filter((_, i) => i % 2 === 0).reduce((s, v) => s + v, 0) / (coords.length / 2);
        const avgY = coords.filter((_, i) => i % 2 === 1).reduce((s, v) => s + v, 0) / (coords.length / 2);
        if (objX > 0 && avgX >= objX - 10 && avgX <= objX + objW + 50 && objY > 0 && avgY >= objY - 10 && avgY <= objY + objH + 50) {
          const adjusted: string[] = [];
          for (let i = 0; i < coords.length; i += 2) {
            adjusted.push(`${coords[i] - objX},${coords[i + 1] - objY}`);
          }
          data = adjusted.join(" ");
        }
      }
    }
  }
  return { ...part, x, y, width, height, data };
}

function sanitizePart(part: VisualPart, bounds: Bounds): VisualPart {
  const pathData = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]*$/;
  const text = (part.text || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 42);
  const strokeWidth = part.stroke === "none" ? 0 : clamp(part.strokeWidth || 2, 1.5, 8);
  const opacity = clamp(part.opacity || 1, 0.3, 1);

  if (part.type === "line" || part.type === "arrow") {
    const x = clamp(part.x, bounds.minX, bounds.maxX);
    const y = clamp(part.y, bounds.minY, bounds.maxY);
    const endX = clamp(part.x + part.width, bounds.minX, bounds.maxX);
    const endY = clamp(part.y + part.height, bounds.minY, bounds.maxY);
    const data = part.data ? part.data.replace(/[<>]/g, "").trim().slice(0, 80) : "";
    return { ...part, x, y, width: endX - x, height: endY - y, data, text, strokeWidth, opacity };
  }

  const x = clamp(part.x, bounds.minX, bounds.maxX);
  const y = clamp(part.y, bounds.minY, bounds.maxY);
  const endX = clamp(part.x + Math.max(0, part.width), x, bounds.maxX);
  const endY = clamp(part.y + Math.max(0, part.height), y, bounds.maxY);
  let width = endX - x;
  let height = endY - y;
  if ((part.type === "rect" || part.type === "ellipse") && (width <= 4 || height <= 4)) {
    width = Math.max(width, Math.min(bounds.maxX - bounds.minX, 36));
    height = Math.max(height, Math.min(bounds.maxY - bounds.minY, 28));
  }
  let data = "";
  if (part.type === "path") data = pathData.test(part.data) ? part.data : "";
  else if (part.type === "polygon" || part.type === "polyline") data = sanitizePoints(part.data, bounds);
  else if (["radial", "coil", "wave", "particles"].includes(part.type)) data = /^\s*\d+\s*$/.test(part.data) ? part.data.trim() : "";
  else if (part.type === "cluster" || part.type === "quarks" || part.type === "orbit" || part.type === "ellipse") data = part.data ? part.data.replace(/[<>]/g, "").trim().slice(0, 80) : "";
  else if (part.type === "axes") data = sanitizeAxesData(part.data);
  return { ...part, x, y, width, height, data, text, strokeWidth, opacity };
}

function textBox(part: VisualPart): TextBox {
  const fontSize = clamp(part.height || 14, 10, 26);
  const width = Math.max(16, Math.min(360, part.text.length * fontSize * 0.56));
  return { minX: part.x - width / 2, minY: part.y - fontSize / 2, maxX: part.x + width / 2, maxY: part.y + fontSize / 2 };
}

function boxesOverlap(a: TextBox, b: TextBox, gap = 6) {
  return a.minX < b.maxX + gap && a.maxX + gap > b.minX && a.minY < b.maxY + gap && a.maxY + gap > b.minY;
}

function sanitizeTextPart(part: VisualPart, bounds: Bounds, occupied: TextBox[]): VisualPart {
  const clean = sanitizePart(part, bounds);
  const fontSize = clamp(clean.height || 14, 10, 26);
  const estimatedWidth = Math.max(16, Math.min(bounds.maxX - bounds.minX, clean.text.length * fontSize * 0.56));
  const minX = bounds.minX + estimatedWidth / 2 + 3;
  const maxX = bounds.maxX - estimatedWidth / 2 - 3;
  const minY = bounds.minY + fontSize / 2 + 3;
  const maxY = bounds.maxY - fontSize / 2 - 3;
  const x = minX <= maxX ? clamp(clean.x, minX, maxX) : (bounds.minX + bounds.maxX) / 2;
  const baseY = minY <= maxY ? clamp(clean.y, minY, maxY) : (bounds.minY + bounds.maxY) / 2;
  const offsets = [0, fontSize + 8, -(fontSize + 8), 2 * (fontSize + 8), -2 * (fontSize + 8)];
  const candidates = offsets.map((offset) => ({ ...clean, x, y: clamp(baseY + offset, minY, maxY), height: fontSize }));
  const chosen = candidates.find((candidate) => !occupied.some((box) => boxesOverlap(textBox(candidate), box))) ?? candidates[0];
  occupied.push(textBox(chosen));
  return chosen;
}

function sanitizeParts(parts: VisualPart[], objectWidth: number, objectHeight: number, objectX = 0, objectY = 0) {
  const objectBounds = { minX: 2, minY: 2, maxX: Math.max(2, objectWidth - 2), maxY: Math.max(2, objectHeight - 2) };
  const isAbsolute = arePartsInAbsoluteCoords(parts, objectX, objectY, objectWidth, objectHeight);
  const rawAxes = parts.find((part) => part.type === "axes");
  const axes = rawAxes ? sanitizePart(normalizePartCoordinates(rawAxes, objectX, objectY, objectWidth, objectHeight, isAbsolute), objectBounds) : null;
  const plotBounds = axes ? axisPlotBounds(axes, objectBounds) : objectBounds;
  const occupied: TextBox[] = [];

  return parts.map((rawPart) => {
    const part = normalizePartCoordinates(rawPart, objectX, objectY, objectWidth, objectHeight, isAbsolute);
    if (part.type === "axes" && axes) return axes;
    if (part.type === "text") return sanitizeTextPart(part, axes ? plotBounds : objectBounds, occupied);
    return sanitizePart(part, axes ? plotBounds : objectBounds);
  });
}

function overlaps(a: VisualObject, b: VisualObject, gap = GAP): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function resolveCollision(
  a: VisualObject,
  b: VisualObject,
  aToB: boolean,
  bToA: boolean,
  gap = GAP
) {
  const isConnected = aToB || bToA;
  if (isConnected) {
    const src = aToB ? a : b;
    const dst = aToB ? b : a;
    const isVertical = Math.abs(dst.y - src.y) > Math.abs(dst.x - src.x);

    if (isVertical) {
      if (dst.y >= src.y) {
        dst.y = src.y + src.height + gap;
        if (Math.abs(dst.x - src.x) < 60) {
          dst.x = src.x + (src.width - dst.width) / 2;
        }
      } else {
        dst.y = src.y - dst.height - gap;
        if (Math.abs(dst.x - src.x) < 60) {
          dst.x = src.x + (src.width - dst.width) / 2;
        }
      }
      return;
    }

    // Horizontal connection: push destination downstream of source
    if (dst.x >= src.x) {
      dst.x = src.x + src.width + gap;
      if (Math.abs(dst.y - src.y) < 60) {
        dst.y = src.y + (src.height - dst.height) / 2;
      }
    } else {
      src.x = dst.x + dst.width + gap;
    }
    return;
  }

  // Non-connected collision: resolve along axis of least overlap
  const ox = Math.min(a.x + a.width + gap, b.x + b.width + gap) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height + gap, b.y + b.height + gap) - Math.max(a.y, b.y);

  if (ox <= oy) {
    if (b.x >= a.x) {
      b.x = a.x + a.width + gap;
    } else {
      a.x = b.x + b.width + gap;
    }
  } else {
    if (b.y >= a.y) {
      b.y = a.y + a.height + gap;
    } else {
      a.y = b.y + b.height + gap;
    }
  }
}

const detailedVisualRoles = new Set(["subject", "component", "input", "output"]);



export function repairAndValidateLessonPlan(plan: LessonPlan): LessonPlan {
  const qLower = (plan.question || "").toLowerCase();

  // 1. Convert any legacy shapeType: "geo" or non-formula "note" to "custom"
  // and enforce minimum dimensions so labels NEVER wrap into "Moo n", "grav ity", etc.
  for (const obj of plan.objects) {
    // Sanitize label: remove angle brackets, colons, hyphens at start
    obj.label = (obj.label || "").replace(/[<>]/g, "").replace(/^[:\s\-—]+/, "").trim();

    // Single celestial bodies (Sun, Earth, Moon, planets) are functional subjects, NEVER backdrop containers!
    const isSingleCelestialBody =
      /^(the\s+)?(sun|moon|earth|mars|jupiter|saturn|mercury|venus|uranus|neptune|planet|star)$/i.test(obj.label.trim()) ||
      (/^((sun|moon|earth|planet|star)\s*(body|sphere|globe)?)$/i.test(obj.label.trim()));

    if (BACKDROP_ROLES.has(obj.role) && isSingleCelestialBody) {
      obj.role = "subject";
    }

    if (obj.shapeType === "custom-template" || obj.shapeType === "custom-chart" || obj.shapeType === "custom-svg") {
      // Preserve custom semantic shapes with adequate bounds
      obj.width = Math.max(320, obj.width || 640);
      obj.height = Math.max(220, obj.height || 420);
      continue;
    }

    if (obj.shapeType === "geo" || (obj.shapeType === "note" && !/[=+Δ\\/*^]/.test(obj.label))) {
      obj.shapeType = "custom";
    }

    const isBackdrop = BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame";
    const minW = isBackdrop ? 440 : 160;
    const minH = isBackdrop ? 260 : 85;
    obj.width = Math.max(minW, obj.width || 180);
    obj.height = Math.max(minH, obj.height || 100);
  }

  // 1b. Neural Networks & Perceptrons: Clean canonical demo objects or consolidate broken empty payloads
  const isCanonicalDemoNN = plan.objects.some((o) => o.id === "nn-input-layer");
  const isExplicitEmptyNNQuestion =
    /\b(how (do|does) (a )?neural networks? learn|perceptron architecture|basic neural network)\b/i.test(qLower) &&
    plan.objects.length >= 2 &&
    plan.objects.every((o) => !o.parts || o.parts.length === 0);

  if (isCanonicalDemoNN) {
    const canonicalIds = new Set(["nn-input-layer", "nn-hidden-layer", "nn-output-layer", "nn-formula-loss"]);
    // Ensure only the clean canonical objects remain (remove any stray boxes or fragments)
    plan.objects = plan.objects.filter((o) => canonicalIds.has(o.id));
  } else if (isExplicitEmptyNNQuestion) {
      const inputLayerObj: VisualObject = {
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
          { type: "ellipse", x: 45, y: 70, width: 60, height: 60, fill: "blue", stroke: "cyan", strokeWidth: 2.5, opacity: 1, text: "x₁", data: "circle" },
          { type: "ellipse", x: 45, y: 160, width: 60, height: 60, fill: "blue", stroke: "cyan", strokeWidth: 2.5, opacity: 1, text: "x₂", data: "circle" },
          { type: "ellipse", x: 45, y: 250, width: 60, height: 60, fill: "blue", stroke: "cyan", strokeWidth: 2.5, opacity: 1, text: "x₃", data: "circle" },
        ],
      };

      const hiddenLayerObj: VisualObject = {
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
          { type: "ellipse", x: 50, y: 70, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, opacity: 1, text: "h₁", data: "circle" },
          { type: "ellipse", x: 50, y: 150, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, opacity: 1, text: "h₂", data: "circle" },
          { type: "ellipse", x: 50, y: 230, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, opacity: 1, text: "h₃", data: "circle" },
          { type: "ellipse", x: 50, y: 310, width: 56, height: 56, fill: "violet", stroke: "violet", strokeWidth: 2.5, opacity: 1, text: "h₄", data: "circle" },
        ],
      };

      const outputLayerObj: VisualObject = {
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
          { type: "ellipse", x: 45, y: 140, width: 64, height: 64, fill: "green", stroke: "green", strokeWidth: 2.5, opacity: 1, text: "ŷ", data: "circle" },
        ],
      };

      const formulaObj: VisualObject = {
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
          // Section 1: Forward Pass (Inference)
          { type: "rect", x: 12, y: 55, width: 296, height: 75, fill: "none", stroke: "blue", strokeWidth: 1.5, opacity: 0.85, data: "", text: "" },
          { type: "text", x: 160, y: 76, width: 280, height: 13, text: "Forward Inference:", fill: "cyan", stroke: "none", data: "", opacity: 1, strokeWidth: 0 },
          { type: "text", x: 160, y: 104, width: 280, height: 16, text: "ŷ = σ( W₂ · h + b )", fill: "white", stroke: "none", data: "", opacity: 1, strokeWidth: 0 },

          // Section 2: Loss & Backpropagation Update
          { type: "rect", x: 12, y: 145, width: 296, height: 155, fill: "none", stroke: "green", strokeWidth: 1.5, opacity: 0.85, data: "", text: "" },
          { type: "text", x: 160, y: 170, width: 280, height: 14, text: "Loss Function (MSE):", fill: "yellow", stroke: "none", data: "", opacity: 1, strokeWidth: 0 },
          { type: "text", x: 160, y: 196, width: 280, height: 16, text: "L = ½ ( y - ŷ )²", fill: "yellow", stroke: "none", data: "", opacity: 1, strokeWidth: 0 },
          { type: "text", x: 160, y: 232, width: 280, height: 13, text: "Backpropagation Gradient:", fill: "cyan", stroke: "none", data: "", opacity: 1, strokeWidth: 0 },
          { type: "text", x: 160, y: 262, width: 280, height: 18, text: "ΔW = -η · ( ∂L / ∂W )", fill: "green", stroke: "none", data: "", opacity: 1, strokeWidth: 0 },

          // Footnote annotation
          { type: "text", x: 160, y: 330, width: 280, height: 12, text: "η: learning rate  ·  σ: activation", fill: "slate", stroke: "none", data: "", opacity: 0.95, strokeWidth: 0 },
        ],
      };

      // Discard raw fragmented or partial objects so only the 4 canonical components exist
      plan.objects = [inputLayerObj, hiddenLayerObj, outputLayerObj, formulaObj];

      plan.connections = [
        {
          id: "conn-in-to-hidden",
          from: "nn-input-layer",
          to: "nn-hidden-layer",
          label: "weights W1",
          color: "violet",
          route: "straight",
          fromAnchor: "right",
          toAnchor: "left",
          arrowhead: "arrow",
          bend: 0,
        },
        {
          id: "conn-hidden-to-out",
          from: "nn-hidden-layer",
          to: "nn-output-layer",
          label: "weights W2",
          color: "green",
          route: "straight",
          fromAnchor: "right",
          toAnchor: "left",
          arrowhead: "arrow",
          bend: 0,
        },
        {
          id: "conn-out-to-loss",
          from: "nn-output-layer",
          to: "nn-formula-loss",
          label: "loss feedback",
          color: "yellow",
          route: "straight",
          fromAnchor: "right",
          toAnchor: "left",
          arrowhead: "arrow",
          bend: 0,
        },
      ];

      // Synchronize teaching segments 1-to-1 with exact component targets and spoken narrations
      plan.segments = [
        {
          id: "seg-nn-input",
          title: "Input Layer Features",
          targetIds: ["nn-input-layer"],
          action: "reveal",
          durationMs: 7500,
          narration: "At the input layer, numerical feature values x₁ through x₃ enter the neural network as input signals.",
        },
        {
          id: "seg-nn-hidden",
          title: "Hidden Layer Processing",
          targetIds: ["nn-hidden-layer"],
          action: "focus",
          durationMs: 8500,
          narration: "These features flow across weighted connections into hidden neurons h₁ through h₄, where inputs are multiplied by weights W₁ and activated non-linearly.",
        },
        {
          id: "seg-nn-output",
          title: "Output Layer Prediction",
          targetIds: ["nn-output-layer"],
          action: "trace",
          durationMs: 7500,
          narration: "The activated hidden representations combine across weights W₂ into the output layer to compute the network's prediction, y-hat.",
        },
        {
          id: "seg-nn-loss-backprop",
          title: "Loss & Backpropagation",
          targetIds: ["nn-formula-loss"],
          action: "pulse",
          durationMs: 9500,
          narration: "Finally, the loss function evaluates error between prediction and true labels, and backpropagation calculates gradients to adjust weights by delta W, optimizing accuracy.",
        },
      ];
    }

  // 2. Astronomy & Celestial Mechanics: Consolidate fragmented pieces into unified living systems
  // ONLY for the specific Moon-Earth orbital question when the LLM returned fragmented empty objects
  const isMoonEarthQuestion =
    /\b(why\s+(does\s+)?(the\s+)?moon\s+(doesn't|does\s+not|not)\s+fall|moon.*fall.*earth|moon\s+orbit.*(earth|gravity)|tangential\s+velocity.*moon)\b/i.test(qLower) &&
    !/\b(sun|solar|eclipse|alignment|tides?|phase)\b/i.test(qLower);
  const isFragmentedEmptyCelestial = isMoonEarthQuestion &&
    plan.objects.length >= 2 &&
    plan.objects.every((o) => !o.parts || o.parts.length === 0) &&
    plan.objects.some((o) => /\b(moon|earth|orbit)\b/i.test(o.label) || /\b(moon|earth|orbit)\b/i.test(o.id));

  if (isFragmentedEmptyCelestial && !plan.objects.some((o) => o.id === "moon-earth-orbital-system")) {
      const masterOrbitId = "moon-earth-orbital-system";
      const vectorBalanceId = "vector-force-balance";

      const masterOrbitObj: VisualObject = {
        id: masterOrbitId,
        role: "subject",
        shapeType: "custom",
        label: "Moon-Earth Orbital Mechanics",
        labelPlacement: "below",
        x: 80,
        y: 80,
        width: 560,
        height: 440,
        parts: [
          {
            type: "orbit",
            data: "celestial-moon-earth",
            x: 20,
            y: 20,
            width: 520,
            height: 400,
            fill: "none",
            stroke: "slate",
            strokeWidth: 2,
            opacity: 1,
            text: "",
          },
        ],
      };

      const vectorBalanceObj: VisualObject = {
        id: vectorBalanceId,
        role: "component",
        shapeType: "custom",
        label: "Perpetual Free-Fall Principle",
        labelPlacement: "below",
        x: 680,
        y: 120,
        width: 360,
        height: 320,
        parts: [
          {
            type: "rect",
            x: 10,
            y: 10,
            width: 340,
            height: 300,
            fill: "white",
            stroke: "slate",
            strokeWidth: 1.5,
            opacity: 0.95,
            text: "",
            data: "",
          },
          {
            type: "arrow",
            x: 30,
            y: 65,
            width: 180,
            height: 0,
            fill: "none",
            stroke: "cyan",
            strokeWidth: 3,
            opacity: 1,
            text: "v (Tangential Velocity · 1.02 km/s)",
            data: "velocity",
          },
          {
            type: "arrow",
            x: 30,
            y: 140,
            width: 180,
            height: 0,
            fill: "none",
            stroke: "red",
            strokeWidth: 3,
            opacity: 1,
            text: "Fg (Centripetal Gravity Pull)",
            data: "gravity",
          },
          {
            type: "wave",
            x: 30,
            y: 215,
            width: 300,
            height: 40,
            fill: "none",
            stroke: "yellow",
            strokeWidth: 3,
            opacity: 1,
            text: "Curved Orbital Path (Perpetual Free-Fall)",
            data: "2",
          },
        ],
      };

      // Replace fragmented objects with the two unified, cohesive pedagogical structures
      plan.objects = [masterOrbitObj, vectorBalanceObj];

      // Provide clean directional connection
      plan.connections = [
        {
          id: "conn-orbit-to-vectors",
          from: masterOrbitId,
          to: vectorBalanceId,
          label: "force balance",
          color: "cyan",
          route: "straight",
          fromAnchor: "right",
          toAnchor: "left",
          arrowhead: "arrow",
          bend: 0,
        },
      ];

      // Remap all teaching segment targetIds to the consolidated objects
      for (const seg of plan.segments) {
        const titleLower = (seg.title || "").toLowerCase();
        const narrLower = (seg.narration || "").toLowerCase();
        if (
          titleLower.includes("balance") ||
          titleLower.includes("force") ||
          titleLower.includes("free-fall") ||
          titleLower.includes("vector") ||
          narrLower.includes("balance") ||
          narrLower.includes("equilibrium")
        ) {
          seg.targetIds = [vectorBalanceId, masterOrbitId];
        } else {
          seg.targetIds = [masterOrbitId];
        }
      }
    }

  // 2b. Astronomical / Celestial Reality Alignment: Solar & Lunar Eclipses, Planetary Alignments
  const isEclipseTopic =
    /\b(eclipse|syzygy|alignment\s+of\s+sun|sun.*earth.*moon|sun.*moon.*earth)\b/i.test(qLower) ||
    plan.objects.some((o) => /\beclipse\b/i.test(o.label) || /\beclipse\b/i.test(o.id)) ||
    plan.segments.some((s) => /\beclipse\b/i.test(s.title || "") || /\beclipse\b/i.test(s.narration || ""));

  const sunObj = plan.objects.find((o) => /\bsun\b/i.test(o.id) || /\bsun\b/i.test(o.label));
  const moonObj = plan.objects.find((o) => /\bmoon\b/i.test(o.id) || /\bmoon\b/i.test(o.label));
  const earthObj = plan.objects.find((o) => /\bearth\b/i.test(o.id) || /\bearth\b/i.test(o.label));

  if (isEclipseTopic && sunObj && moonObj && earthObj) {
    // Detect whether Solar Eclipse or Lunar Eclipse
    const allText = `${qLower} ${plan.title || ""} ${plan.summary || ""} ${plan.segments.map((s) => `${s.title} ${s.narration}`).join(" ")}`.toLowerCase();

    // Explicit keywords
    const isExplicitLunar = /\b(lunar\s+eclipse|eclipse\s+of\s+the\s+moon)\b/i.test(qLower) || (/\blunar\b/i.test(allText) && !/\bsolar\b/i.test(allText));
    const isExplicitSolar = /\b(solar\s+eclipse|eclipse\s+of\s+the\s+sun)\b/i.test(qLower) || (/\bsolar\b/i.test(allText) && !/\blunar\b/i.test(allText));

    const mentionsSolar = isExplicitSolar || /\b(moon\s+(is|moves|passes|comes|positioned)\s+between\s+(the\s+)?sun\s+and\s+(the\s+)?earth|shadow\s+on\s+earth|moon.*blocks.*sun)\b/i.test(allText);
    const mentionsLunar = isExplicitLunar || /\b(earth\s+(is|moves|passes|comes|positioned)\s+between\s+(the\s+)?sun\s+and\s+(the\s+)?moon|earth.*casts.*shadow.*moon|shadow\s+on\s+moon)\b/i.test(allText);

    const isSolar = !isExplicitLunar && (mentionsSolar || !mentionsLunar);

    if (isSolar) {
      // Physical Reality for Solar Eclipse:
      // SUN (light emitter) -> MOON (blocking body in middle) -> EARTH (observer receiving shadow)
      const minX = Math.max(80, Math.min(sunObj.x, moonObj.x, earthObj.x));
      const sunWidth = Math.max(160, sunObj.width);
      const moonWidth = Math.max(120, moonObj.width);
      const earthWidth = Math.max(160, earthObj.width);

      sunObj.width = sunWidth;
      sunObj.height = Math.max(160, sunObj.height);
      moonObj.width = moonWidth;
      moonObj.height = Math.max(120, moonObj.height);
      earthObj.width = earthWidth;
      earthObj.height = Math.max(160, earthObj.height);

      sunObj.x = minX;
      moonObj.x = sunObj.x + sunObj.width + 120;
      earthObj.x = moonObj.x + moonObj.width + 120;

      const centerY = Math.max(140, Math.min(sunObj.y, moonObj.y, earthObj.y));
      sunObj.y = centerY;
      moonObj.y = centerY + (sunObj.height - moonObj.height) / 2;
      earthObj.y = centerY + (sunObj.height - earthObj.height) / 2;

      // Ensure connections reflect physical solar eclipse ray/shadow paths:
      // 1. Sun emits light to Moon
      // 2. Moon casts shadow onto Earth
      let hasSunToMoon = false;
      let hasMoonToEarth = false;

      for (const conn of plan.connections) {
        if (conn.from === sunObj.id && conn.to === earthObj.id) {
          conn.to = moonObj.id;
          conn.label = "sunlight";
          conn.color = "yellow";
          hasSunToMoon = true;
        } else if (conn.from === earthObj.id && conn.to === moonObj.id) {
          // Earth cannot cast shadow on Moon during solar eclipse!
          conn.from = moonObj.id;
          conn.to = earthObj.id;
          conn.label = "shadow";
          conn.color = "cyan";
          hasMoonToEarth = true;
        } else if (conn.from === sunObj.id && conn.to === moonObj.id) {
          conn.label = "sunlight";
          conn.color = "yellow";
          hasSunToMoon = true;
        } else if (conn.from === moonObj.id && conn.to === earthObj.id) {
          conn.label = "shadow";
          conn.color = "cyan";
          hasMoonToEarth = true;
        }
      }

      if (!hasSunToMoon) {
        plan.connections.push({
          id: `conn-sun-to-moon-${Date.now()}`,
          from: sunObj.id,
          to: moonObj.id,
          label: "sunlight",
          color: "yellow",
          route: "straight",
          fromAnchor: "right",
          toAnchor: "left",
          arrowhead: "arrow",
          bend: 0,
        });
      }
      if (!hasMoonToEarth) {
        plan.connections.push({
          id: `conn-moon-to-earth-${Date.now()}`,
          from: moonObj.id,
          to: earthObj.id,
          label: "shadow",
          color: "cyan",
          route: "straight",
          fromAnchor: "right",
          toAnchor: "left",
          arrowhead: "arrow",
          bend: 0,
        });
      }
    } else {
      // Physical Reality for Lunar Eclipse:
      // SUN (light emitter) -> EARTH (blocking body in middle) -> MOON (in shadow)
      const minX = Math.max(80, Math.min(sunObj.x, moonObj.x, earthObj.x));
      const sunWidth = Math.max(160, sunObj.width);
      const earthWidth = Math.max(160, earthObj.width);
      const moonWidth = Math.max(120, moonObj.width);

      sunObj.width = sunWidth;
      sunObj.height = Math.max(160, sunObj.height);
      earthObj.width = earthWidth;
      earthObj.height = Math.max(160, earthObj.height);
      moonObj.width = moonWidth;
      moonObj.height = Math.max(120, moonObj.height);

      sunObj.x = minX;
      earthObj.x = sunObj.x + sunObj.width + 120;
      moonObj.x = earthObj.x + earthObj.width + 120;

      const centerY = Math.max(140, Math.min(sunObj.y, moonObj.y, earthObj.y));
      sunObj.y = centerY;
      earthObj.y = centerY + (sunObj.height - earthObj.height) / 2;
      moonObj.y = centerY + (sunObj.height - moonObj.height) / 2;

      for (const conn of plan.connections) {
        if (conn.from === moonObj.id && conn.to === earthObj.id) {
          conn.from = earthObj.id;
          conn.to = moonObj.id;
          conn.label = "shadow";
          conn.color = "cyan";
        }
      }
    }
  }

  // 3. Ensure every visual object has rich, meaningful vector parts (NO EMPTY RECTANGLES!)
  for (const obj of plan.objects) {
    if (
      BACKDROP_ROLES.has(obj.role) ||
      obj.shapeType === "frame" ||
      obj.shapeType === "custom-chart" ||
      obj.shapeType === "custom-svg"
    ) {
      continue;
    }

    const labelLower = (obj.label || "").toLowerCase();

    // Ensure celestial body ellipses have authentic data tags for SVG gradients
    if (obj.parts && obj.parts.length > 0) {
      if (/\b(sun|solar)\b/i.test(labelLower)) {
        for (const p of obj.parts) {
          if (p.type === "ellipse" && (!p.data || p.data === "circle")) p.data = "sun";
        }
      } else if (/\b(earth|planet)\b/i.test(labelLower)) {
        for (const p of obj.parts) {
          if (p.type === "ellipse" && (!p.data || p.data === "circle")) p.data = "earth";
        }
      } else if (/\b(moon|luna)\b/i.test(labelLower)) {
        for (const p of obj.parts) {
          if (p.type === "ellipse" && (!p.data || p.data === "circle")) p.data = "moon";
        }
      }
    }

    const hasMeaningfulParts = obj.parts && obj.parts.length > 0 && !obj.parts.every((p) => p.type === "rect" && !p.text && !p.data && (p.fill === "slate" || p.fill === "none"));

    if (!hasMeaningfulParts) {
      // Intelligently synthesize authentic vector graphics based on label & context
      if (/\b(sun|star|solar)\b/i.test(labelLower)) {
        obj.width = Math.max(160, obj.width);
        obj.height = Math.max(140, obj.height);
        obj.parts = [{
          type: "ellipse",
          data: "sun",
          text: "Sun",
          x: 15,
          y: 15,
          width: obj.width - 30,
          height: obj.height - 30,
          fill: "orange",
          stroke: "yellow",
          strokeWidth: 2,
          opacity: 1,
        }];
      } else if (/\b(earth|planet|world)\b/i.test(labelLower)) {
        obj.width = Math.max(160, obj.width);
        obj.height = Math.max(140, obj.height);
        obj.parts = [{
          type: "ellipse",
          data: "earth",
          text: "Earth",
          x: 15,
          y: 15,
          width: obj.width - 30,
          height: obj.height - 30,
          fill: "blue",
          stroke: "cyan",
          strokeWidth: 2,
          opacity: 1,
        }];
      } else if (/\b(moon|satellite|luna)\b/i.test(labelLower)) {
        obj.width = Math.max(160, obj.width);
        obj.height = Math.max(140, obj.height);
        obj.parts = [{
          type: "ellipse",
          data: "moon",
          text: "Moon",
          x: 15,
          y: 15,
          width: obj.width - 30,
          height: obj.height - 30,
          fill: "slate",
          stroke: "white",
          strokeWidth: 2,
          opacity: 1,
        }];
      } else if (/\b(orbit|celestial)\b/i.test(labelLower)) {
        obj.width = Math.max(480, obj.width);
        obj.height = Math.max(380, obj.height);
        obj.parts = [{
          type: "orbit",
          data: "orbit",
          x: 20,
          y: 20,
          width: obj.width - 40,
          height: obj.height - 40,
          fill: "none",
          stroke: "slate",
          strokeWidth: 2,
          opacity: 1,
          text: "",
        }];
      } else if (/\b(gravity|gravitational|pull|attraction|fg)\b/i.test(labelLower)) {
        obj.width = Math.max(200, obj.width);
        obj.height = Math.max(85, obj.height);
        obj.parts = [{
          type: "arrow",
          data: "gravity",
          text: "Fg (Gravitational Pull)",
          x: 20,
          y: obj.height / 2,
          width: obj.width - 40,
          height: 0,
          fill: "none",
          stroke: "red",
          strokeWidth: 3,
          opacity: 1,
        }];
      } else if (/\b(velocity|speed|inertia|tangent|vector)\b/i.test(labelLower)) {
        obj.width = Math.max(200, obj.width);
        obj.height = Math.max(85, obj.height);
        obj.parts = [{
          type: "arrow",
          data: "velocity",
          text: "v (Tangential Velocity)",
          x: 20,
          y: obj.height / 2,
          width: obj.width - 40,
          height: 0,
          fill: "none",
          stroke: "cyan",
          strokeWidth: 3,
          opacity: 1,
        }];
      } else if (/\b(transistor|floating|charge trap)\b/i.test(labelLower)) {
        obj.width = Math.max(300, obj.width);
        obj.height = Math.max(220, obj.height);
        const w = obj.width - 24;
        obj.parts = [
          { type: "rect", x: 12, y: 12, width: w, height: 26, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, text: "Control Gate", data: "" },
          { type: "rect", x: 12, y: 42, width: w, height: 16, fill: "violet", stroke: "violet", strokeWidth: 1.5, opacity: 0.35, text: "", data: "" },
          { type: "rect", x: 12, y: 62, width: w, height: 34, fill: "cyan", stroke: "blue", strokeWidth: 2, opacity: 0.6, text: "Floating Gate", data: "" },
          { type: "particles", x: 24, y: 66, width: w - 24, height: 24, fill: "cyan", stroke: "blue", strokeWidth: 2, opacity: 1, text: "", data: "16" },
          { type: "rect", x: 12, y: 100, width: w, height: 14, fill: "orange", stroke: "orange", strokeWidth: 1.5, opacity: 0.35, text: "", data: "" },
          { type: "rect", x: 12, y: 118, width: w, height: 32, fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, text: "Silicon Substrate", data: "" },
        ];
      } else if (/\b(chloroplast|thylakoid|photosynthesis|leaf)\b/i.test(labelLower)) {
        obj.width = Math.max(280, obj.width);
        obj.height = Math.max(200, obj.height);
        const w = obj.width - 24;
        obj.parts = [
          { type: "ellipse", x: 12, y: 12, width: w, height: obj.height - 24, fill: "green", stroke: "green", strokeWidth: 2, opacity: 0.25, text: "", data: "" },
          { type: "rect", x: 40, y: 50, width: 80, height: 18, fill: "green", stroke: "ink", strokeWidth: 2, opacity: 1, text: "Thylakoid Grana", data: "" },
          { type: "rect", x: 40, y: 72, width: 80, height: 18, fill: "green", stroke: "ink", strokeWidth: 2, opacity: 1, text: "", data: "" },
          { type: "wave", x: 140, y: 40, width: 100, height: 30, fill: "none", stroke: "yellow", strokeWidth: 2.5, opacity: 1, text: "Light Energy (Photons)", data: "4" },
          { type: "particles", x: 150, y: 90, width: 80, height: 40, fill: "cyan", stroke: "blue", strokeWidth: 2, opacity: 1, text: "ATP / Glucose", data: "12" },
        ];
      } else if (/\b(atom|nucleus)\b/i.test(labelLower)) {
        obj.width = Math.max(340, obj.width);
        obj.height = Math.max(300, obj.height);
        obj.parts = [
          { type: "cluster", data: "protons:6|neutrons:6", fill: "red", stroke: "blue", width: 80, height: 80, x: (obj.width - 80) / 2, y: (obj.height - 80) / 2, opacity: 1, text: "", strokeWidth: 2 },
          { type: "orbit", data: "2", stroke: "slate", strokeWidth: 1.5, width: 180, height: 180, x: (obj.width - 180) / 2, y: (obj.height - 180) / 2, fill: "none", opacity: 0.7, text: "" },
          { type: "orbit", data: "4", stroke: "slate", strokeWidth: 1.5, width: 260, height: 260, x: (obj.width - 260) / 2, y: (obj.height - 260) / 2, fill: "none", opacity: 0.7, text: "" },
        ];
      } else {
        // High-fidelity structured chassis: Title badge, accent divider, and dynamic signal indicator
        obj.parts = [
          { type: "rect", x: 8, y: 8, width: obj.width - 16, height: 26, fill: "slate", stroke: "ink", strokeWidth: 1.5, opacity: 0.9, text: obj.label, data: "" },
          { type: "rect", x: 8, y: 38, width: obj.width - 16, height: Math.max(36, obj.height - 46), fill: "white", stroke: "slate", strokeWidth: 1.5, opacity: 0.95, text: "", data: "" },
          { type: "wave", x: 16, y: 46, width: obj.width - 32, height: Math.max(20, obj.height - 62), fill: "none", stroke: "cyan", strokeWidth: 2, opacity: 0.85, text: "", data: "3" },
        ];
      }
    }
  }

  // 4. Guarantee 100% teaching coverage without fatal errors
  const taught = new Set(plan.segments.flatMap((segment) => segment.targetIds));
  const untaught = plan.objects.filter((object) => detailedVisualRoles.has(object.role) && !taught.has(object.id));
  if (untaught.length && plan.segments.length > 0) {
    const lastSegment = plan.segments[plan.segments.length - 1];
    for (const obj of untaught) {
      if (!lastSegment.targetIds.includes(obj.id)) {
        lastSegment.targetIds.push(obj.id);
      }
    }
  }

  // 4b. Reconcile segment targetIds so they always match existing object IDs
  const existingObjectIds = new Set(plan.objects.map((o) => o.id));
  const defaultTargetId = plan.objects[0]?.id;

  for (const seg of plan.segments) {
    if (!seg.targetIds || !Array.isArray(seg.targetIds)) {
      seg.targetIds = defaultTargetId ? [defaultTargetId] : [];
      continue;
    }
    let validTargets = seg.targetIds.filter((id) => existingObjectIds.has(id));

    if (validTargets.length === 0 && seg.targetIds.length > 0) {
      for (const target of seg.targetIds) {
        const targetLower = target.toLowerCase();
        const matched = plan.objects.find((o) =>
          o.id.toLowerCase() === targetLower ||
          o.label.toLowerCase() === targetLower ||
          o.id.toLowerCase().includes(targetLower) ||
          targetLower.includes(o.id.toLowerCase()) ||
          o.label.toLowerCase().includes(targetLower) ||
          targetLower.includes(o.label.toLowerCase())
        );
        if (matched && !validTargets.includes(matched.id)) {
          validTargets.push(matched.id);
        }
      }
    }

    if (validTargets.length === 0) {
      const segText = `${seg.title} ${seg.narration}`.toLowerCase();
      const matched = plan.objects.find((o) =>
        segText.includes(o.label.toLowerCase()) ||
        segText.includes(o.id.toLowerCase())
      );
      if (matched) {
        validTargets.push(matched.id);
      }
    }

    if (validTargets.length === 0 && defaultTargetId) {
      validTargets = [defaultTargetId];
    }

    seg.targetIds = validTargets;
  }

  // 5. Quantitative axes check: if quantitative and axes missing, auto-add axes part
  const strategyRequestsPlot = /\b(graph|plot|chart|coordinate system|x-axis|y-axis|axes)\b/i.test(plan.visualStrategy);
  const quantitative = plan.diagramType === "quantitative" || strategyRequestsPlot;
  if (quantitative) {
    const hasAxesOrChart = plan.objects.some((obj) => obj.shapeType === "custom-chart" || obj.parts.some((p) => p.type === "axes"));
    if (!hasAxesOrChart && plan.objects.length > 0) {
      plan.objects[0].parts.unshift({
        type: "axes",
        x: 10,
        y: 10,
        width: Math.max(80, plan.objects[0].width - 20),
        height: Math.max(60, plan.objects[0].height - 20),
        data: "x:Time|y:Value",
        text: "",
        fill: "none",
        stroke: "ink",
        strokeWidth: 2,
        opacity: 1,
      });
    }
  }

  return plan;
}

export function normalizeLessonLayout(rawPlan: LessonPlan): LessonPlan {
  const plan = repairAndValidateLessonPlan(rawPlan);
  const quantitative = plan.diagramType === "quantitative"
    || plan.objects.some((object) => object.parts.some((part) => part.type === "axes"))
    || /\b(graph|plot|chart|coordinate system|x-axis|y-axis|axes)\b/i.test(plan.visualStrategy);

  const ids = new Set<string>();
  const idMap = new Map<string, string>();

  // 1. Initial sanitization of object sizes & IDs
  const sanitizedObjects: VisualObject[] = plan.objects.map((object, index) => {
    const baseId = safeId(object.id, `object-${index + 1}`);
    let objectId = baseId;
    let suffix = 2;
    while (ids.has(objectId)) objectId = `${baseId.slice(0, 50)}-${suffix++}`;
    ids.add(objectId);
    idMap.set(object.id, objectId);

    const hasAxes = object.parts.some((part) => part.type === "axes");
    const isBackdrop = BACKDROP_ROLES.has(object.role) || object.shapeType === "frame";
    const isFormulaNote = object.shapeType === "note" && object.role === "annotation" && /[=+Δ\\/*^]/.test(object.label);

    const isCustomSemantic = object.shapeType === "custom-template" || object.shapeType === "custom-chart" || object.shapeType === "custom-svg";

    // Ensure legible dimensions so labels never awkwardly break across lines (e.g. Moo n, grav ity)
    const minW = isCustomSemantic ? 320 : hasAxes ? 360 : isBackdrop ? 440 : 150;
    const maxW = isCustomSemantic ? 880 : isBackdrop ? 1080 : hasAxes ? 820 : 580;
    const minH = isCustomSemantic ? 220 : hasAxes ? 240 : isBackdrop ? 260 : 80;
    const maxH = isCustomSemantic ? 580 : isBackdrop ? 660 : hasAxes ? 520 : 480;

    const width = clamp(object.width, minW, maxW);
    const height = clamp(object.height, minH, maxH);

    return {
      ...object,
      id: objectId,
      label: object.label.replace(/[<>]/g, "").replace(/^[:\s\-—]+/, "").trim().slice(0, 48),
      labelPlacement: hasAxes ? "none" as const : object.labelPlacement,
      width,
      height,
      x: clamp(object.x, EDGE, CANVAS_WIDTH - width - EDGE),
      y: clamp(object.y, EDGE, CANVAS_HEIGHT - height - EDGE),
      parts: isCustomSemantic ? object.parts : sanitizeParts(object.parts, width, height, object.x, object.y),
    };
  });

  // 2. Identify pedagogical sequence and direct connections for flow-aware orientation
  const pedagogicalOrder = new Map<string, number>();
  let stepOrder = 0;
  for (const seg of plan.segments) {
    for (const tId of seg.targetIds) {
      const mappedId = idMap.get(tId) ?? tId;
      if (!pedagogicalOrder.has(mappedId)) {
        pedagogicalOrder.set(mappedId, stepOrder++);
      }
    }
  }

  const directConnections = new Set<string>();
  for (const conn of plan.connections) {
    const fromId = idMap.get(conn.from);
    const toId = idMap.get(conn.to);
    if (fromId && toId && fromId !== toId) {
      directConnections.add(`${fromId}->${toId}`);
    }
  }

  // 3. Separate backdrops (containers, environments, frames) from functional objects
  const nonBackdrops = sanitizedObjects.filter((o) => !BACKDROP_ROLES.has(o.role) && o.shapeType !== "frame");
  const backdrops = sanitizedObjects.filter((o) => BACKDROP_ROLES.has(o.role) || o.shapeType === "frame");

  // Sort non-backdrops by their spatial coordinates (preserving physical layout)
  nonBackdrops.sort((a, b) => {
    if (Math.abs(a.x - b.x) > 10) return a.x - b.x;
    return a.y - b.y;
  });

  // 4. Determine parent-child relationships between containers and their children
  //    A child is "contained" if the LLM originally placed its center inside/near the container,
  //    or if it shares a direct connection with other children of the same container.
  const childToParent = new Map<string, string>();
  const parentToChildren = new Map<string, VisualObject[]>();

  for (const container of backdrops) {
    const children: VisualObject[] = [];
    for (const child of nonBackdrops) {
      // Check if the child's original position was inside or near the container
      const origChild = plan.objects.find((o) => idMap.get(o.id) === child.id);
      const origContainer = plan.objects.find((o) => idMap.get(o.id) === container.id);
      if (!origChild || !origContainer) continue;
      const cx = origChild.x + origChild.width / 2;
      const cy = origChild.y + origChild.height / 2;
      const inside = cx >= origContainer.x - 60 && cx <= origContainer.x + origContainer.width + 60
                  && cy >= origContainer.y - 60 && cy <= origContainer.y + origContainer.height + 60;
      if (inside && !childToParent.has(child.id)) {
        children.push(child);
        childToParent.set(child.id, container.id);
      }
    }
    // If this container wraps only 1 child and has essentially the same label as the child,
    // it's a redundant duplicate enclosure!
    const contLabel = container.label.trim().toLowerCase().replace(/\s+(system|container|box|enclosure|frame)\b/g, "");
    const childLabel = children[0]?.label.trim().toLowerCase();
    if (children.length === 1 && (contLabel === childLabel || container.label.trim().toLowerCase() === childLabel)) {
      childToParent.delete(children[0].id);
      continue;
    }
    if (children.length > 0) {
      parentToChildren.set(container.id, children);
    }
  }

  // 5. Sequential grid layout for children inside each container
  //    Place children in a clean horizontal row with generous spacing,
  //    then size the container to wrap them with padding.
  const CHILD_H_GAP = 60;
  const CHILD_V_GAP = 40;
  const CONTAINER_PAD_X = 50;
  const CONTAINER_PAD_Y = 64;
  const CONTAINER_PAD_TOP = 80; // Extra top padding for the container label

  for (const [containerId, children] of parentToChildren.entries()) {
    const container = backdrops.find((o) => o.id === containerId);
    if (!container || children.length === 0) continue;

    // Sort children by spatial coordinates (left-to-right, then top-to-bottom)
    children.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 10) return a.x - b.x;
      return a.y - b.y;
    });

    // Determine if children fit in a single row or need wrapping
    const totalChildWidth = children.reduce((sum, c) => sum + c.width, 0);
    const totalGaps = (children.length - 1) * CHILD_H_GAP;
    const neededWidth = totalChildWidth + totalGaps + 2 * CONTAINER_PAD_X;

    const maxContainerWidth = CANVAS_WIDTH - 2 * EDGE;
    const useMultiRow = neededWidth > maxContainerWidth && children.length > 2;
    const cols = useMultiRow ? Math.ceil(children.length / 2) : children.length;

    // Arrange children in a grid
    let cursorX = CONTAINER_PAD_X;
    let cursorY = CONTAINER_PAD_TOP;
    let col = 0;
    let rowMaxHeight = 0;

    for (const child of children) {
      if (col >= cols) {
        // New row
        col = 0;
        cursorX = CONTAINER_PAD_X;
        cursorY += rowMaxHeight + CHILD_V_GAP;
        rowMaxHeight = 0;
      }
      child.x = cursorX;
      child.y = cursorY;
      cursorX += child.width + CHILD_H_GAP;
      rowMaxHeight = Math.max(rowMaxHeight, child.height);
      col++;
    }

    // Now size the container to tightly wrap all children
    const minChildX = Math.min(...children.map((c) => c.x));
    const maxChildX = Math.max(...children.map((c) => c.x + c.width));
    const minChildY = Math.min(...children.map((c) => c.y));
    const maxChildY = Math.max(...children.map((c) => c.y + c.height));

    const containerW = clamp(maxChildX - minChildX + 2 * CONTAINER_PAD_X, 480, maxContainerWidth);
    const containerH = clamp(maxChildY - minChildY + CONTAINER_PAD_TOP + CONTAINER_PAD_Y, 320, CANVAS_HEIGHT - 2 * EDGE);

    container.width = containerW;
    container.height = containerH;

    // Temporarily position container at origin; children are in local coords
    container.x = EDGE;
    container.y = EDGE;

    // Convert children from local container coords to absolute canvas coords
    for (const child of children) {
      child.x = container.x + child.x;
      child.y = container.y + child.y;
    }
  }

  // 6. Identify "free" non-backdrop objects (not inside any container)
  const freeObjects = nonBackdrops.filter((o) => !childToParent.has(o.id));

  // 7. Flow-aware sequential alignment for free objects
  for (let i = 0; i < freeObjects.length; i++) {
    for (let j = i + 1; j < freeObjects.length; j++) {
      const a = freeObjects[i];
      const b = freeObjects[j];
      if (directConnections.has(`${a.id}->${b.id}`)) {
        const isVertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 1.2;
        if (isVertical) {
          if (b.y >= a.y) {
            // Downward flow (top to bottom)
            if (b.y < a.y + a.height + 36) {
              b.y = a.y + a.height + 48;
            }
          } else {
            // Upward flow (bottom to top)
            if (b.y > a.y - b.height - 36) {
              b.y = a.y - b.height - 48;
            }
          }
        } else {
          // b is directly downstream of a — enforce left-to-right
          if (b.x < a.x + a.width + 48) {
            b.x = a.x + a.width + 60;
            if (Math.abs(b.y - a.y) < 60) {
              b.y = a.y + (a.height - b.height) / 2;
            }
          }
        }
      }
    }
  }

  // 8. Iterative collision relaxation for ALL non-backdrop objects
  for (let iter = 0; iter < 30; iter++) {
    let shifted = false;
    for (let i = 0; i < nonBackdrops.length; i++) {
      for (let j = i + 1; j < nonBackdrops.length; j++) {
        const a = nonBackdrops[i];
        const b = nonBackdrops[j];
        // Skip collision check between objects that share the same container
        // (they were already laid out in step 5 without overlap)
        const sameContainer = childToParent.get(a.id) && childToParent.get(a.id) === childToParent.get(b.id);
        if (sameContainer) continue;
        if (overlaps(a, b, 48)) {
          shifted = true;
          const aToB = directConnections.has(`${a.id}->${b.id}`);
          const bToA = directConnections.has(`${b.id}->${a.id}`);
          resolveCollision(a, b, aToB, bToA, 56);
        }
      }
    }
    if (!shifted) break;
  }

  // 9. Post-collision: Re-fit containers to enclose their children
  for (const [containerId, children] of parentToChildren.entries()) {
    const container = backdrops.find((o) => o.id === containerId);
    if (!container || children.length === 0) continue;

    const minChildX = Math.min(...children.map((c) => c.x));
    const maxChildX = Math.max(...children.map((c) => c.x + c.width));
    const minChildY = Math.min(...children.map((c) => c.y));
    const maxChildY = Math.max(...children.map((c) => c.y + c.height));

    container.x = clamp(minChildX - CONTAINER_PAD_X, EDGE, CANVAS_WIDTH - 200);
    container.y = clamp(minChildY - CONTAINER_PAD_TOP, EDGE, CANVAS_HEIGHT - 200);
    container.width = clamp(maxChildX - container.x + CONTAINER_PAD_X, 480, CANVAS_WIDTH - container.x - EDGE);
    container.height = clamp(maxChildY - container.y + CONTAINER_PAD_Y, 320, CANVAS_HEIGHT - container.y - EDGE);
  }

  // 10. Handle free backdrops (no children from initial layout)
  for (const backdrop of backdrops) {
    if (parentToChildren.has(backdrop.id)) continue;
    const hasMeaningfulParts = backdrop.parts && backdrop.parts.length > 0 && backdrop.parts.some((p) => p.text || p.data || (p.fill && p.fill !== "none" && p.fill !== "slate"));
    const minRequiredNeighbors = hasMeaningfulParts ? 1 : 2;

    // Place behind all non-backdrops that are near it
    const nearChildren = nonBackdrops.filter((child) => {
      const cx = child.x + child.width / 2;
      const cy = child.y + child.height / 2;
      return cx >= backdrop.x - 80 && cx <= backdrop.x + backdrop.width + 80
          && cy >= backdrop.y - 80 && cy <= backdrop.y + backdrop.height + 80;
    });
    if (nearChildren.length >= minRequiredNeighbors) {
      parentToChildren.set(backdrop.id, nearChildren);
      const minChildX = Math.min(...nearChildren.map((c) => c.x));
      const maxChildX = Math.max(...nearChildren.map((c) => c.x + c.width));
      const minChildY = Math.min(...nearChildren.map((c) => c.y));
      const maxChildY = Math.max(...nearChildren.map((c) => c.y + c.height));
      backdrop.x = clamp(minChildX - CONTAINER_PAD_X, EDGE, CANVAS_WIDTH - 200);
      backdrop.y = clamp(minChildY - CONTAINER_PAD_TOP, EDGE, CANVAS_HEIGHT - 200);
      backdrop.width = clamp(maxChildX - backdrop.x + CONTAINER_PAD_X, 480, CANVAS_WIDTH - backdrop.x - EDGE);
      backdrop.height = clamp(maxChildY - backdrop.y + CONTAINER_PAD_Y, 320, CANVAS_HEIGHT - backdrop.y - EDGE);
    }
  }

  // 11. Center the whole composition on the canvas
  // Filter out empty backdrops that have no children and no meaningful visual parts
  const activeBackdrops = backdrops.filter((b) => {
    const hasChildren = (parentToChildren.get(b.id)?.length ?? 0) > 0;
    if (hasChildren) return true;
    const hasParts = b.parts && b.parts.length > 0 && b.parts.some((p) => p.text || p.data || (p.fill && p.fill !== "none" && p.fill !== "slate"));
    return Boolean(hasParts);
  });
  const allObjects = [...activeBackdrops, ...nonBackdrops];
  if (allObjects.length > 0) {
    const minX = Math.min(...allObjects.map((o) => o.x));
    const maxX = Math.max(...allObjects.map((o) => o.x + o.width));
    const minY = Math.min(...allObjects.map((o) => o.y));
    const maxY = Math.max(...allObjects.map((o) => o.y + o.height));
    const totalW = maxX - minX;
    const totalH = maxY - minY;

    if (totalW < CANVAS_WIDTH - 2 * EDGE) {
      const shiftX = Math.round((CANVAS_WIDTH - totalW) / 2 - minX);
      for (const obj of allObjects) obj.x += shiftX;
    }
    if (totalH < CANVAS_HEIGHT - 2 * EDGE) {
      const shiftY = Math.round((CANVAS_HEIGHT - totalH) / 2 - minY);
      for (const obj of allObjects) obj.y += shiftY;
    }
  }

  // 12. Final clamping — make sure nothing is off-canvas
  for (const obj of allObjects) {
    obj.x = Math.max(EDGE, obj.x);
    obj.y = Math.max(EDGE, obj.y);
  }

  const unique = allObjects;
  const validUniqueIds = new Set(unique.map((o) => o.id));

  const connectionIds = new Set<string>();
  const connections = plan.connections.flatMap((connection, index) => {
    const from = idMap.get(connection.from);
    const to = idMap.get(connection.to);
    if (!from || !to || from === to) return [];
    const baseId = `link-${safeId(connection.id, String(index + 1))}`;
    let connectionId = baseId;
    let suffix = 2;
    while (ids.has(connectionId) || connectionIds.has(connectionId)) connectionId = `${baseId.slice(0, 50)}-${suffix++}`;
    connectionIds.add(connectionId);
    const fromObject = unique.find((object) => object.id === from);
    const toObject = unique.find((object) => object.id === to);
    if (!fromObject || !toObject) return [];

    const dx = (toObject.x + toObject.width / 2) - (fromObject.x + fromObject.width / 2);
    const dy = (toObject.y + toObject.height / 2) - (fromObject.y + fromObject.height / 2);
    const automaticAnchors = Math.abs(dx) >= Math.abs(dy)
      ? { fromAnchor: dx >= 0 ? "right" as const : "left" as const, toAnchor: dx >= 0 ? "left" as const : "right" as const }
      : { fromAnchor: dy >= 0 ? "bottom" as const : "top" as const, toAnchor: dy >= 0 ? "top" as const : "bottom" as const };

    // Strip cluttering verbose labels on arrows (e.g. "USB to Controller Flow" -> "")
    // Only keep short 1-word identifiers (e.g. "charge", "data", "tunnel")
    let rawLabel = connection.label.replace(/[<>]/g, "").trim();
    if (/\b(to|flow|arrow|link|step)\b/i.test(rawLabel) || rawLabel.length > 12) {
      rawLabel = "";
    }

    return [{
      ...connection,
      id: connectionId,
      from,
      to,
      label: rawLabel.slice(0, 16),
      route: connection.route === "curve" ? "curve" as const : "elbow" as const,
      ...(connection.route === "curve" ? {} : automaticAnchors),
      bend: clamp(connection.bend, -160, 160),
    }];
  });

  const fallbackId = unique[0]?.id;
  const segments = plan.segments.map((segment, index) => {
    const targetIds = [...new Set(segment.targetIds.map((id) => idMap.get(id)).filter((id): id is string => typeof id === "string" && validUniqueIds.has(id)))];
    return {
      ...segment,
      id: safeId(segment.id, `segment-${index + 1}`),
      title: segment.title.replace(/[<>]/g, "").slice(0, 80),
      narration: segment.narration.replace(/[<>]/g, "").slice(0, 700),
      durationMs: clamp(segment.durationMs, 1200, 45000),
      targetIds: targetIds.length ? targetIds : fallbackId ? [fallbackId] : segment.targetIds,
    };
  });

  return {
    ...plan,
    diagramType: quantitative ? "quantitative" : plan.diagramType,
    title: plan.title.replace(/[<>]/g, "").slice(0, 120),
    summary: plan.summary.replace(/[<>]/g, "").slice(0, 600),
    visualStrategy: plan.visualStrategy.replace(/[<>]/g, "").slice(0, 260),
    objects: unique,
    connections,
    segments,
  };
}

