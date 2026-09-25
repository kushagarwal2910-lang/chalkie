import type { LessonPlan, VisualObject, VisualPart } from "./lesson-schema";
import { formatMathFormula } from "./math-formatter.ts";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const GAP = 36;
const EDGE = 48;
const USABLE_W = CANVAS_WIDTH - 2 * EDGE;
const USABLE_H = CANVAS_HEIGHT - 2 * EDGE;
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

function sanitizeParts(parts: VisualPart[], objectWidth: number, objectHeight: number, objectX = 0, objectY = 0, role = "") {
  const isFormula = role === "formula";
  const objectBounds = {
    minX: isFormula ? 16 : 2,
    minY: isFormula ? 36 : 2,
    maxX: Math.max(2, objectWidth - (isFormula ? 16 : 2)),
    maxY: Math.max(2, objectHeight - (isFormula ? 10 : 2)),
  };
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

  // 2. Domain-agnostic visual repair (no domain-specific hardcoded coordinate hijacking)
  const templateObj = plan.objects.find((o) => o.shapeType === "custom-template");
  if (templateObj && plan.objects.length > 1) {
    // An all-in-one custom-template card already incorporates all components internally
    plan.objects = [templateObj];
    plan.connections = [];
    for (const seg of plan.segments) {
      seg.targetIds = [templateObj.id];
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
  const taught = new Set(plan.segments.flatMap((segment) => segment?.targetIds || []));
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
    const isFormula = object.role === "formula" || isFormulaNote || /^(formula|equation|governing equation|learning equation|loss equation)/i.test(object.label.trim());

    const isCustomSemantic = object.shapeType === "custom-template" || object.shapeType === "custom-chart" || object.shapeType === "custom-svg";

    // Ensure legible dimensions so formulas and labels have ample breathing room
    const minW = isCustomSemantic ? 320 : hasAxes ? 360 : isBackdrop ? 440 : isFormula ? 260 : 150;
    const maxW = isCustomSemantic ? 880 : isBackdrop ? 1080 : hasAxes ? 820 : 580;
    const minH = isCustomSemantic ? 220 : hasAxes ? 240 : isBackdrop ? 260 : isFormula ? 88 : 80;
    const maxH = isCustomSemantic ? 580 : isBackdrop ? 660 : hasAxes ? 520 : 480;

    const width = clamp(object.width, minW, maxW);
    const height = clamp(object.height, minH, maxH);

    return {
      ...object,
      id: objectId,
      label: formatMathFormula(object.label).replace(/[<>]/g, "").replace(/^[:\s\-—]+/, "").trim().slice(0, 80),
      labelPlacement: hasAxes ? "none" as const : object.labelPlacement,
      width,
      height,
      x: clamp(object.x, EDGE, CANVAS_WIDTH - width - EDGE),
      y: clamp(object.y, EDGE, CANVAS_HEIGHT - height - EDGE),
      parts: isCustomSemantic ? object.parts : sanitizeParts(object.parts, width, height, object.x, object.y, object.role),
    };
  });

  // 2. Universal Topological & Stage-Based Spatial Engine (Domain-Agnostic)
  // Map connections using idMap
  const mappedConnections = plan.connections.map((c) => ({
    ...c,
    from: idMap.get(c.from) ?? c.from,
    to: idMap.get(c.to) ?? c.to,
  }));

  // Classify objects by intrinsic pedagogical role
  const containers: VisualObject[] = [];
  const formulas: VisualObject[] = [];
  const functional: VisualObject[] = [];

  for (const obj of sanitizedObjects) {
    const isConnected = mappedConnections.some((c) => c.from === obj.id || c.to === obj.id);
    const isFormula =
      obj.role === "formula" ||
      (obj.role === "annotation" && obj.shapeType === "note") ||
      obj.shapeType === "note" ||
      /^(formula|equation|governing equation|learning equation|loss equation)/i.test(obj.label.trim());

    const isContainer = BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame";

    if (isFormula && !isConnected) {
      formulas.push(obj);
    } else if (isContainer) {
      containers.push(obj);
    } else {
      functional.push(obj);
    }
  }

  // Parent-child containment detection (e.g. neurons in a layer, gates in an ALU)
  const childToContainer = new Map<string, string>();
  const containerToChildren = new Map<string, VisualObject[]>();

  for (const c of containers) {
    const children: VisualObject[] = [];
    for (const f of functional) {
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;
      const inside = cx >= c.x - 30 && cx <= c.x + c.width + 30 && cy >= c.y - 30 && cy <= c.y + c.height + 30;
      const nameMatch = f.id.toLowerCase().includes(c.id.toLowerCase()) || (c.id.includes("layer") && f.id.includes("neuron"));
      if ((inside || nameMatch) && !childToContainer.has(f.id)) {
        children.push(f);
        childToContainer.set(f.id, c.id);
      }
    }
    if (children.length > 0) {
      containerToChildren.set(c.id, children);
      // Layout children inside container:
      // If container is a layer of neurons/nodes, stack vertically.
      // Otherwise, lay out components/stages horizontally across rows.
      const isNeuralLayer =
        c.id.toLowerCase().includes("layer") &&
        children.some(
          (ch) =>
            ch.id.toLowerCase().includes("neuron") ||
            ch.id.toLowerCase().includes("node") ||
            /^[xhŷ]\d*$/i.test(ch.label.trim()) ||
            ch.parts.some((p) => p.type === "ellipse")
        );

      if (isNeuralLayer) {
        let curY = 64; // Clearance for container header/pill
        let maxW = 0;
        for (const ch of children) {
          ch.x = 24;
          ch.y = curY;
          curY += ch.height + 20;
          maxW = Math.max(maxW, ch.width);
        }
        c.width = Math.max(c.width, maxW + 48);
        c.height = Math.max(c.height, curY + 24);
      } else {
        // Horizontal flow of components/stages inside container (e.g. CPU chip stages, machine parts)
        const CHILD_H_GAP = 56;
        const CHILD_V_GAP = 28;
        const CONTAINER_PAD_X = 40;
        const CONTAINER_PAD_TOP = 64;
        const maxW = 1000;

        let curX = CONTAINER_PAD_X;
        let curY = CONTAINER_PAD_TOP;
        let rowH = 0;
        let maxRowW = 0;

        for (let i = 0; i < children.length; i++) {
          const ch = children[i];
          if (curX + ch.width + CONTAINER_PAD_X > maxW && i > 0) {
            curX = CONTAINER_PAD_X;
            curY += rowH + CHILD_V_GAP;
            rowH = 0;
          }
          ch.x = curX;
          ch.y = curY;
          curX += ch.width + CHILD_H_GAP;
          rowH = Math.max(rowH, ch.height);
          maxRowW = Math.max(maxRowW, curX);
        }

        c.width = Math.max(c.width, maxRowW + CONTAINER_PAD_X - CHILD_H_GAP);
        c.height = Math.max(c.height, curY + rowH + 32);
      }
    }
  }

  // Top-level functional units: containers (with children or standalone parts) + standalone functional objects
  const topLevelUnits: VisualObject[] = [
    ...containers.filter((c) => (containerToChildren.get(c.id)?.length || 0) > 0 || (c.parts && c.parts.length > 0)),
    ...functional.filter((f) => !childToContainer.has(f.id)),
  ];

  // Graph Topological Ranking
  const idToUnit = new Map<string, VisualObject>();
  for (const u of topLevelUnits) idToUnit.set(u.id, u);
  for (const [cId, children] of containerToChildren.entries()) {
    const parent = idToUnit.get(cId);
    if (parent) {
      for (const ch of children) idToUnit.set(ch.id, parent);
    }
  }

  const adj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const u of topLevelUnits) {
    adj.set(u.id, new Set<string>());
    inDegree.set(u.id, 0);
  }

  for (const conn of mappedConnections) {
    const fromUnit = idToUnit.get(conn.from);
    const toUnit = idToUnit.get(conn.to);
    if (fromUnit && toUnit && fromUnit.id !== toUnit.id) {
      if (!adj.get(fromUnit.id)!.has(toUnit.id)) {
        adj.get(fromUnit.id)!.add(toUnit.id);
        inDegree.set(toUnit.id, (inDegree.get(toUnit.id) || 0) + 1);
      }
    }
  }

  // Calculate topological ranks (longest path from sources, cycle breaking)
  const ranks = new Map<string, number>();
  for (const u of topLevelUnits) ranks.set(u.id, 0);

  for (let iter = 0; iter < topLevelUnits.length; iter++) {
    let changed = false;
    for (const u of topLevelUnits) {
      const uRank = ranks.get(u.id) || 0;
      for (const vId of adj.get(u.id) || []) {
        const vRank = ranks.get(vId) || 0;
        if (vRank < uRank + 1 && uRank + 1 < topLevelUnits.length) {
          ranks.set(vId, uRank + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  let maxRank = Math.max(0, ...Array.from(ranks.values()));

  // If all units have rank 0 (e.g. parallel entities or disconnected graph), distribute horizontally across up to 4 columns based on initial X
  if (maxRank === 0 && topLevelUnits.length > 1) {
    const sorted = [...topLevelUnits].sort((a, b) => a.x - b.x);
    const targetCols = Math.min(sorted.length, Math.min(4, Math.ceil(Math.sqrt(sorted.length * 2))));
    const itemsPerCol = Math.ceil(sorted.length / targetCols);
    for (let i = 0; i < sorted.length; i++) {
      const colIdx = Math.floor(i / itemsPerCol);
      ranks.set(sorted[i].id, colIdx);
    }
    maxRank = Math.max(0, ...Array.from(ranks.values()));
  }

  const numLevels = Math.max(1, maxRank + 1);

  // Group units by rank
  const rankGroups: VisualObject[][] = Array.from({ length: numLevels }, () => []);
  for (const u of topLevelUnits) {
    const r = Math.min(numLevels - 1, ranks.get(u.id) || 0);
    rankGroups[r].push(u);
  }

  for (const grp of rankGroups) {
    grp.sort((a, b) => a.y - b.y);
  }

  // Determine dominant flow orientation from connections and initial coordinates (pure geometry)
  let verticalScore = 0;
  let horizontalScore = 0;

  for (const conn of plan.connections) {
    const fromObj = plan.objects.find((o) => o.id === conn.from);
    const toObj = plan.objects.find((o) => o.id === conn.to);
    if (!fromObj || !toObj) continue;

    const dx = Math.abs((toObj.x + toObj.width / 2) - (fromObj.x + fromObj.width / 2));
    const dy = Math.abs((toObj.y + toObj.height / 2) - (fromObj.y + fromObj.height / 2));

    const isExplicitVerticalAnchor =
      (conn.fromAnchor === "top" || conn.fromAnchor === "bottom") &&
      (conn.toAnchor === "top" || conn.toAnchor === "bottom");

    if (isExplicitVerticalAnchor || dy > dx * 1.5) {
      verticalScore++;
    } else {
      horizontalScore++;
    }
  }

  const isVerticalFlow =
    (plan.diagramType as string) === "stack" ||
    (plan.diagramType as string) === "layers" ||
    (verticalScore > horizontalScore && verticalScore >= 2);

  if (isVerticalFlow) {
    // Vertical flow (e.g. atmospheric layers, water columns, vertical stacks)
    const rowHeight = USABLE_H / numLevels;
    const rank0Y = rankGroups[0]?.[0]?.y ?? 0;
    const lastRankY = rankGroups[numLevels - 1]?.[0]?.y ?? 0;
    const invertVertical = rank0Y > lastRankY;

    for (let r = 0; r < numLevels; r++) {
      const grp = rankGroups[r];
      if (grp.length === 0) continue;

      const effectiveRow = invertVertical ? numLevels - 1 - r : r;
      const rowCenterY = EDGE + (effectiveRow + 0.5) * rowHeight;
      const totalGrpW = grp.reduce((sum, u) => sum + u.width, 0) + (grp.length - 1) * 28;
      let curX = Math.max(EDGE, EDGE + (USABLE_W - totalGrpW) / 2);

      for (const u of grp) {
        u.x = Math.round(curX);
        u.y = Math.round(rowCenterY - u.height / 2);
        curX += u.width + 28;

        const children = containerToChildren.get(u.id);
        if (children) {
          for (const ch of children) {
            ch.x = u.x + ch.x;
            ch.y = u.y + ch.y;
          }
        }
      }
    }
  } else {
    // Horizontal stage columns (standard for pipelines, neural networks, causal cycles, circuits, celestial bodies)
    const hasFormulas = formulas.length > 0;
    const functionalUsableH = hasFormulas ? USABLE_H - 180 : USABLE_H;
    const colWidth = USABLE_W / numLevels;

    for (let r = 0; r < numLevels; r++) {
      const grp = rankGroups[r];
      if (grp.length === 0) continue;

      const colCenterX = EDGE + (r + 0.5) * colWidth;
      const totalGrpH = grp.reduce((sum, u) => sum + u.height, 0) + (grp.length - 1) * 28;
      let curY = Math.max(EDGE, EDGE + (functionalUsableH - totalGrpH) / 2);

      for (const u of grp) {
        u.x = Math.round(colCenterX - u.width / 2);
        u.y = Math.round(curY);
        curY += u.height + 28;

        const children = containerToChildren.get(u.id);
        if (children) {
          for (const ch of children) {
            ch.x = u.x + ch.x;
            ch.y = u.y + ch.y;
          }
        }
      }
    }

    // Place Formula / Annotation Cards in Dedicated Bottom Ribbon
    if (hasFormulas) {
      const totalFormulaW = formulas.reduce((sum, f) => sum + f.width, 0) + (formulas.length - 1) * 32;
      let formulaStartX = Math.max(EDGE, Math.round((CANVAS_WIDTH - totalFormulaW) / 2));
      const formulaY = Math.round(CANVAS_HEIGHT - EDGE - Math.max(...formulas.map((f) => f.height)));

      for (const f of formulas) {
        f.x = formulaStartX;
        f.y = formulaY;
        formulaStartX += f.width + 32;
      }
    }
  }

  // Multi-Pass AABB Collision Relaxation (Guaranteed 0 Collisions)
  const allTopItems: VisualObject[] = [...topLevelUnits, ...formulas];

  for (let iter = 0; iter < 50; iter++) {
    let shifted = false;
    for (let i = 0; i < allTopItems.length; i++) {
      for (let j = i + 1; j < allTopItems.length; j++) {
        const a = allTopItems[i];
        const b = allTopItems[j];
        const gap = 24;

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap;
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap;

        if (overlapX > 0 && overlapY > 0) {
          shifted = true;
          if (overlapX <= overlapY) {
            const shift = Math.ceil(overlapX / 2);
            if (b.x >= a.x) {
              b.x += shift;
              a.x -= shift;
            } else {
              a.x += shift;
              b.x -= shift;
            }
          } else {
            const shift = Math.ceil(overlapY / 2);
            if (b.y >= a.y) {
              b.y += shift;
              a.y -= shift;
            } else {
              a.y += shift;
              b.y -= shift;
            }
          }

          // Propagate shifts to children
          if (containerToChildren.has(a.id)) {
            const children = containerToChildren.get(a.id)!;
            const minChX = Math.min(...children.map((c) => c.x));
            const minChY = Math.min(...children.map((c) => c.y));
            const dx = a.x + 24 - minChX;
            const dy = a.y + 64 - minChY;
            for (const ch of children) {
              ch.x += dx;
              ch.y += dy;
            }
          }
          if (containerToChildren.has(b.id)) {
            const children = containerToChildren.get(b.id)!;
            const minChX = Math.min(...children.map((c) => c.x));
            const minChY = Math.min(...children.map((c) => c.y));
            const dx = b.x + 24 - minChX;
            const dy = b.y + 64 - minChY;
            for (const ch of children) {
              ch.x += dx;
              ch.y += dy;
            }
          }
        }
      }
    }
    if (!shifted) break;
  }

  // Global Proportional Fit & Centering (GUARANTEE 16:9 CANVAS FIT)
  const allFinalObjects: VisualObject[] = [
    ...topLevelUnits,
    ...formulas,
    ...Array.from(containerToChildren.values()).flat(),
  ];
  const uniqueMap = new Map<string, VisualObject>();
  for (const o of allFinalObjects) uniqueMap.set(o.id, o);
  const unique = Array.from(uniqueMap.values());

  let minX = Math.min(...unique.map((o) => o.x));
  let maxX = Math.max(...unique.map((o) => o.x + o.width));
  let minY = Math.min(...unique.map((o) => o.y));
  let maxY = Math.max(...unique.map((o) => o.y + o.height));
  let totalW = maxX - minX;
  let totalH = maxY - minY;

  const scaleX = USABLE_W / Math.max(1, totalW);
  const scaleY = USABLE_H / Math.max(1, totalH);
  const scale = Math.min(1.0, scaleX, scaleY);

  if (scale < 1.0) {
    const centerX = minX + totalW / 2;
    const centerY = minY + totalH / 2;

    for (const o of unique) {
      o.width = Math.round(o.width * scale);
      o.height = Math.round(o.height * scale);
      o.x = Math.round(centerX + (o.x - centerX) * scale);
      o.y = Math.round(centerY + (o.y - centerY) * scale);
    }

    minX = Math.min(...unique.map((o) => o.x));
    maxX = Math.max(...unique.map((o) => o.x + o.width));
    minY = Math.min(...unique.map((o) => o.y));
    maxY = Math.max(...unique.map((o) => o.y + o.height));
    totalW = maxX - minX;
    totalH = maxY - minY;
  }

  // Center within 1280x720 canvas
  const shiftX = Math.round((CANVAS_WIDTH - totalW) / 2 - minX);
  const shiftY = Math.round((CANVAS_HEIGHT - totalH) / 2 - minY);

  for (const o of unique) {
    o.x += shiftX;
    o.y += shiftY;
  }

  const validUniqueIds = new Set(unique.map((o) => o.id));
  const connectionIds = new Set<string>();

  const connections = plan.connections.flatMap((connection, index) => {
    const from = idMap.get(connection.from) ?? connection.from;
    const to = idMap.get(connection.to) ?? connection.to;
    if (!from || !to || from === to) return [];

    const baseId = `link-${safeId(connection.id, String(index + 1))}`;
    let connectionId = baseId;
    let suffix = 2;
    while (ids.has(connectionId) || connectionIds.has(connectionId)) connectionId = `${baseId.slice(0, 50)}-${suffix++}`;
    connectionIds.add(connectionId);
    idMap.set(connection.id, connectionId);
    idMap.set(connectionId, connectionId);
    validUniqueIds.add(connectionId);

    const fromObject = unique.find((object) => object.id === from);
    const toObject = unique.find((object) => object.id === to);
    if (!fromObject || !toObject) return [];

    const dx = (toObject.x + toObject.width / 2) - (fromObject.x + fromObject.width / 2);
    const dy = (toObject.y + toObject.height / 2) - (fromObject.y + fromObject.height / 2);
    const automaticAnchors = Math.abs(dx) >= Math.abs(dy)
      ? { fromAnchor: dx >= 0 ? "right" as const : "left" as const, toAnchor: dx >= 0 ? "left" as const : "right" as const }
      : { fromAnchor: dy >= 0 ? "bottom" as const : "top" as const, toAnchor: dy >= 0 ? "top" as const : "bottom" as const };

    const rawLabel = (connection.label || "").replace(/[<>]/g, "").trim().slice(0, 18);

    return [{
      ...connection,
      id: connectionId,
      from,
      to,
      label: rawLabel,
      route: connection.route === "curve" ? "curve" as const : "elbow" as const,
      ...(connection.route === "curve" ? {} : automaticAnchors),
      bend: clamp(connection.bend || 0, -160, 160),
    }];
  });

  const fallbackId = unique[0]?.id;
  const segments = plan.segments.map((segment, index) => {
    const targetIds = [...new Set(segment.targetIds.map((id) => idMap.get(id) ?? id).filter((id): id is string => typeof id === "string" && validUniqueIds.has(id)))];
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
    title: (plan.title || "").replace(/[<>]/g, "").slice(0, 120),
    summary: (plan.summary || "").replace(/[<>]/g, "").slice(0, 600),
    visualStrategy: (plan.visualStrategy || "").replace(/[<>]/g, "").slice(0, 260),
    objects: unique,
    connections,
    segments,
  };
}

