import { z } from "zod";

export const canvasColors = ["ink", "slate", "blue", "cyan", "violet", "orange", "green", "red", "yellow", "white", "gray", "none"] as const;
export type CanvasColor = typeof canvasColors[number];

export const diagramTypes = ["mechanism", "spatial", "structure", "cycle", "process", "comparison", "timeline", "system", "quantitative"] as const;
export const visualRoles = ["subject", "component", "environment", "container", "input", "output", "force", "annotation", "energy", "motion", "field", "path", "layer", "formula"] as const;
export const visualShapeTypes = ["custom", "custom-chart", "custom-svg", "custom-template", "geo", "note", "frame"] as const;
export const connectionArrowheads = ["none", "arrow", "triangle", "dot", "diamond", "bar"] as const;
export const labelPlacements = ["inside", "below", "above", "left", "right", "none"] as const;
export type LabelPlacement = typeof labelPlacements[number];

export const safeColorSchema = z.preprocess((val) => {
  if (typeof val !== "string") return "slate";
  const s = val.trim().toLowerCase();
  if (canvasColors.includes(s as any)) return s;
  if (s === "grey" || s === "silver" || s === "metal") return "gray";
  if (s === "black" || s === "dark") return "ink";
  if (s === "purple" || s === "magenta") return "violet";
  if (s === "gold") return "yellow";
  return "slate";
}, z.enum(canvasColors));

export const safeLabelPlacementSchema = z.preprocess((val) => {
  if (typeof val !== "string") return "below";
  const s = val.trim().toLowerCase();
  if (labelPlacements.includes(s as any)) return s;
  if (s === "top") return "above";
  if (s === "bottom") return "below";
  if (s === "center" || s === "middle") return "inside";
  return "below";
}, z.enum(labelPlacements));

export const researchSourceSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(180),
  url: z.string().url().or(z.string().min(1)),
  publisher: z.string().max(100).default("Web source"),
  summary: z.string().max(500),
  score: z.preprocess((val) => {
    const num = typeof val === "number" ? val : parseFloat(String(val)) || 0.85;
    return num > 1 ? Math.min(1, num / 100) : Math.max(0, Math.min(1, num));
  }, z.number().min(0).max(1).default(0.85)),
});

export const visualPartSchema = z.object({
  type: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    const valid = ["ellipse", "rect", "line", "arrow", "polyline", "polygon", "path", "text", "axes", "radial", "coil", "wave", "particles", "orbit", "cluster", "quarks"];
    return valid.includes(s) ? s : "rect";
  }, z.enum(["ellipse", "rect", "line", "arrow", "polyline", "polygon", "path", "text", "axes", "radial", "coil", "wave", "particles", "orbit", "cluster", "quarks"])),
  x: z.coerce.number().default(0),
  y: z.coerce.number().default(0),
  width: z.coerce.number().default(100),
  height: z.coerce.number().default(60),
  data: z.string().default(""),
  text: z.string().default(""),
  fill: safeColorSchema.default("slate"),
  stroke: safeColorSchema.default("slate"),
  strokeWidth: z.coerce.number().default(2),
  opacity: z.coerce.number().default(1),
});

export const visualObjectSchema = z.object({
  id: z.string().min(1).max(200),
  parentId: z.string().max(200).optional(),
  role: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return visualRoles.includes(s as any) ? s : "component";
  }, z.enum(visualRoles)),
  shapeType: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return visualShapeTypes.includes(s as any) ? s : "custom";
  }, z.enum(visualShapeTypes)).default("custom"),
  geo: z.string().optional(),
  color: safeColorSchema.optional(),
  label: z.preprocess((val) => (val == null ? "" : String(val)), z.string().default("")),
  labelPlacement: safeLabelPlacementSchema.default("below"),
  x: z.coerce.number().default(0),
  y: z.coerce.number().default(0),
  width: z.coerce.number().default(180),
  height: z.coerce.number().default(120),
  parts: z.array(visualPartSchema).max(24).default([]),
  props: z.record(z.any()).optional(),
  chart: z.any().optional(),
  svg: z.any().optional(),
  template: z.any().optional(),
  templateType: z.string().optional(),
  templateData: z.any().optional(),
  data: z.any().optional(),
  content: z.any().optional(),
});

