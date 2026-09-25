"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createShapeId,
  type Editor,
  type TLArrowBinding,
  type TLShapeId,
  type TLShapePartial,
  Tldraw,
  toRichText,
} from "tldraw";
import type { LessonPlan, LessonSegment, VisualConnection, VisualObject } from "@/lib/lesson-schema";
import { CHALK_VISUAL_TYPE, chalkShapeUtils } from "@/components/chalk-visual-shape";
import { CUSTOM_CHART_TYPE, CUSTOM_SVG_TYPE, CUSTOM_TEMPLATE_TYPE } from "@/components/custom-shapes";
import { applyElkLayout } from "@/lib/elk-spatial-layout";
import { formatMathFormula } from "@/lib/math-formatter";

const tldrawColor: Record<string, "black" | "grey" | "blue" | "light-blue" | "violet" | "orange" | "green" | "red" | "yellow"> = {
  ink: "light-blue", slate: "grey", blue: "blue", cyan: "light-blue", violet: "violet", orange: "orange", green: "green", red: "red", yellow: "yellow", white: "light-blue", none: "light-blue",
};

const anchorValue: Record<VisualConnection["fromAnchor"], { x: number; y: number }> = {
  top: { x: 0.5, y: 0 }, right: { x: 1, y: 0.5 }, bottom: { x: 0.5, y: 1 }, left: { x: 0, y: 0.5 }, center: { x: 0.5, y: 0.5 },
};

const validGeoNames = new Set([
  "rectangle", "ellipse", "triangle", "diamond", "cloud",
  "hexagon", "star", "rhombus", "oval", "trapezoid", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "check-box"
]);

