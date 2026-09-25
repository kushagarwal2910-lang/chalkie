import type { LessonPlan, VisualObject, VisualPart } from "./lesson-schema";
import { formatMathFormula } from "./math-formatter.ts";
import { getVisualFootprint } from "./visual-footprint.ts";

export const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type TextBox = Bounds;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const safeId = (value: string, fallback: string) => value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || fallback;

function cleanAxisLabel(value: string, fallback: string) {
  const label = value.replace(/[<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 36);
  return label || fallback;
}

function sanitizeAxesData(value: string, fallbackX = "Time (t)", fallbackY = "Value (y)") {
  if (!value) return `x:${fallbackX}|y:${fallbackY}`;
  const clean = value.replace(/[<>]/g, "").trim();
  let x = "";
  let y = "";

  if (clean.includes("|")) {
    const pieces = clean.split("|");
    x = pieces.find((piece) => /^\s*x\s*:/i.test(piece))?.replace(/^\s*x\s*:\s*/i, "") || pieces[0] || fallbackX;
    y = pieces.find((piece) => /^\s*y\s*:/i.test(piece))?.replace(/^\s*y\s*:\s*/i, "") || pieces[1] || fallbackY;
  } else if (/vs\.?/i.test(clean)) {
    const [yPart, xPart] = clean.split(/vs\.?/i);
    y = yPart?.trim() || fallbackY;
    x = xPart?.trim() || fallbackX;
  } else if (clean.includes(",")) {
    const [xPart, yPart] = clean.split(",");
    x = xPart?.replace(/^\s*x\s*:/i, "").trim() || fallbackX;
    y = yPart?.replace(/^\s*y\s*:/i, "").trim() || fallbackY;
  } else {
    x = clean || fallbackX;
    y = fallbackY;
  }

  return `x:${cleanAxisLabel(x, fallbackX)}|y:${cleanAxisLabel(y, fallbackY)}`;
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
  const left = clamp(part.x + 44, fallback.minX, fallback.maxX);
  const right = clamp(part.x + part.width - 24, left + 20, fallback.maxX);
  const top = clamp(part.y + 20, fallback.minY, fallback.maxY);
  const bottom = clamp(part.y + part.height - 40, top + 20, fallback.maxY);
  return { minX: left, minY: top, maxX: right, maxY: bottom };
}

function sanitizePart(part: VisualPart, bounds: Bounds): VisualPart {
  const pathData = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]*$/;
  const rawText = part.text || "";
  const formattedText = formatMathFormula(rawText).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const text = formattedText.slice(0, 180);
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
  const isDataPoint = part.type === "ellipse" && (part.data === "point" || (part.width > 0 && part.width <= 20 && part.height > 0 && part.height <= 20));
  if (!isDataPoint && (part.type === "rect" || part.type === "ellipse") && (width <= 4 || height <= 4)) {
    width = Math.max(width, Math.min(bounds.maxX - bounds.minX, 36));
    height = Math.max(height, Math.min(bounds.maxY - bounds.minY, 28));
  } else if (isDataPoint) {
    width = clamp(part.width || 10, 6, 20);
    height = clamp(part.height || 10, 6, 20);
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

function sanitizeParts(parts: VisualPart[], objectWidth: number, objectHeight: number, role = "") {
  const isFormula = role === "formula";
  const objectBounds = {
    minX: isFormula ? 16 : 2,
    minY: isFormula ? 36 : 2,
    maxX: Math.max(2, objectWidth - (isFormula ? 16 : 2)),
    maxY: Math.max(2, objectHeight - (isFormula ? 10 : 2)),
  };
  const rawAxes = parts.find((part) => part.type === "axes");
  const axes = rawAxes ? sanitizePart(rawAxes, objectBounds) : null;
  const plotBounds = axes ? axisPlotBounds(axes, objectBounds) : objectBounds;
  const occupied: TextBox[] = [];

  return parts.map((part) => {
    if (part.type === "axes" && axes) return axes;
    if (part.type === "text") return sanitizeTextPart(part, axes ? plotBounds : objectBounds, occupied);
    return sanitizePart(part, axes ? plotBounds : objectBounds);
  });
}

const detailedVisualRoles = new Set(["subject", "component", "input", "output"]);



export function repairAndValidateLessonPlan(plan: LessonPlan): LessonPlan {
  // Do not mutate a lesson used by playback or the caller.
  plan = structuredClone(plan);
  if (!Array.isArray(plan.objects)) plan.objects = [];
  if (!Array.isArray(plan.connections)) plan.connections = [];
  if (!Array.isArray(plan.segments)) plan.segments = [];
  if (!Array.isArray(plan.sources)) plan.sources = [];

  const qLower = (plan.question || "").toLowerCase();

  // 1. Convert any legacy shapeType: "geo" or non-formula "note" to "custom"
  // and enforce minimum dimensions so labels NEVER wrap into "Moo n", "grav ity", etc.
  for (const obj of plan.objects) {
    if (!Array.isArray(obj.parts)) obj.parts = [];
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

  // Semantic cards may coexist with charts and ordinary diagram nodes.

  // 3. Ensure every visual object has rich, meaningful vector parts (NO EMPTY RECTANGLES!)
  for (const obj of plan.objects) {
    if (
      BACKDROP_ROLES.has(obj.role) ||
      obj.shapeType === "frame" ||
      obj.shapeType === "custom-template" ||
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
      } else if (/\b(cas9|endonuclease|crispr|guide\s*rna|grna|pam|protospacer|cleave|dna\s*strand|double\s*helix)\b/i.test(labelLower)) {
        obj.width = Math.max(300, obj.width);
        obj.height = Math.max(220, obj.height);
        const w = obj.width - 24;
        const h = obj.height - 24;
        if (/\b(cas9|endonuclease|enzyme|protein)\b/i.test(labelLower)) {
          obj.parts = [
            { type: "polygon", data: `20,40 ${w - 40},30 ${w - 10},90 ${w - 30},${h - 20} 30,${h - 10} 10,100`, fill: "violet", stroke: "violet", strokeWidth: 2, opacity: 0.35, text: "Cas9 Endonuclease", x: 12, y: 12, width: w, height: h },
            { type: "ellipse", x: 40, y: 50, width: 50, height: 50, fill: "violet", stroke: "white", strokeWidth: 1.5, opacity: 0.8, text: "REC Lobe", data: "" },
            { type: "ellipse", x: w - 90, y: 65, width: 50, height: 50, fill: "blue", stroke: "cyan", strokeWidth: 1.5, opacity: 0.8, text: "NUC Lobe", data: "" },
            { type: "path", data: `M 35 110 Q ${w / 2} 85 ${w - 35} 115`, fill: "none", stroke: "orange", strokeWidth: 3, opacity: 1, text: "gRNA Scaffold", x: 0, y: 0, width: w, height: h },
            { type: "arrow", x: w / 2 - 20, y: 100, width: 40, height: 0, fill: "none", stroke: "red", strokeWidth: 2.5, opacity: 1, text: "Cleavage Site (DSB)", data: "cut" },
          ];
        } else if (/\b(grna|guide|rna)\b/i.test(labelLower)) {
          obj.parts = [
            { type: "wave", x: 16, y: 40, width: w - 32, height: 40, fill: "none", stroke: "yellow", strokeWidth: 3, opacity: 1, text: "20-nt Spacer Sequence", data: "3" },
            { type: "path", data: `M ${w - 60} 55 C ${w - 20} 20 ${w - 20} 110 ${w - 60} 75`, fill: "none", stroke: "orange", strokeWidth: 2.5, opacity: 1, text: "Hairpin Loop", x: 0, y: 0, width: w, height: h },
            { type: "rect", x: 24, y: 100, width: w - 48, height: 28, fill: "slate", stroke: "ink", strokeWidth: 1.5, opacity: 0.9, text: "Target Complementarity", data: "" },
          ];
        } else {
          obj.parts = [
            { type: "line", x: 16, y: 50, width: w - 32, height: 0, fill: "none", stroke: "cyan", strokeWidth: 3, opacity: 1, text: "Target DNA Strand (5' -> 3')", data: "" },
            { type: "line", x: 16, y: 90, width: w - 32, height: 0, fill: "none", stroke: "blue", strokeWidth: 3, opacity: 1, text: "Non-Target Strand (3' -> 5')", data: "" },
            { type: "line", x: 50, y: 50, width: 0, height: 40, fill: "none", stroke: "ink", strokeWidth: 1.5, opacity: 0.8, text: "", data: "" },
            { type: "line", x: 90, y: 50, width: 0, height: 40, fill: "none", stroke: "ink", strokeWidth: 1.5, opacity: 0.8, text: "", data: "" },
            { type: "line", x: 130, y: 50, width: 0, height: 40, fill: "none", stroke: "ink", strokeWidth: 1.5, opacity: 0.8, text: "", data: "" },
            { type: "line", x: 170, y: 50, width: 0, height: 40, fill: "none", stroke: "ink", strokeWidth: 1.5, opacity: 0.8, text: "", data: "" },
            { type: "rect", x: w - 85, y: 40, width: 65, height: 60, fill: "orange", stroke: "yellow", strokeWidth: 2, opacity: 0.4, text: "PAM (5'-NGG)", data: "" },
          ];
        }
      } else if (/\b(hydraulic|brake|caliper|rotor|cylinder|pedal|fluid)\b/i.test(labelLower)) {
        obj.width = Math.max(280, obj.width);
        obj.height = Math.max(200, obj.height);
        const w = obj.width - 24;
        const h = obj.height - 24;
        if (/\b(caliper|rotor|disc|pad)\b/i.test(labelLower)) {
          obj.parts = [
            { type: "ellipse", x: 30, y: 20, width: 140, height: 140, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 0.85, text: "Brake Disc Rotor", data: "" },
            { type: "ellipse", x: 80, y: 70, width: 40, height: 40, fill: "none", stroke: "slate", strokeWidth: 1.5, opacity: 0.9, text: "Hub", data: "" },
            { type: "rect", x: 130, y: 40, width: 80, height: 100, fill: "red", stroke: "orange", strokeWidth: 2, opacity: 0.9, text: "Hydraulic Caliper", data: "" },
            { type: "rect", x: 120, y: 60, width: 22, height: 60, fill: "orange", stroke: "yellow", strokeWidth: 1.5, opacity: 0.95, text: "Pad", data: "" },
            { type: "arrow", x: 170, y: 88, width: -30, height: 0, fill: "none", stroke: "yellow", strokeWidth: 2.5, opacity: 1, text: "Fclamp", data: "clamping" },
          ];
        } else if (/\b(master\s*cylinder|reservoir|fluid\s*line|piston)\b/i.test(labelLower)) {
          obj.parts = [
            { type: "rect", x: 16, y: 16, width: 90, height: 45, fill: "slate", stroke: "cyan", strokeWidth: 2, opacity: 0.8, text: "Brake Fluid Reservoir", data: "" },
            { type: "rect", x: 16, y: 65, width: w - 32, height: 65, fill: "none", stroke: "ink", strokeWidth: 2, opacity: 1, text: "Master Cylinder Bore", data: "" },
            { type: "particles", x: 75, y: 72, width: w - 100, height: 50, fill: "cyan", stroke: "blue", strokeWidth: 1.5, opacity: 0.9, text: "Hydraulic Pressure P = F/A", data: "18" },
            { type: "rect", x: 20, y: 70, width: 45, height: 55, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "Piston", data: "" },
          ];
        } else {
          obj.parts = [
            { type: "polygon", data: "25,15 45,15 35,130 15,130", fill: "slate", stroke: "ink", strokeWidth: 2, opacity: 1, text: "", x: 0, y: 0, width: w, height: h },
            { type: "ellipse", x: 25, y: 15, width: 20, height: 20, fill: "cyan", stroke: "blue", strokeWidth: 2, opacity: 1, text: "Pivot Pin", data: "" },
            { type: "rect", x: 8, y: 120, width: 55, height: 22, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "Pedal Pad", data: "" },
            { type: "arrow", x: 70, y: 130, width: -45, height: 0, fill: "none", stroke: "red", strokeWidth: 3, opacity: 1, text: "Driver Effort (Fpedal)", data: "effort" },
            { type: "arrow", x: 38, y: 70, width: 100, height: 0, fill: "none", stroke: "cyan", strokeWidth: 2.5, opacity: 1, text: "Pushrod to Cylinder", data: "pushrod" },
          ];
        }
      } else if (/\b(engine|combustion|piston|crankshaft|valve|spark\s*plug)\b/i.test(labelLower)) {
        obj.width = Math.max(280, obj.width);
        obj.height = Math.max(260, obj.height);
        const w = obj.width - 24;
        const h = obj.height - 24;
        obj.parts = [
          { type: "rect", x: 20, y: 20, width: w - 40, height: h - 40, fill: "none", stroke: "slate", strokeWidth: 2.5, opacity: 1, text: "Cylinder Wall", data: "" },
          { type: "line", x: 45, y: 20, width: 35, height: 25, fill: "none", stroke: "cyan", strokeWidth: 2.5, opacity: 1, text: "Intake", data: "" },
          { type: "line", x: w - 80, y: 20, width: 35, height: 25, fill: "none", stroke: "orange", strokeWidth: 2.5, opacity: 1, text: "Exhaust", data: "" },
          { type: "line", x: w / 2 - 12, y: 10, width: 0, height: 35, fill: "none", stroke: "yellow", strokeWidth: 3, opacity: 1, text: "Spark Plug", data: "" },
          { type: "wave", x: 40, y: 45, width: w - 80, height: 25, fill: "none", stroke: "yellow", strokeWidth: 2.5, opacity: 0.9, text: "Ignition / Expansion", data: "4" },
          { type: "rect", x: 30, y: 80, width: w - 60, height: 50, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "Piston Head", data: "" },
          { type: "line", x: w / 2 - 12, y: 130, width: 25, height: 70, fill: "none", stroke: "slate", strokeWidth: 4, opacity: 1, text: "Connecting Rod", data: "" },
          { type: "ellipse", x: w / 2, y: 195, width: 36, height: 36, fill: "slate", stroke: "cyan", strokeWidth: 2, opacity: 1, text: "Crank", data: "" },
        ];
      } else if (/\b(locomotive|pantograph|catenary|wire|train|wagon|bogies?|railway)\b/i.test(labelLower)) {
        obj.width = Math.max(340, obj.width);
        obj.height = Math.max(200, obj.height);
        const w = obj.width - 24;
        const h = obj.height - 24;
        if (/\b(pantograph|catenary|wire)\b/i.test(labelLower)) {
          obj.parts = [
            { type: "line", x: 10, y: 25, width: w - 20, height: 0, fill: "none", stroke: "yellow", strokeWidth: 3, opacity: 1, text: "Overhead Catenary Wire (25 kV AC)", data: "" },
            { type: "polyline", data: `50,110 90,60 ${w / 2},30 ${w - 90},60 ${w - 50},110`, fill: "none", stroke: "cyan", strokeWidth: 2.5, opacity: 1, text: "High-Reach Pantograph", x: 0, y: 0, width: w, height: h },
            { type: "rect", x: w / 2 - 40, y: 23, width: 80, height: 8, fill: "orange", stroke: "yellow", strokeWidth: 1.5, opacity: 1, text: "Carbon Collector Strip", data: "" },
          ];
        } else {
          obj.parts = [
            { type: "rect", x: 16, y: 30, width: w - 32, height: 85, fill: "slate", stroke: "cyan", strokeWidth: 2, opacity: 0.9, text: obj.label, data: "" },
            { type: "rect", x: 26, y: 40, width: 60, height: 35, fill: "blue", stroke: "white", strokeWidth: 1.5, opacity: 0.8, text: "Cab Window", data: "" },
            { type: "ellipse", x: 45, y: 120, width: 40, height: 40, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "Bogie 1", data: "" },
            { type: "ellipse", x: w - 85, y: 120, width: 40, height: 40, fill: "slate", stroke: "white", strokeWidth: 2, opacity: 1, text: "Bogie 2", data: "" },
            { type: "line", x: 10, y: 155, width: w - 20, height: 0, fill: "none", stroke: "ink", strokeWidth: 3, opacity: 1, text: "Reinforced Steel Track (32.5t Axle Load)", data: "" },
          ];
        }
      } else {
        // Production-grade technical explainer chassis with status badge, viewport, and dynamic signal
        obj.width = Math.max(220, obj.width);
        obj.height = Math.max(140, obj.height);
        const w = obj.width;
        const h = obj.height;
        const isInput = obj.role === "input";
        const isOutput = obj.role === "output";
        const accentColor = isInput ? "blue" : isOutput ? "green" : "cyan";

        obj.parts = [
          { type: "rect", x: 10, y: 10, width: w - 20, height: 28, fill: "slate", stroke: "ink", strokeWidth: 1.5, opacity: 0.9, text: obj.label, data: "" },
          { type: "rect", x: 10, y: 44, width: w - 20, height: h - 56, fill: "none", stroke: "slate", strokeWidth: 1.5, opacity: 0.8, text: "", data: "" },
          { type: "wave", x: 22, y: 56, width: w - 44, height: Math.max(20, h - 84), fill: "none", stroke: accentColor, strokeWidth: 2.2, opacity: 0.9, text: `${obj.role.toUpperCase()} STAGE`, data: "3" },
          { type: "ellipse", x: 4, y: h / 2 - 6, width: 12, height: 12, fill: accentColor, stroke: "white", strokeWidth: 1.5, opacity: 1, text: "", data: "point" },
          { type: "ellipse", x: w - 16, y: h / 2 - 6, width: 12, height: 12, fill: accentColor, stroke: "white", strokeWidth: 1.5, opacity: 1, text: "", data: "point" },
        ];
      }
    }
  }

  // 4. Guarantee 100% teaching coverage without fatal errors
  const taught = new Set(plan.segments.flatMap((segment) => (segment?.targetIds || []).map((id) => id.split("#")[0])));
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
  const existingObjectIds = new Set([...plan.objects.map((o) => o.id), ...plan.connections.map((c) => c.id)]);
  const defaultTargetId = plan.objects[0]?.id;

  for (const seg of plan.segments) {
    if (!seg.targetIds || !Array.isArray(seg.targetIds)) {
      seg.targetIds = defaultTargetId ? [defaultTargetId] : [];
      continue;
    }
    let validTargets = seg.targetIds.filter((id) => existingObjectIds.has(id.split("#")[0]));

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

  // 5. Quantitative & Graph Harmonization: Guarantee BOTH axes AND plotted curves/points coexist
  harmonizeGraphObjects(plan);

  return plan;
}

function harmonizeGraphObjects(plan: LessonPlan): void {
  const strategyRequestsPlot = /\b(graph|plot|chart|coordinate system|x-axis|y-axis|axes)\b/i.test(plan.visualStrategy || "");
  const isQuantitativePlan = plan.diagramType === "quantitative" || strategyRequestsPlot;

  for (const obj of (plan.objects || [])) {
    if (!Array.isArray(obj.parts)) obj.parts = [];
    const objText = `${obj.id || ""} ${obj.label || ""} ${obj.role || ""}`.toLowerCase();
    const hasAxes = obj.parts.some((p) => p.type === "axes");
    const hasPoints = obj.parts.some((p) => p.type === "ellipse" && (p.data === "point" || (p.width <= 24 && p.height <= 24)));
    const hasCurve = obj.parts.some((p) => p.type === "polyline" || (p.type === "path" && !p.data.includes("M 0 0")));
    const isExplicitGraph =
      hasAxes ||
      obj.shapeType === "custom-chart" ||
      (obj.role as string) === "graph" ||
      (obj.role as string) === "chart" ||
      /\b(graph|plot|curve|chart|coordinate|distribution|vs\.?)\b/i.test(objText) ||
      (isQuantitativePlan && (hasPoints || hasCurve));

    if (!isExplicitGraph) continue;

    const w = Math.max(360, obj.width);
    const h = Math.max(240, obj.height);
    obj.width = w;
    obj.height = h;

    // 1. Ensure Coordinate Axes Exist
    let axesPart = obj.parts.find((p) => p.type === "axes");
    if (!axesPart) {
      let xLabel = "Time (t)";
      let yLabel = "Value (y)";
      if (/vs\.?/i.test(obj.label)) {
        const [yPart, xPart] = obj.label.split(/vs\.?/i);
        yLabel = yPart.replace(/^[:\s\-—]+/, "").trim() || yLabel;
        xLabel = xPart.replace(/^[:\s\-—]+/, "").trim() || xLabel;
      } else if (/\b(velocity|speed)\b/i.test(objText)) {
        xLabel = "Time (s)";
        yLabel = "Velocity (m/s)";
      } else if (/\b(supply|demand|price|cost)\b/i.test(objText)) {
        xLabel = "Quantity (Q)";
        yLabel = "Price (P)";
      } else if (/\b(loss|cost|error)\b/i.test(objText)) {
        xLabel = "Epochs / Iterations";
        yLabel = "Loss / Error";
      } else if (/\b(voltage|current|ohm)\b/i.test(objText)) {
        xLabel = "Current (I)";
        yLabel = "Voltage (V)";
      } else if (/\b(normal|gaussian|distribution)\b/i.test(objText)) {
        xLabel = "Standard Deviations (σ)";
        yLabel = "Probability Density f(x)";
      }

      axesPart = {
        type: "axes",
        x: 10,
        y: 10,
        width: w - 20,
        height: h - 20,
        data: `x:${xLabel}|y:${yLabel}`,
        text: "",
        fill: "none",
        stroke: "ink",
        strokeWidth: 2,
        opacity: 1,
      };
      obj.parts.unshift(axesPart);
    } else {
      // Ensure axes has non-empty valid data
      if (!axesPart.data || axesPart.data === "x:Horizontal value|y:Vertical value" || !axesPart.data.includes("|")) {
        axesPart.data = sanitizeAxesData(axesPart.data, "Time (t)", "Value (y)");
      }
    }

    // 2. Ensure Plotted Curve Exists
    const currentCurve = obj.parts.find((p) => p.type === "polyline" || (p.type === "path" && !p.data.includes("M 0 0")));
    const plotLeft = axesPart.x + 48;
    const plotRight = axesPart.x + axesPart.width - 24;
    const plotTop = axesPart.y + 24;
    const plotBottom = axesPart.y + axesPart.height - 40;
    const plotW = Math.max(60, plotRight - plotLeft);
    const plotH = Math.max(50, plotBottom - plotTop);

    if (!currentCurve) {
      // Synthesize a smooth trend curve based on context
      const isLossCurve = /\b(loss|cost|decay|exponential|decaying)\b/i.test(objText);
      const isBellCurve = /\b(normal|gaussian|bell|distribution)\b/i.test(objText);
      const isSigmoid = /\b(sigmoid|logistic|s-curve|activation)\b/i.test(objText);

      const curvePoints: string[] = [];
      const numPts = 16;
      for (let i = 0; i <= numPts; i++) {
        const t = i / numPts;
        const px = Math.round(plotLeft + t * plotW);
        let py: number;

        if (isLossCurve) {
          py = Math.round(plotTop + 10 + (plotH - 20) * Math.exp(-3 * t));
        } else if (isBellCurve) {
          const z = (t - 0.5) / 0.18;
          const g = Math.exp(-0.5 * z * z);
          py = Math.round(plotBottom - 10 - (plotH - 24) * g);
        } else if (isSigmoid) {
          const sig = 1 / (1 + Math.exp(-6 * (t - 0.5)));
          py = Math.round(plotBottom - 10 - (plotH - 24) * sig);
        } else {
          const norm = Math.sin(t * Math.PI * 0.5);
          py = Math.round(plotBottom - 10 - (plotH - 20) * norm);
        }
        curvePoints.push(`${px},${py}`);
      }

      obj.parts.push({
        type: "polyline",
        x: plotLeft,
        y: plotTop,
        width: plotW,
        height: plotH,
        data: curvePoints.join(" "),
        text: "",
        fill: "none",
        stroke: "cyan",
        strokeWidth: 3,
        opacity: 0.95,
      });
    }

    // 3. Ensure Key Plotted Data Points Exist
    const currentPoints = obj.parts.filter((p) => p.type === "ellipse" && (p.data === "point" || (p.width <= 24 && p.height <= 24)));
    if (currentPoints.length === 0) {
      const samplePoints: Array<{ t: number; label: string; stroke: VisualPart["stroke"]; fill: VisualPart["fill"] }> = [
        { t: 0.15, label: "Start", stroke: "cyan", fill: "cyan" },
        { t: 0.5, label: "Mid", stroke: "yellow", fill: "yellow" },
        { t: 0.85, label: "Peak", stroke: "green", fill: "green" },
      ];

      for (const sp of samplePoints) {
        const px = Math.round(plotLeft + sp.t * plotW);
        const t = sp.t;
        let py: number;

        if (/\b(loss|cost|decay)\b/i.test(objText)) {
          py = Math.round(plotTop + 10 + (plotH - 20) * Math.exp(-3 * t));
        } else if (/\b(normal|gaussian|bell)\b/i.test(objText)) {
          const z = (t - 0.5) / 0.18;
          const g = Math.exp(-0.5 * z * z);
          py = Math.round(plotBottom - 10 - (plotH - 24) * g);
        } else {
          const norm = Math.sin(t * Math.PI * 0.5);
          py = Math.round(plotBottom - 10 - (plotH - 20) * norm);
        }

        obj.parts.push({
          type: "ellipse",
          x: px - 5,
          y: py - 5,
          width: 10,
          height: 10,
          data: "point",
          text: sp.label,
          fill: sp.fill,
          stroke: sp.stroke,
          strokeWidth: 2,
          opacity: 1,
        });
      }
    }
  }
}

/** Sanitize a scene without moving or shrinking it. ELK owns spatial layout. */
export function normalizeLessonLayout(rawPlan: LessonPlan): LessonPlan {
  const plan = repairAndValidateLessonPlan(rawPlan);
  const usedIds = new Set<string>();
  const idMap = new Map<string, string>();
  const allocateId = (value: string, fallback: string) => {
    const base = safeId(value, fallback);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base.slice(0, 48)}-${suffix++}`;
    usedIds.add(id);
    return id;
  };
  const objects = plan.objects.map((object, index) => {
    const id = allocateId(object.id, `object-${index + 1}`);
    if (!idMap.has(object.id)) idMap.set(object.id, id);
    const { width, height } = getVisualFootprint(object);
    const semantic = ["custom-template", "custom-chart", "custom-svg"].includes(object.shapeType);
    return {
      ...object,
      id,
      label: formatMathFormula(object.label).replace(/[<>]/g, "").replace(/^[:\s\-—]+/, "").trim().slice(0, 80),
      labelPlacement: object.parts.some((part) => part.type === "axes") ? "none" as const : object.labelPlacement,
      width,
      height,
      x: Number.isFinite(object.x) ? object.x : 0,
      y: Number.isFinite(object.y) ? object.y : 0,
      parts: semantic ? object.parts : sanitizeParts(object.parts, width, height, object.role),
    };
  });
  const objectIds = new Set(objects.map((object) => object.id));
  for (const object of objects) {
    const parentId = object.parentId ? idMap.get(object.parentId) : undefined;
    object.parentId = parentId && parentId !== object.id && objectIds.has(parentId) ? parentId : undefined;
  }
  const connections = plan.connections.flatMap((connection, index) => {
    const from = idMap.get(connection.from);
    const to = idMap.get(connection.to);
    if (!from || !to) return [];
    // Keep self-loops and parallel links: they carry distinct teaching meaning.
    const id = allocateId(connection.id, `link-${index + 1}`);
    if (!idMap.has(connection.id)) idMap.set(connection.id, id);
    return [{
      ...connection,
      id,
      from,
      to,
      label: (connection.label || "").replace(/[<>]/g, "").trim().slice(0, 80),
      bend: Number.isFinite(connection.bend) ? connection.bend : 0,
    }];
  });
  const validTargets = new Set([...objectIds, ...connections.map((connection) => connection.id)]);
  const fallbackId = objects[0]?.id;
  const segments = plan.segments.map((segment, index) => {
    const targetIds = [...new Set(segment.targetIds.map((id) => {
      const [base, part] = id.split("#");
      const mapped = idMap.get(base) ?? base;
      return part === undefined ? mapped : `${mapped}#${part}`;
    }).filter((id) => validTargets.has(id.split("#")[0])))];
    return {
      ...segment,
      id: safeId(segment.id, `segment-${index + 1}`),
      title: segment.title.replace(/[<>]/g, "").slice(0, 80),
      narration: segment.narration.replace(/[<>]/g, "").slice(0, 2400),
      durationMs: clamp(segment.durationMs, 1200, 45000),
      targetIds: targetIds.length ? targetIds : fallbackId ? [fallbackId] : [],
    };
  });
  return {
    ...plan,
    title: (plan.title || "").replace(/[<>]/g, "").slice(0, 120),
    summary: (plan.summary || "").replace(/[<>]/g, "").slice(0, 600),
    visualStrategy: (plan.visualStrategy || "").replace(/[<>]/g, "").slice(0, 260),
    objects,
    connections,
    segments,
  };
}