export const visualConnectionSchema = z.object({
  id: z.string().min(1).max(200),
  from: z.string().max(200),
  to: z.string().max(200),
  label: z.preprocess((val) => (val == null ? "" : String(val)), z.string().default("")),
  color: safeColorSchema.default("slate"),
  route: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return ["straight", "curve", "elbow"].includes(s) ? s : "straight";
  }, z.enum(["straight", "curve", "elbow"])),
  fromAnchor: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return ["top", "right", "bottom", "left", "center"].includes(s) ? s : "center";
  }, z.enum(["top", "right", "bottom", "left", "center"])),
  toAnchor: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return ["top", "right", "bottom", "left", "center"].includes(s) ? s : "center";
  }, z.enum(["top", "right", "bottom", "left", "center"])),
  arrowhead: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return connectionArrowheads.includes(s as any) ? s : "arrow";
  }, z.enum(connectionArrowheads)).default("arrow"),
  bend: z.preprocess((val) => Number(val) || 0, z.number().default(0)),
  // Computed by the layout engine, in canvas page coordinates. These are not
  // requested from the language model: its anchors alone cannot describe a route.
  points: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).min(2).max(256).optional(),
  fromPort: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  toPort: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  labelPosition: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().nonnegative(), height: z.number().nonnegative() }).optional(),
});

export const lessonSegmentSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.preprocess((val) => (val == null ? "" : String(val)), z.string().default("")),
  narration: z.string().min(1).max(2400),
  targetIds: z.array(z.string().max(200)).min(1).max(16),
  action: z.preprocess((val) => {
    const s = String(val ?? "").toLowerCase();
    return ["reveal", "focus", "trace", "move", "rotate", "pulse", "flow", "orbit"].includes(s) ? s : "focus";
  }, z.enum(["reveal", "focus", "trace", "move", "rotate", "pulse", "flow", "orbit"])),
  durationMs: z.coerce.number().int().min(0).max(120000).default(5000),
});

export const lessonPlanSchema = z.object({
  id: z.preprocess((val) => (val ? String(val) : `lesson-${Date.now()}`), z.string().min(1).max(80).default(() => `lesson-${Date.now()}`)),
  title: z.preprocess((val) => (val == null ? "" : String(val)), z.string().default("")),
  question: z.string().min(1).max(1000),
  summary: z.preprocess((val) => (val == null ? "" : String(val)), z.string().default("")),
  diagramType: z.enum(diagramTypes),
  visualStrategy: z.preprocess((val) => (val == null ? "Diagram" : String(val)), z.string().default("Diagram")),
  sources: z.array(researchSourceSchema).max(20),
  objects: z.array(visualObjectSchema).min(1).max(72),
  connections: z.array(visualConnectionSchema).max(120),
  segments: z.array(lessonSegmentSchema).min(1).max(48),
});

export const followUpPlanSchema = z.object({
  id: z.preprocess((val) => (val ? String(val) : `follow-up-${Date.now()}`), z.string().min(1).max(80).default(() => `follow-up-${Date.now()}`)),
  title: z.preprocess((val) => (val == null ? "" : String(val)), z.string().default("")),
  answer: z.string().min(1).max(2400),
  coverage: z.preprocess((val) => (val === "append" ? "append" : "existing"), z.enum(["existing", "append"])),
  visualStrategy: z.preprocess((val) => (val == null ? "Diagram" : String(val)), z.string().default("Diagram")),
  targetIds: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string().max(200)).default([])),
  objects: z.array(visualObjectSchema).max(12).default([]),
  connections: z.array(visualConnectionSchema).max(24).default([]),
  segments: z.preprocess((val) => {
    if (Array.isArray(val) && val.length > 0) return val;
    return [{
      id: `follow-step-1`,
      title: "Explanation",
      narration: "Here is how this works.",
      targetIds: ["root"],
      action: "focus",
      durationMs: 4000,
    }];
  }, z.array(lessonSegmentSchema).min(1).max(8)),
});

