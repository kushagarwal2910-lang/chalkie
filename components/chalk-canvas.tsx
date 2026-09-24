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
        label: object.label || "",
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
          richText: toRichText(object.label || ""),
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
        label: object.label || "",
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

function anchorPoint(object: VisualObject, anchor: VisualConnection["fromAnchor"]) {
  const normalized = anchorValue[anchor];
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
      if (existingShape.x !== object.x || existingShape.y !== object.y) {
        existingToUpdate.push({
          id: existingShape.id,
          type: existingShape.type,
          x: object.x,
          y: object.y,
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
  const arrowsToDelete: TLShapeId[] = [];
  const arrowsToCreate: VisualConnection[] = [];
  const arrowsToUpdate: TLShapePartial[] = [];

  for (const connection of lesson.connections) {
    const arrowId = createShapeId(connection.id);
    const hasFrom = byId.has(connection.from);
    const hasTo = byId.has(connection.to);

    if (hasFrom && hasTo) {
      const existing = editor.getShape(arrowId);
      if (!existing) {
        arrowsToCreate.push(connection);
      } else {
        const from = byId.get(connection.from)!;
        const to = byId.get(connection.to)!;
        const start = anchorPoint(from, connection.fromAnchor);
        const end = anchorPoint(to, connection.toAnchor);
        const currentProps = existing.props as any;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (
          Math.abs(existing.x - start.x) > 1 ||
          Math.abs(existing.y - start.y) > 1 ||
          Math.abs((currentProps?.end?.x ?? 0) - dx) > 1 ||
          Math.abs((currentProps?.end?.y ?? 0) - dy) > 1
        ) {
          arrowsToUpdate.push({
            id: arrowId,
            type: "arrow",
            x: start.x,
            y: start.y,
            props: {
              ...currentProps,
              start: { x: 0, y: 0 },
              end: { x: dx, y: dy },
            },
          });
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

  if (arrowsToUpdate.length) {
    editor.updateShapes(arrowsToUpdate);
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
            color: (connection.color && tldrawColor[connection.color]) ? tldrawColor[connection.color] : "light-blue",
            size: "m",
            dash: connection.route === "curve" ? "draw" : "solid",
            fill: "none",
            arrowheadStart: "none",
            arrowheadEnd,
            richText: toRichText(""), // Clean arrow shaft! No printed text on or breaking arrow shafts
            labelColor: "black",
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
          { type: "arrow", fromId: arrowId, toId: fromId, props: { terminal: "start", normalizedAnchor: anchorValue[connection.fromAnchor], isPrecise: true, isExact: false, snap: "none" } },
          { type: "arrow", fromId: arrowId, toId: toId, props: { terminal: "end", normalizedAnchor: anchorValue[connection.toAnchor], isPrecise: true, isExact: false, snap: "none" } },
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
  x: number;
  y: number;
  label?: string;
  action?: string;
  targetBox?: { x: number; y: number; w: number; h: number } | null;
  isDrawing?: boolean;
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
  const pad = 64;
  const scaleX = (vp.width - pad) / bounds.width;
  const scaleY = (vp.height - pad) / bounds.height;
  // Frame comfortably: keep zoom between 0.72 and 1.05 so shapes and text are large and legible
  const targetZoom = Math.min(1.05, Math.max(0.72, Math.min(scaleX, scaleY)));
  editor.setCamera({
    x: vp.width / 2 - bounds.midX * targetZoom,
    y: vp.height / 2 - bounds.midY * targetZoom,
    z: targetZoom,
  }, { animation: { duration } });
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
  const [cursor, setCursor] = useState<PresenterCursorState>({ visible: false, x: 0, y: 0 });
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
      const visibleIds = isPresenting
        ? new Set(effectiveLesson.segments.slice(0, activeStep + 1).flatMap((segment) => segment.targetIds))
        : undefined;
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
    const visibleIds = isPresenting
      ? new Set(effectiveLesson.segments.slice(0, activeStep + 1).flatMap((segment) => segment.targetIds))
      : undefined;
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
    const bounds = ids.map((id) => editor.getShapePageBounds(id)).filter(Boolean);
    if (bounds.length) {
      const left = Math.min(...bounds.map((box) => box!.minX));
      const top = Math.min(...bounds.map((box) => box!.minY));
      const right = Math.max(...bounds.map((box) => box!.maxX));
      const bottom = Math.max(...bounds.map((box) => box!.maxY));
      editor.zoomToBounds(
        { x: left, y: top, w: Math.max(right - left, 140), h: Math.max(bottom - top, 90) },
        { animation: { duration: 420 }, inset: 120, targetZoom: 0.95 }
      );
    }

    ids.forEach((id, index) => {
      const timer = setTimeout(() => {
        const shape = editor.getShape(id);
        if (!shape) return;
        const reset = { id, type: shape.type, x: shape.x, y: shape.y, rotation: shape.rotation, opacity: shape.opacity };
        if (activeSegment.action === "rotate") {
          editor.animateShape({ ...reset, rotation: shape.rotation + Math.PI / 2 }, { animation: { duration: 700 } });
          timers.push(setTimeout(() => editor.animateShape(reset, { animation: { duration: 420 } }), 760));
        } else if (["move", "flow", "orbit", "trace"].includes(activeSegment.action)) {
          const dx = activeSegment.action === "orbit" ? 18 : 14;
          const dy = activeSegment.action === "orbit" ? -12 : 0;
          editor.animateShape({ ...reset, x: shape.x + dx, y: shape.y + dy }, { animation: { duration: 420 } });
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

      // Determine the CURRENT focused target shape:
      // Priority 1: explicitly passed activeTargetId from speech synthesis word boundary tracking
      // Priority 2: smoothly progress through activeSegment.targetIds proportionally over duration
      let currentShapeId = ids[0];
      if (activeTargetId && editor.getShape(createShapeId(activeTargetId))) {
        currentShapeId = createShapeId(activeTargetId);
      } else if (ids.length > 1) {
        const progress = Math.min(0.99, Math.max(0, elapsed / duration));
        const index = Math.min(ids.length - 1, Math.floor(progress * ids.length));
        currentShapeId = ids[index];
      }

      const activeObj = effectiveLesson?.objects.find((obj) => createShapeId(obj.id) === currentShapeId);
      const label = activeObj?.label || activeSegment.action;
      const b0 = editor.getShapePageBounds(currentShapeId) || editor.getShapePageBounds(ids[0]);
      if (!b0) return;

      let pageX = b0.midX;
      let pageY = b0.midY;

      const isDrawing = elapsed < 1400;
      let currentLabel = activeObj?.label || activeSegment.title || activeSegment.action;

      if (isDrawing) {
        const progress = Math.min(1, elapsed / 1400); // 0 to 1
        // Active Whiteboard Drawing: Laser traces the shape boundary on canvas!
        let tx = b0.minX;
        let ty = b0.minY;
        if (progress < 0.25) {
          const t = progress / 0.25;
          tx = b0.minX + (b0.maxX - b0.minX) * t;
          ty = b0.minY;
        } else if (progress < 0.5) {
          const t = (progress - 0.25) / 0.25;
          tx = b0.maxX;
          ty = b0.minY + (b0.maxY - b0.minY) * t;
        } else if (progress < 0.75) {
          const t = (progress - 0.5) / 0.25;
          tx = b0.maxX - (b0.maxX - b0.minX) * t;
          ty = b0.maxY;
        } else {
          const t = (progress - 0.75) / 0.25;
          tx = b0.minX;
          ty = b0.maxY - (b0.maxY - b0.minY) * t;
        }
        // Natural hand-drawn chalk jitter
        const sketchJitter = Math.sin(progress * 28) * 2.5;
        pageX = tx + sketchJitter;
        pageY = ty + sketchJitter;
        currentLabel = `Drawing ${activeObj?.label || "diagram"}`;
      } else {
        // Explaining & Pointing Phase: Laser glides into shape center and hovers
        if (activeSegment.action === "trace" && ids.length >= 2) {
          const lastId = ids[ids.length - 1];
          const bLast = editor.getShapePageBounds(lastId) || b0;
          const rawT = Math.min(1, Math.max(0, (elapsed - 1400) / (duration * 0.75)));
          const easeT = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
          pageX = b0.midX + (bLast.midX - b0.midX) * easeT;
          pageY = b0.midY + (bLast.midY - b0.midY) * easeT;
        } else if (activeSegment.action === "rotate" || activeSegment.action === "orbit") {
          const radius = Math.max(b0.width, b0.height) * 0.45 + 16;
          const angle = elapsed * 0.003;
          pageX = b0.midX + Math.cos(angle) * radius;
          pageY = b0.midY + Math.sin(angle) * radius;
        } else if (activeSegment.action === "move" || activeSegment.action === "flow") {
          const offset = Math.sin(elapsed * 0.004) * 18;
          pageX = b0.midX + offset;
          pageY = b0.midY;
        } else {
          // Natural teacher pointing hover around the center/feature
          const hoverX = Math.cos(elapsed * 0.0025) * 6;
          const hoverY = Math.sin(elapsed * 0.003) * 5;
          pageX = b0.midX + hoverX;
          pageY = b0.midY + hoverY;
        }
      }

      const screenPos = editor.pageToViewport({ x: pageX, y: pageY });
      const minVp = editor.pageToViewport({ x: b0.minX, y: b0.minY });
      const maxVp = editor.pageToViewport({ x: b0.maxX, y: b0.maxY });
      const targetBox = {
        x: minVp.x,
        y: minVp.y,
        w: maxVp.x - minVp.x,
        h: maxVp.y - minVp.y,
      };

      setCursor({
        visible: true,
        x: screenPos.x,
        y: screenPos.y,
        label: currentLabel,
        action: activeSegment.action,
        targetBox,
        isDrawing,
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

      {/* Synchronized Live Teacher Presenter Cursor & Spotlight Halo */}
      {cursor.visible && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
          {/* Subtle Ambient Target Spotlight (non-blocking) */}
          {cursor.targetBox && (
            <div
              className={`absolute pointer-events-none rounded-2xl transition-all duration-300 ${
                cursor.isDrawing
                  ? "bg-amber-400/[0.04] ring-1 ring-amber-400/30"
                  : "bg-blue-400/[0.03] ring-1 ring-blue-400/25 shadow-[0_0_24px_rgba(59,130,246,0.15)]"
              }`}
              style={{
                left: `${cursor.targetBox.x - 8}px`,
                top: `${cursor.targetBox.y - 8}px`,
                width: `${cursor.targetBox.w + 16}px`,
                height: `${cursor.targetBox.h + 16}px`,
              }}
            />
          )}

          {/* Sleek Presenter Laser Cursor (zero visual obstruction) */}
          <div
            className="absolute pointer-events-none transition-transform duration-75 ease-out"
            style={{
              transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              willChange: "transform",
            }}
          >
            <div className="relative">
              {/* Laser Beacon Pulse at the arrow tip (0, 0) */}
              <div className="absolute -top-1.5 -left-1.5 pointer-events-none">
                <div
                  className={`h-4 w-4 rounded-full animate-ping opacity-60 ${
                    cursor.isDrawing ? "bg-amber-400" : "bg-rose-500"
                  }`}
                />
                <div
                  className={`absolute top-1 left-1 h-2 w-2 rounded-full border border-white ${
                    cursor.isDrawing
                      ? "bg-amber-300 shadow-[0_0_12px_#fbbf24]"
                      : "bg-rose-500 shadow-[0_0_12px_#f43f5e]"
                  }`}
                />
              </div>

              {/* Presenter Arrow Cursor pointing directly at (0, 0) */}
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] filter"
                style={{ transform: "translate(0px, 0px)" }}
              >
                <path
                  d="M4 3L11.5 21L14.8 13.8L22 10.5L4 3Z"
                  fill={cursor.isDrawing ? "#f59e0b" : "#ef4444"}
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