function objectShape(object: VisualObject): TLShapePartial {
  const shapeId = createShapeId(object.id);
  const color = tldrawColor[object.color || "ink"] ?? "black";

  if (
    object.shapeType === "custom-template" ||
    (object as any).type === "custom-template" ||
    (object as any).templateType ||
    (object as any).template
  ) {
    const rawProps = (object as any).props || (object as any).templateData || {};
    const templateType =
      rawProps.templateType ||
      (object as any).templateType ||
      (object as any).template ||
      "hero-breakdown";

    const validTemplateTypes = [
      "network-graph",
      "hero-breakdown",
      "process-cycle",
      "timeline",
      "comparison-grid",
      "layered-stack",
    ];
    const safeType = validTemplateTypes.includes(templateType)
      ? templateType
      : "hero-breakdown";

    const dataPayload = rawProps.data || rawProps.content || (object as any).content || rawProps || {};

    return {
      id: shapeId,
      type: CUSTOM_TEMPLATE_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(320, object.width || rawProps.w || 640),
        h: Math.max(220, object.height || rawProps.h || 420),
        templateType: safeType,
        title: rawProps.title || object.label || "",
        subtitle: rawProps.subtitle || "",
        themeColor: rawProps.themeColor || object.color || "blue",
        data: dataPayload,
      },
      meta: { chalkieId: object.id, role: object.role },
    } as TLShapePartial;
  }

  if (object.shapeType === "custom-chart" || (object as any).type === "custom-chart") {

    const rawProps = (object as any).props || (object as any).chart || {};
    let rawData = rawProps.data;
    if (typeof rawData === "string") {
      try { rawData = JSON.parse(rawData); } catch { rawData = []; }
    }
    if (!rawData && object.parts?.[0]?.data) {
      try { rawData = JSON.parse(object.parts[0].data); } catch { /* ignore */ }
    }

    const dataArray = Array.isArray(rawData) ? rawData : [];
    const sanitizedData = dataArray.map((item: any, idx: number) => {
      if (typeof item === "number") {
        return { name: `Item ${idx + 1}`, value: Number.isFinite(item) ? item : (idx + 1) * 10 };
      }
      if (typeof item === "string") {
        const parsed = parseFloat(item.replace(/[^0-9.-]/g, ""));
        return { name: `Item ${idx + 1}`, value: Number.isFinite(parsed) ? parsed : (idx + 1) * 10 };
      }
      const name = String(item?.name ?? item?.label ?? item?.category ?? item?.x ?? item?.title ?? item?.key ?? `Item ${idx + 1}`);
      const rawVal = item?.value ?? item?.val ?? item?.y ?? item?.amount ?? item?.count ?? item?.score ?? item?.number ?? item?.v;
      const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal ?? "").replace(/[^0-9.-]/g, ""));
      const value = Number.isFinite(num) ? num : (idx + 1) * 10;
      return {
        name: name || `Item ${idx + 1}`,
        value,
        color: item?.color ? String(item.color) : undefined,
      };
    });

    const finalData = sanitizedData.length > 0 ? sanitizedData : [
      { name: "Group A", value: 45 },
      { name: "Group B", value: 85 },
      { name: "Group C", value: 60 },
    ];

    const validChartTypes = ["bar", "line", "pie", "area"];
    const chartType = validChartTypes.includes(rawProps.chartType) ? rawProps.chartType : "bar";

    return {
      id: shapeId,
      type: CUSTOM_CHART_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(200, object.width || rawProps.w || 440),
        h: Math.max(160, object.height || rawProps.h || 280),
        title: rawProps.title || object.label || "Statistical Chart",
        chartType,
        data: finalData,
        xAxisLabel: rawProps.xAxisLabel || "",
        yAxisLabel: rawProps.yAxisLabel || "",
        color: rawProps.color || object.color || "blue",
      },
      meta: { chalkieId: object.id, role: object.role },
    } as TLShapePartial;
  }

  if (object.shapeType === "custom-svg" || (object as any).type === "custom-svg") {
    const rawProps = (object as any).props || (object as any).svg || {};
    let svgString = rawProps.svgString || "";
    if (!svgString && object.parts?.[0]?.data) {
      svgString = object.parts[0].data;
    }
    if (!svgString && object.parts?.[0]?.text) {
      svgString = object.parts[0].text;
    }

    return {
      id: shapeId,
      type: CUSTOM_SVG_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(80, object.width || rawProps.w || 360),
        h: Math.max(80, object.height || rawProps.h || 260),
        title: rawProps.title || object.label || "",
        caption: rawProps.caption || "",
        svgString: typeof svgString === "string" ? svgString : "",
      },
      meta: { chalkieId: object.id, role: object.role },
    } as TLShapePartial;
  }

  if (object.shapeType === "geo") {
    // Upgrade generic geo objects to chalk-visual so they render as rich visual components with
    // proper chassis and SVG parts, eliminating crude hand-drawn wireframe boxes!
    return {
      id: shapeId,
      type: CHALK_VISUAL_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(120, object.width),
        h: Math.max(80, object.height),
        label: formatMathFormula(object.label || ""),
        labelPlacement: object.labelPlacement || "below",
        role: object.role,
        partsJson: JSON.stringify(object.parts || []),
      },
      meta: { chalkieId: object.id, role: object.role },
    } as TLShapePartial;
  }

  if (object.shapeType === "note") {
    const isFormula = /[=+Δ\\/*^]/.test(object.label);
    // Only use tldraw's native giant sticky note if it's purely a formula or law annotation
    if (object.role === "annotation" && isFormula) {
      return {
        id: shapeId,
        type: "note",
        x: object.x,
        y: object.y,
        props: {
          color: tldrawColor[object.color || "yellow"] ?? "yellow",
          size: "s",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
          richText: toRichText(formatMathFormula(object.label || "")),
        },
        meta: { chalkieId: object.id, role: object.role },
      } as TLShapePartial;
    }

    // Otherwise, render as a sleek chalk visual card
    return {
      id: shapeId,
      type: CHALK_VISUAL_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(150, object.width),
        h: Math.max(80, object.height),
        label: formatMathFormula(object.label || ""),
        labelPlacement: object.labelPlacement || "inside",
        role: object.role,
        partsJson: JSON.stringify(object.parts || []),
      },
      meta: { chalkieId: object.id, role: object.role },
    } as TLShapePartial;
  }

  if (object.shapeType === "frame" || BACKDROP_ROLES.has(object.role)) {
    // Avoid tldraw native "frame" shape to prevent automatic child reparenting and arrow displacement!
    // Render as custom chalk visual container with technical corner accents and clean backdrop
    return {
      id: shapeId,
      type: CHALK_VISUAL_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(120, object.width),
        h: Math.max(80, object.height),
        label: object.label || "",
        labelPlacement: "above",
        role: object.role === "environment" ? "environment" : "container",
        partsJson: JSON.stringify(object.parts),
      },
      meta: { chalkieId: object.id, role: object.role },
    } as TLShapePartial;
  }

  // Default: custom chalk visual shape with SVG parts and chassis
  return {
    id: shapeId,
    type: CHALK_VISUAL_TYPE,
    x: object.x,
    y: object.y,
    props: {
      w: Math.max(20, object.width),
      h: Math.max(20, object.height),
      label: object.label,
      labelPlacement: object.labelPlacement,
      role: object.role,
      partsJson: JSON.stringify(object.parts),
    },
    meta: { chalkieId: object.id, role: object.role },
  } as TLShapePartial;
}

function safeAnchorNorm(anchor?: string): { x: number; y: number } {
  if (anchor && anchor in anchorValue) {
    return anchorValue[anchor as VisualConnection["fromAnchor"]];
  }
  return { x: 0.5, y: 0.5 };
}

function anchorPoint(object: VisualObject, anchor?: VisualConnection["fromAnchor"]) {
  const normalized = safeAnchorNorm(anchor);
  return { x: object.x + object.width * normalized.x, y: object.y + object.height * normalized.y };
}

const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

function syncScene(editor: Editor, lesson: LessonPlan, visibleIds?: Set<string>, reset = false) {
  if (reset) editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()));

  // 1. Determine which objects should be visible right now (progressive reveal)
  const shouldBeVisible = new Set<string>();
  for (const object of lesson.objects) {
    if (!visibleIds || visibleIds.has(object.id) || BACKDROP_ROLES.has(object.role) || object.shapeType === "frame") {
      shouldBeVisible.add(object.id);
    }
  }

  // 2. Remove any shapes that should NOT be visible yet (progressive reveal)
  const currentShapeIds = Array.from(editor.getCurrentPageShapeIds());
  const shapesToDelete: TLShapeId[] = [];
  for (const sId of currentShapeIds) {
    const shape = editor.getShape(sId);
    const chalkieId = (shape?.meta as any)?.chalkieId;
    if (chalkieId && !shouldBeVisible.has(chalkieId)) {
      shapesToDelete.push(sId);
    }
  }
  if (shapesToDelete.length) {
    editor.deleteShapes(shapesToDelete);
  }

  // 3. Add or update visible objects with corrected coordinates
  const visibleObjects = lesson.objects.filter((object) => shouldBeVisible.has(object.id));
  const missingObjects: VisualObject[] = [];
  const existingToUpdate: TLShapePartial[] = [];

  for (const object of visibleObjects) {
    const existingShape = editor.getShape(createShapeId(object.id));
    if (existingShape) {
      const newShape = objectShape(object);
      const isPosDiff = Math.abs(existingShape.x - object.x) > 0.5 || Math.abs(existingShape.y - object.y) > 0.5;
      const currentProps = existingShape.props as any;
      const newProps = newShape.props as any;
      const isPropDiff = newProps && (
        currentProps?.w !== newProps.w ||
        currentProps?.h !== newProps.h ||
        currentProps?.label !== newProps.label ||
        currentProps?.partsJson !== newProps.partsJson
      );
      if (isPosDiff || isPropDiff) {
        existingToUpdate.push({
          id: existingShape.id,
          type: existingShape.type,
          x: object.x,
          y: object.y,
          props: {
            ...currentProps,
            ...newProps,
          },
        });
      }
    } else {
      missingObjects.push(object);
    }
  }

  if (existingToUpdate.length) {
    try {
      editor.updateShapes(existingToUpdate);
    } catch (err) {
      console.warn("[chalkie] shape update notice", err);
    }
  }

  if (missingObjects.length) {
    try {
      editor.createShapes(missingObjects.map(objectShape));
    } catch (err) {
      console.error("[chalkie] failed to create shapes with primary util, falling back to visual chassis", err);
      try {
        const fallbacks = missingObjects.map((obj) => {
          const s = objectShape(obj);
          if (s.type !== CHALK_VISUAL_TYPE) {
            return {
              ...s,
              type: CHALK_VISUAL_TYPE,
              props: {
                w: Math.max(150, obj.width || 240),
                h: Math.max(80, obj.height || 140),
                label: obj.label || "",
                labelPlacement: "below" as const,
                role: obj.role,
                partsJson: JSON.stringify(obj.parts || []),
              },
            };
          }
          return s;
        });
        editor.createShapes(fallbacks);
      } catch (fallbackErr) {
        console.error("[chalkie] fatal shape creation failure", fallbackErr);
      }
    }
  }

  // 4. Directional arrow connections: ONLY visible if BOTH from and to objects are visible!
  const byId = new Map(visibleObjects.map((object) => [object.id, object]));
  const arrowsToCreate: VisualConnection[] = [];
  const arrowsToDelete: TLShapeId[] = [];
  const validArrowIds = new Set(lesson.connections.map((c) => createShapeId(c.id)));

  // Remove any stale arrow shapes left behind by prior layouts or ID remappings
  for (const sId of currentShapeIds) {
    const shape = editor.getShape(sId);
    if (shape && shape.type === "arrow" && !validArrowIds.has(sId)) {
      arrowsToDelete.push(sId);
    }
  }

  for (const connection of lesson.connections) {
    const arrowId = createShapeId(connection.id);
    const hasFrom = byId.has(connection.from);
    const hasTo = byId.has(connection.to);

    if (hasFrom && hasTo) {
      const existing = editor.getShape(arrowId);
      if (!existing) {
        arrowsToCreate.push(connection);
      } else {
        const bindings = editor.getBindingsFromShape(existing, "arrow");
        const hasStart = bindings.some((b) => (b.props as any).terminal === "start");
        const hasEnd = bindings.some((b) => (b.props as any).terminal === "end");
        if (!hasStart || !hasEnd) {
          arrowsToDelete.push(arrowId);
          arrowsToCreate.push(connection);
        }
      }
    } else {
      if (editor.getShape(arrowId)) {
        arrowsToDelete.push(arrowId);
      }
    }
  }

  if (arrowsToDelete.length) {
    editor.deleteShapes(arrowsToDelete);
  }

  if (arrowsToCreate.length) {
    const arrowIds: TLShapeId[] = [];
    const bindings: Array<{
      type: "arrow";
      fromId: TLShapeId;
      toId: TLShapeId;
      props: TLArrowBinding["props"];
    }> = [];

    for (const connection of arrowsToCreate) {
      const from = byId.get(connection.from)!;
      const to = byId.get(connection.to)!;
      const fromId = createShapeId(connection.from);
      const toId = createShapeId(connection.to);
      const arrowId = createShapeId(connection.id);
      const start = anchorPoint(from, connection.fromAnchor);
      const end = anchorPoint(to, connection.toAnchor);
      arrowIds.push(arrowId);

      const arrowheadEnd = (["arrow", "triangle", "dot", "diamond", "bar"].includes(connection.arrowhead ?? "")
        ? connection.arrowhead
        : "arrow") as any;

      const connColor = (connection.color && tldrawColor[connection.color]) ? tldrawColor[connection.color] : "light-blue";

      const spanDist = Math.hypot(end.x - start.x, end.y - start.y);
      const rawConnLabel = (connection.label || "").trim();
      let arrowLabel = "";
      if (spanDist >= 85 && rawConnLabel) {
        // Pick concise single action word if full label is too long for the physical span
        const candidate = (spanDist < 140 && rawConnLabel.includes(" "))
          ? rawConnLabel.split(/\s+/)[0]
          : (rawConnLabel.length > 16 ? rawConnLabel.split(/\s+/)[0] : rawConnLabel);

        // Only place text on the arrow line if the physical span is wide enough to avoid vertical character wrapping
        if (candidate.length * 8.5 <= spanDist - 25) {
          arrowLabel = candidate;
        }
      }

      try {
        editor.createShape({
          id: arrowId,
          type: "arrow",
          x: start.x,
          y: start.y,
          props: {
            kind: connection.route === "elbow" ? "elbow" : "arc",
            start: { x: 0, y: 0 },
            end: { x: end.x - start.x, y: end.y - start.y },
            bend: connection.route === "straight" ? 0 : connection.bend,
            color: connColor,
            size: "s",
            dash: connection.route === "curve" ? "draw" : "solid",
            fill: "none",
            arrowheadStart: "none",
            arrowheadEnd,
            richText: toRichText(arrowLabel),
            labelColor: connColor,
            font: "sans",
          },
          meta: {
            chalkieConnection: connection.id,
            label: connection.label || "",
            from: from.label || connection.from,
            to: to.label || connection.to,
            connectionType: (connection as any).type || connection.route || "flow",
          },
        });
        bindings.push(
          { type: "arrow", fromId: arrowId, toId: fromId, props: { terminal: "start", normalizedAnchor: safeAnchorNorm(connection.fromAnchor), isPrecise: true, isExact: false, snap: "none" } },
          { type: "arrow", fromId: arrowId, toId: toId, props: { terminal: "end", normalizedAnchor: safeAnchorNorm(connection.toAnchor), isPrecise: true, isExact: false, snap: "none" } },
        );
      } catch (err) {
        console.warn("[chalkie] arrow creation notice", err);
      }
    }

    if (bindings.length) {
      try {
        editor.createBindings(bindings);
      } catch (err) {
        console.warn("[chalkie] arrow binding notice", err);
      }
    }
  }

  const environments = visibleObjects
    .filter((object) => BACKDROP_ROLES.has(object.role) || object.shapeType === "frame")
    .map((object) => createShapeId(object.id))
    .filter((id) => editor.getShape(id));
  if (environments.length) editor.sendToBack(environments);

  // Clear any shape selection so no blue bounding boxes or resize handles obstruct presentation
  try {
    editor.selectNone();
  } catch {}
}

interface PresenterCursorState {
  visible: boolean;
  targetBox?: { x: number; y: number; w: number; h: number } | null;
  hoverX?: number;
  hoverY?: number;
}

function frameCanvasScene(editor: Editor, duration = 420) {
  const shapes = editor.getCurrentPageShapes();
  if (!shapes.length) return;
  const bounds = editor.getCurrentPageBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    editor.zoomToFit({ animation: { duration } });
    return;
  }
  const vp = editor.getViewportScreenBounds();
  const pad = 56;
  const scaleX = (vp.width - pad) / bounds.width;
  const scaleY = (vp.height - pad) / bounds.height;
  // Frame comfortably: allow scaling down to 0.48 so all nodes fit with generous margins
  const targetZoom = Math.min(1.02, Math.max(0.48, Math.min(scaleX, scaleY)));
  editor.setCamera({
    x: vp.width / 2 - bounds.midX * targetZoom,
    y: vp.height / 2 - bounds.midY * targetZoom,
    z: targetZoom,
  }, { animation: { duration } });
}

function computeVisibleShapeIds(
  lesson: LessonPlan,
  activeStep: number,
  isPresenting: boolean
): Set<string> | undefined {
  if (!isPresenting) return undefined;

  const rawTargets = new Set(
    lesson.segments.slice(0, activeStep + 1).flatMap((segment) => segment.targetIds || [])
  );

  const visible = new Set(rawTargets);

  // If a child is visible, ensure its parent container/frame is visible so children are not orphaned
  for (const obj of lesson.objects) {
    if (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame") {
      const hasVisibleChild = lesson.objects.some((child) => {
        if (!visible.has(child.id)) return false;
        const isInside =
          child.x >= obj.x - 30 &&
          child.x + child.width <= obj.x + obj.width + 30 &&
          child.y >= obj.y - 30 &&
          child.y + child.height <= obj.y + obj.height + 30;
        const isNamed =
          child.id.toLowerCase().includes(obj.id.toLowerCase()) ||
          (obj.id.includes("layer") && (child.id.includes("neuron") || child.id.includes("node")));
        return isInside || isNamed;
      });

      if (hasVisibleChild) {
        visible.add(obj.id);
      }
    }
  }

  // If a container itself is targeted, also reveal its internal components
  for (const obj of lesson.objects) {
    if (rawTargets.has(obj.id) && (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame")) {
      for (const child of lesson.objects) {
        const isInside =
          child.x >= obj.x - 20 &&
          child.x + child.width <= obj.x + obj.width + 20 &&
          child.y >= obj.y - 20 &&
          child.y + child.height <= obj.y + obj.height + 20;
        const isNamed = child.id.toLowerCase().includes(obj.id.toLowerCase());
        if (isInside || isNamed) {
          visible.add(child.id);
        }
      }
    }
  }

  return visible;
}

export function ChalkCanvas({
  lesson,
  activeSegment,
  activeStep,
  isPresenting,
  isSpeaking = false,
  activeTargetId = null,
}: {
  lesson?: LessonPlan | null;
  activeSegment?: LessonSegment | null;
  activeStep: number;
  isPresenting: boolean;
  isSpeaking?: boolean;
  activeTargetId?: string | null;
}) {
  const editorRef = useRef<Editor | null>(null);
  const lessonIdRef = useRef<string | null>(null);
  const [cursor, setCursor] = useState<PresenterCursorState>({ visible: false });
  const [laidOutLesson, setLaidOutLesson] = useState<LessonPlan | null>(null);
  const [hoveredArrow, setHoveredArrow] = useState<{
    x: number;
    y: number;
    label: string;
    from: string;
    to: string;
    type?: string;
  } | null>(null);

  // Apply universal ELK.js hierarchical layout whenever lesson plan is loaded
  useEffect(() => {
    if (!lesson || !lesson.objects.length) {
      setLaidOutLesson(null);
      return;
    }

    // Immediately clear stale laid-out lesson from any previous topic so it never leaks
    setLaidOutLesson((prev) => (prev && prev.id === lesson.id ? prev : null));

    let active = true;
    applyElkLayout(lesson).then((res) => {
      if (active) setLaidOutLesson(res);
    }).catch((err) => {
      console.warn("[chalkie] ELK layout fallback", err);
      if (active) setLaidOutLesson(lesson);
    });

    return () => { active = false; };
  }, [lesson]);

  const effectiveLesson = (laidOutLesson && laidOutLesson.id === lesson?.id) ? laidOutLesson : lesson;

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    try {
      editor.user.updateUserPreferences({ colorScheme: "dark" });
    } catch {}
    if (effectiveLesson && effectiveLesson.objects.length > 0) {
      const visibleIds = computeVisibleShapeIds(effectiveLesson, activeStep, isPresenting);
      syncScene(editor, effectiveLesson, visibleIds, true);
      lessonIdRef.current = effectiveLesson.id;
    }
    window.setTimeout(() => {
      frameCanvasScene(editor, 400);
    }, 100);
  }, [activeStep, isPresenting, effectiveLesson]);

  // Synchronize whiteboard shapes on lesson, layout, or step changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !effectiveLesson || !effectiveLesson.objects.length) return;
    const visibleIds = computeVisibleShapeIds(effectiveLesson, activeStep, isPresenting);
    const reset = lessonIdRef.current !== effectiveLesson.id;
    syncScene(editor, effectiveLesson, visibleIds, reset);
    lessonIdRef.current = effectiveLesson.id;
    if (reset) {
      window.setTimeout(() => {
        frameCanvasScene(editor, 500);
      }, 60);
    }
  }, [activeStep, isPresenting, effectiveLesson]);

  // Interactive Arrow Hover Detection: inspect arrow under pointer with generous margin
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const editor = editorRef.current;
    if (!editor) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pagePoint = editor.screenToPage({ x: screenX, y: screenY });

    const arrowShape = editor.getShapeAtPoint(pagePoint, {
      margin: 16,
      hitInside: true,
      filter: (s) => s.type === "arrow",
    });

    if (arrowShape) {
      const meta = (arrowShape.meta as any) || {};
      if (meta.chalkieConnection || meta.label || meta.from) {
        setHoveredArrow({
          x: screenX,
          y: screenY,
          label: meta.label || "Connection Flow",
          from: meta.from || "Source",
          to: meta.to || "Target",
          type: meta.connectionType,
        });
        return;
      }
    }
    setHoveredArrow(null);
  }, []);

  // Camera framing and shape micro-animations during active teaching segment
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeSegment?.targetIds.length) return;
    const ids = activeSegment.targetIds.map((id) => createShapeId(id)).filter((id) => editor.getShape(id));
    if (!ids.length) return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const baseTransforms = new Map<TLShapeId, { id: TLShapeId; type: string; x: number; y: number; rotation: number; opacity: number }>();

    // Snapshot canonical base state before triggering micro-animations
    for (const id of ids) {
      const shape = editor.getShape(id);
      if (shape) {
        baseTransforms.set(id, {
          id,
          type: shape.type,
          x: shape.x,
          y: shape.y,
          rotation: shape.rotation ?? 0,
          opacity: shape.opacity ?? 1,
        });
      }
    }

    const bounds = ids.map((id) => editor.getShapePageBounds(id)).filter(Boolean);
    if (bounds.length) {
      const left = Math.min(...bounds.map((box) => box!.minX));
      const top = Math.min(...bounds.map((box) => box!.minY));
      const right = Math.max(...bounds.map((box) => box!.maxX));
      const bottom = Math.max(...bounds.map((box) => box!.maxY));
      const vp = editor.getViewportScreenBounds();
      const sceneBounds = editor.getCurrentPageBounds();
      const overviewZoom = sceneBounds
        ? Math.min(
            Math.max(0.48, (vp.width - 120) / Math.max(sceneBounds.width, 100)),
            Math.max(0.48, (vp.height - 120) / Math.max(sceneBounds.height, 100)),
            0.78
          )
        : 0.65;

      const targetW = Math.max(right - left, 540);
      const targetH = Math.max(bottom - top, 380);
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;

      editor.zoomToBounds(
        { x: centerX - targetW / 2, y: centerY - targetH / 2, w: targetW, h: targetH },
        { animation: { duration: 420 }, inset: 64, targetZoom: Math.min(0.72, Math.max(overviewZoom, 0.58)) }
      );
    }

    ids.forEach((id, index) => {
      const timer = setTimeout(() => {
        const shape = editor.getShape(id);
        const base = baseTransforms.get(id);
        if (!shape || !base) return;

        // Never rotate or translate arrow shapes - arrows are bound to shapes and moving them disrupts bindings!
        if (shape.type === "arrow") {
          editor.animateShape({ id, type: shape.type, opacity: 0.35 }, { animation: { duration: 240 } });
          timers.push(setTimeout(() => editor.animateShape({ id, type: shape.type, opacity: base.opacity }, { animation: { duration: 320 } }), 280));
          return;
        }

        const reset = { id, type: shape.type, x: base.x, y: base.y, rotation: base.rotation, opacity: base.opacity };
        if (activeSegment.action === "rotate") {
          editor.animateShape({ ...reset, rotation: base.rotation + Math.PI / 2 }, { animation: { duration: 700 } });
          timers.push(setTimeout(() => editor.animateShape(reset, { animation: { duration: 420 } }), 760));
        } else if (["move", "flow", "orbit", "trace"].includes(activeSegment.action)) {
          const dx = activeSegment.action === "orbit" ? 18 : 14;
          const dy = activeSegment.action === "orbit" ? -12 : 0;
          editor.animateShape({ ...reset, x: base.x + dx, y: base.y + dy }, { animation: { duration: 420 } });
          timers.push(setTimeout(() => editor.animateShape(reset, { animation: { duration: 420 } }), 470));
        } else if (activeSegment.action === "pulse" || activeSegment.action === "focus") {
          editor.animateShape({ ...reset, opacity: 0.35 }, { animation: { duration: 240 } });
          timers.push(setTimeout(() => editor.animateShape(reset, { animation: { duration: 320 } }), 280));
        }
      }, index * 520);
      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
      // Guaranteed pristine restore: snap any in-flight animated shapes back to canonical layout state
      for (const [sId, base] of baseTransforms.entries()) {
        const cur = editor.getShape(sId);
        if (cur) {
          const isDistorted =
            Math.abs(cur.x - base.x) > 0.1 ||
            Math.abs(cur.y - base.y) > 0.1 ||
            Math.abs((cur.rotation ?? 0) - base.rotation) > 0.01 ||
            Math.abs((cur.opacity ?? 1) - base.opacity) > 0.01;
          if (isDistorted) {
            try {
              editor.updateShape({
                id: sId,
                type: cur.type as any,
                x: base.x,
                y: base.y,
                rotation: base.rotation,
                opacity: base.opacity,
              });
            } catch {}
          }
        }
      }
    };
  }, [activeSegment]);

  // Deep Audio & Voice-Synchronized Teacher Laser Pointer tracking
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isPresenting || !activeSegment || !activeSegment.targetIds.length) {
      setCursor((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const ids = activeSegment.targetIds.map((id) => createShapeId(id)).filter((id) => editor.getShape(id));
    if (!ids.length) {
      setCursor((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const duration = Math.max(activeSegment.durationMs || 3000, 1800);
    const startTime = performance.now();
    let animationFrameId: number;

    const updatePointer = () => {
      const now = performance.now();
      const elapsed = now - startTime;

      // Parse object ID and optional internal part index from activeTargetId (e.g. "central-solenoid#2")
      const [targetBaseId, partIdxStr] = (activeTargetId || "").split("#");
      const parsedPartIdx =
        partIdxStr !== undefined && !isNaN(parseInt(partIdxStr, 10)) ? parseInt(partIdxStr, 10) : -1;

      // 1. Determine the base object
      let currentObj = targetBaseId
        ? effectiveLesson?.objects.find((obj) => obj.id === targetBaseId) || null
        : null;

      // 2. Fallback to activeSegment targets if not resolved
      if (!currentObj) {
        if (ids.length > 1) {
          const progress = Math.min(0.99, Math.max(0, elapsed / duration));
          const index = Math.min(ids.length - 1, Math.floor(progress * ids.length));
          const fallbackShapeId = ids[index];
          currentObj =
            effectiveLesson?.objects.find((obj) => createShapeId(obj.id) === fallbackShapeId) || null;
        } else if (activeSegment.targetIds.length > 0) {
          currentObj =
            effectiveLesson?.objects.find((obj) => obj.id === activeSegment.targetIds[0]) || null;
        }
      }

      const currentShapeId = currentObj ? createShapeId(currentObj.id) : ids[0];
      const b0 = editor.getShapePageBounds(currentShapeId) || editor.getShapePageBounds(ids[0]);
      if (!b0 && !currentObj) return;

      let shapeBounds = b0 || {
        minX: currentObj?.x || 0,
        minY: currentObj?.y || 0,
        maxX: (currentObj?.x || 0) + (currentObj?.width || 100),
        maxY: (currentObj?.y || 0) + (currentObj?.height || 60),
        midX: (currentObj?.x || 0) + (currentObj?.width || 100) / 2,
        midY: (currentObj?.y || 0) + (currentObj?.height || 60) / 2,
        width: currentObj?.width || 100,
        height: currentObj?.height || 60,
      };

      if (parsedPartIdx >= 0 && currentObj?.parts?.[parsedPartIdx]) {
        const part = currentObj.parts[parsedPartIdx];
        const scaleX = shapeBounds.width / Math.max(1, currentObj.width);
        const scaleY = shapeBounds.height / Math.max(1, currentObj.height);
        const partMinX = shapeBounds.minX + part.x * scaleX;
        const partMinY = shapeBounds.minY + part.y * scaleY;
        const partMaxX = partMinX + part.width * scaleX;
        const partMaxY = partMinY + part.height * scaleY;
        shapeBounds = {
          minX: partMinX,
          minY: partMinY,
          maxX: partMaxX,
          maxY: partMaxY,
          midX: (partMinX + partMaxX) / 2,
          midY: (partMinY + partMaxY) / 2,
          width: partMaxX - partMinX,
          height: partMaxY - partMinY,
        };
      }

      const minVp = editor.pageToViewport({ x: shapeBounds.minX, y: shapeBounds.minY });
      const maxVp = editor.pageToViewport({ x: shapeBounds.maxX, y: shapeBounds.maxY });
      const targetBox = {
        x: minVp.x,
        y: minVp.y,
        w: maxVp.x - minVp.x,
        h: maxVp.y - minVp.y,
      };

      // Subtle breathing float for teacher laser pointer
      const hoverX = Math.cos(elapsed * 0.0025) * 5;
      const hoverY = Math.sin(elapsed * 0.003) * 4;

      setCursor({
        visible: true,
        targetBox,
        hoverX,
        hoverY,
      });

      animationFrameId = requestAnimationFrame(updatePointer);
    };

    animationFrameId = requestAnimationFrame(updatePointer);

    const unsubscribe = editor.store.listen(() => {
      updatePointer();
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
      unsubscribe();
    };
  }, [activeSegment, activeTargetId, isPresenting, effectiveLesson]);

  return (
    <div
      className={`tldraw-shell relative w-full h-full overflow-hidden ${isPresenting ? "is-presenting" : ""}`}
      aria-label="Interactive lesson whiteboard"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoveredArrow(null)}
    >
      <Tldraw
        shapeUtils={chalkShapeUtils}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        components={{ StylePanel: null }}
      />

      {/* Interactive Arrow Hover Tooltip Pill */}
      {hoveredArrow && (
        <div
          className="absolute pointer-events-none z-50 transition-transform duration-75 ease-out"
          style={{
            left: `${hoveredArrow.x}px`,
            top: `${hoveredArrow.y}px`,
            transform: "translate(16px, -50%)",
          }}
        >
          <div className="flex items-center gap-2.5 rounded-xl bg-[#121524]/95 px-3.5 py-2 text-xs backdrop-blur-md border border-cyan-400/40 shadow-[0_4px_24px_rgba(0,0,0,0.85),0_0_14px_rgba(6,182,212,0.3)] text-slate-200">
            <div className="flex items-center justify-center w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-400 font-bold text-[11px]">
              →
            </div>
            <div>
              <div className="font-semibold text-white tracking-wide text-xs">
                {hoveredArrow.label || "Connection Flow"}
              </div>
              <div className="text-[10px] text-cyan-300/80 font-mono flex items-center gap-1.5 mt-0.5">
                <span>{hoveredArrow.from}</span>
                <span className="text-slate-500">→</span>
                <span>{hoveredArrow.to}</span>
                {hoveredArrow.type && (
                  <span className="ml-1 px-1.5 py-0.2 rounded bg-slate-800/80 text-[9px] uppercase tracking-wider text-slate-400">
                    {hoveredArrow.type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Synchronized Live Teacher Presenter Cursor & Focus Box (Clean - no pills or text obstruction) */}
      {cursor.visible && cursor.targetBox && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
          {/* Luminous Active Component Focus Box */}
          <div
            className="absolute pointer-events-none rounded-2xl transition-all duration-300 ease-out bg-cyan-400/[0.06] ring-2 ring-cyan-400/80 shadow-[0_0_32px_rgba(6,182,212,0.35),inset_0_0_20px_rgba(6,182,212,0.08)]"
            style={{
              left: `${cursor.targetBox.x - 8}px`,
              top: `${cursor.targetBox.y - 8}px`,
              width: `${cursor.targetBox.w + 16}px`,
              height: `${cursor.targetBox.h + 16}px`,
            }}
          />

          {/* Sleek Presenter Laser Cursor (Mathematically locked directly to the active focus box) */}
          <div
            className="absolute pointer-events-none transition-all duration-300 ease-out"
            style={{
              left: `${cursor.targetBox.x + cursor.targetBox.w / 2}px`,
              top: `${cursor.targetBox.y + cursor.targetBox.h / 2}px`,
            }}
          >
            <div
              className="relative"
              style={{
                transform: `translate3d(${cursor.hoverX ?? 0}px, ${cursor.hoverY ?? 0}px, 0)`,
              }}
            >
              {/* Laser Beacon Pulse concentric with arrow tip at (0, 0) */}
              <div className="absolute -top-2 -left-2 w-4 h-4 pointer-events-none">
                <div className="w-4 h-4 rounded-full bg-rose-500 animate-ping opacity-60" />
                <div className="absolute top-1 left-1 w-2 h-2 rounded-full border border-white bg-rose-500 shadow-[0_0_14px_#f43f5e]" />
              </div>

              {/* Presenter Arrow Cursor with tip pointing directly at (0, 0) */}
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] filter"
                style={{ transform: "translate(-4px, -3px)" }}
              >
                <path
                  d="M4 3L11.5 21L14.8 13.8L22 10.5L4 3Z"
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