export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type VisualPart = z.infer<typeof visualPartSchema>;
export type VisualObject = z.infer<typeof visualObjectSchema>;
export type VisualConnection = z.infer<typeof visualConnectionSchema>;
export type LessonSegment = z.infer<typeof lessonSegmentSchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type FollowUpPlan = z.infer<typeof followUpPlanSchema>;

const colorSchema = { type: "string", enum: canvasColors } as const;
const partSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "x", "y", "width", "height", "data", "text", "fill", "stroke", "strokeWidth", "opacity"],
  properties: {
    type: { type: "string", enum: ["ellipse", "rect", "line", "arrow", "polyline", "polygon", "path", "text", "axes", "radial", "coil", "wave", "particles", "orbit", "cluster", "quarks"] },
    x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" },
    data: { type: "string" }, text: { type: "string" }, fill: colorSchema, stroke: colorSchema,
    strokeWidth: { type: "number" }, opacity: { type: "number" },
  },
} as const;

export const lessonJsonSchema = {
  name: "chalkie_scene_graph",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["id", "title", "question", "summary", "diagramType", "visualStrategy", "sources", "objects", "connections", "segments"],
    properties: {
      id: { type: "string" }, title: { type: "string" }, question: { type: "string" }, summary: { type: "string" },
      diagramType: { type: "string", enum: diagramTypes }, visualStrategy: { type: "string" },
      sources: {
        type: "array", maxItems: 20,
        items: {
          type: "object", additionalProperties: false,
          required: ["id", "title", "url", "publisher", "summary", "score"],
          properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, summary: { type: "string" }, score: { type: "number" } },
        },
      },
      objects: {
        type: "array", minItems: 3, maxItems: 18,
        items: {
          type: "object", additionalProperties: false,
          required: ["id", "role", "shapeType", "label", "labelPlacement", "x", "y", "width", "height", "parts"],
          properties: {
            id: { type: "string" }, role: { type: "string", enum: visualRoles },
            shapeType: { type: "string", enum: visualShapeTypes },
            label: { type: "string" }, labelPlacement: { type: "string", enum: labelPlacements },
            x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" },
            parts: { type: "array", maxItems: 12, items: partSchema },
          },
        },
      },
      connections: {
        type: "array", maxItems: 28,
        items: {
          type: "object", additionalProperties: false,
          required: ["id", "from", "to", "label", "color", "route", "fromAnchor", "toAnchor", "arrowhead", "bend"],
          properties: {
            id: { type: "string" }, from: { type: "string" }, to: { type: "string" }, label: { type: "string" }, color: colorSchema,
            route: { type: "string", enum: ["straight", "curve", "elbow"] }, fromAnchor: { type: "string", enum: ["top", "right", "bottom", "left", "center"] },
            toAnchor: { type: "string", enum: ["top", "right", "bottom", "left", "center"] }, arrowhead: { type: "string", enum: connectionArrowheads }, bend: { type: "number" },
          },
        },
      },
      segments: {
        type: "array", minItems: 2, maxItems: 12,
        items: {
          type: "object", additionalProperties: false,
          required: ["id", "title", "narration", "targetIds", "action", "durationMs"],
          properties: {
            id: { type: "string" }, title: { type: "string" }, narration: { type: "string" }, targetIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
            action: { type: "string", enum: ["reveal", "focus", "trace", "move", "rotate", "pulse", "flow", "orbit"] }, durationMs: { type: "integer" },
          },
        },
      },
    },
  },
} as const;

const objectJsonSchema = lessonJsonSchema.schema.properties.objects.items;
const connectionJsonSchema = lessonJsonSchema.schema.properties.connections.items;
const segmentJsonSchema = lessonJsonSchema.schema.properties.segments.items;

export const followUpJsonSchema = {
  name: "chalkie_follow_up",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["id", "title", "answer", "coverage", "visualStrategy", "targetIds", "objects", "connections", "segments"],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      answer: { type: "string" },
      coverage: { type: "string", enum: ["existing", "append"] },
      visualStrategy: { type: "string" },
      targetIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
      objects: { type: "array", maxItems: 8, items: objectJsonSchema },
      connections: { type: "array", maxItems: 14, items: connectionJsonSchema },
      segments: { type: "array", minItems: 1, maxItems: 6, items: segmentJsonSchema },
    },
  },
} as const;
