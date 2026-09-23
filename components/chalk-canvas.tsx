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
import { applySpatialAutoLayout } from "@/lib/tldraw-spatial-layout";

const tldrawColor: Record<string, "black" | "grey" | "blue" | "light-blue" | "violet" | "orange" | "green" | "red" | "yellow"> = {
  ink: "black", slate: "grey", blue: "blue", cyan: "light-blue", violet: "violet", orange: "orange", green: "green", red: "red", yellow: "yellow", white: "grey", none: "grey",
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

  if (object.shapeType === "geo") {
    const geo = validGeoNames.has(object.geo ?? "") ? (object.geo as any) : "rectangle";
    return {
      id: shapeId,
      type: "geo",
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(60, object.width),
        h: Math.max(40, object.height),
        geo,
        color,
        fill: "semi",
        dash: "draw",
        size: "m",
        font: "sans",
        align: "middle",
        verticalAlign: "middle",
        richText: toRichText(object.label || ""),
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

    // Otherwise, render as a sleek chalk card / geo rectangle with proper width/height
    return {
      id: shapeId,
      type: "geo",
      x: object.x,
      y: object.y,
      props: {
        w: Math.max(140, object.width),
        h: Math.max(80, object.height),
        geo: "rectangle",
        color: tldrawColor[object.color || "blue"] ?? "blue",
        fill: "semi",
        dash: "draw",
        size: "m",
        font: "sans",
        align: "middle",
        verticalAlign: "middle",
        richText: toRichText(object.label || ""),
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

function syncScene(editor: Editor, rawLesson: LessonPlan, visibleIds?: Set<string>, reset = false) {
  if (reset) editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()));

  // Intercept LLM's generated JSON before rendering, applying spatial auto-layout with tldraw Editor API
  const lesson = applySpatialAutoLayout(editor, rawLesson);

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
    editor.updateShapes(existingToUpdate);
  }

  if (missingObjects.length) {
    editor.createShapes(missingObjects.map(objectShape));
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
          color: tldrawColor[connection.color] ?? "grey",
          size: "s",
          dash: connection.route === "curve" ? "draw" : "solid",
          fill: "none",
          arrowheadStart: "none",
          arrowheadEnd,
          richText: connection.label ? toRichText(connection.label) : toRichText(""),
          labelColor: "black",
          font: "sans",
        },
        meta: { chalkieConnection: connection.id },
      });
      bindings.push(
        { type: "arrow", fromId: arrowId, toId: fromId, props: { terminal: "start", normalizedAnchor: anchorValue[connection.fromAnchor], isPrecise: true, isExact: false, snap: "none" } },
        { type: "arrow", fromId: arrowId, toId: toId, props: { terminal: "end", normalizedAnchor: anchorValue[connection.toAnchor], isPrecise: true, isExact: false, snap: "none" } },
      );
    }

    if (bindings.length) editor.createBindings(bindings);
    if (arrowIds.length) editor.sendToBack(arrowIds);
  }

  const environments = visibleObjects
    .filter((object) => BACKDROP_ROLES.has(object.role) || object.shapeType === "frame")
    .map((object) => createShapeId(object.id))
    .filter((id) => editor.getShape(id));
  if (environments.length) editor.sendToBack(environments);
}

interface PresenterCursorState {
  visible: boolean;
  x: number;
  y: number;
  label?: string;
  action?: string;
  targetBox?: { x: number; y: number; w: number; h: number } | null;
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

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (lesson && lesson.objects.length > 0) {
      const visibleIds = isPresenting
        ? new Set(lesson.segments.slice(0, activeStep + 1).flatMap((segment) => segment.targetIds))
        : undefined;
      syncScene(editor, lesson, visibleIds, true);
      lessonIdRef.current = lesson.id;
    }
    window.setTimeout(() => {
      frameCanvasScene(editor, 400);
    }, 100);
  }, [activeStep, isPresenting, lesson]);

  // Synchronize whiteboard shapes on lesson or step changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !lesson || !lesson.objects.length) return;
    const visibleIds = isPresenting
      ? new Set(lesson.segments.slice(0, activeStep + 1).flatMap((segment) => segment.targetIds))
      : undefined;
    const reset = lessonIdRef.current !== lesson.id;
    syncScene(editor, lesson, visibleIds, reset);
    lessonIdRef.current = lesson.id;
    if (reset) {
      window.setTimeout(() => {
        frameCanvasScene(editor, 500);
      }, 60);
    }
  }, [activeStep, isPresenting, lesson]);

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

      const activeObj = lesson?.objects.find((obj) => createShapeId(obj.id) === currentShapeId);
      const label = activeObj?.label || activeSegment.action;
      const b0 = editor.getShapePageBounds(currentShapeId) || editor.getShapePageBounds(ids[0]);
      if (!b0) return;

      let pageX = b0.midX;
      let pageY = b0.midY;

      if (activeSegment.action === "trace" && ids.length >= 2) {
        const lastId = ids[ids.length - 1];
        const bLast = editor.getShapePageBounds(lastId) || b0;
        const rawT = Math.min(1, Math.max(0, elapsed / (duration * 0.88)));
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
        // Natural teacher pointing hover around the prominent feature
        const hoverX = Math.cos(elapsed * 0.0025) * 6;
        const hoverY = Math.sin(elapsed * 0.003) * 5;
        pageX = b0.maxX - 14 + hoverX;
        pageY = b0.minY + 16 + hoverY;
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
        label,
        action: activeSegment.action,
        targetBox,
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
  }, [activeSegment, activeTargetId, isPresenting, lesson]);

  return (
    <div className={`tldraw-shell relative w-full h-full overflow-hidden ${isPresenting ? "is-presenting" : ""}`} aria-label="Interactive lesson whiteboard">
      <Tldraw
        shapeUtils={chalkShapeUtils}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        components={{ StylePanel: null }}
      />

      {/* Synchronized Live Teacher Presenter Cursor & Spotlight Halo */}
      {cursor.visible && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
          {/* Target Spotlight Halo Frame */}
          {cursor.targetBox && (
            <div
              className="absolute pointer-events-none rounded-2xl transition-all duration-300 border-2 border-dashed border-blue-500/80 bg-blue-500/5 shadow-[0_0_32px_rgba(37,99,235,0.28)] ring-4 ring-blue-400/20"
              style={{
                left: `${cursor.targetBox.x - 8}px`,
                top: `${cursor.targetBox.y - 8}px`,
                width: `${cursor.targetBox.w + 16}px`,
                height: `${cursor.targetBox.h + 16}px`,
              }}
            >
              {/* Corner accents on the active target spotlight */}
              <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 border-blue-600" />
              <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 border-blue-600" />
              <div className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 border-blue-600" />
              <div className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 border-blue-600" />
            </div>
          )}

          {/* Teacher Presenter Stylus & Live Badge */}
          <div
            className="absolute pointer-events-none transition-transform duration-75 ease-out"
            style={{
              transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              willChange: "transform",
            }}
          >
            {/* Luminous Red Laser Core with Glowing Halo */}
            <div className="relative -translate-x-1/2 -translate-y-1/2">
              <div className="w-8 h-8 rounded-full bg-red-500/25 animate-ping absolute inset-0" />
              <div className="w-4 h-4 rounded-full bg-red-600 shadow-[0_0_20px_rgba(239,68,68,1)] border-2 border-white ring-2 ring-red-400 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
              </div>
            </div>

            {/* Chalkie Teacher Badge with Dynamic Equalizer */}
            <div className="absolute left-4 top-2.5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/95 text-white text-xs font-semibold shadow-2xl border border-white/20 backdrop-blur-md whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
              <span className="text-sm">👨‍🏫</span>
              <span className="text-amber-300 font-bold tracking-wide">Chalkie</span>
              {cursor.label && (
                <span className="max-w-[160px] truncate text-slate-100 font-medium pl-2 border-l border-slate-700">
                  {cursor.label}
                </span>
              )}
              {isSpeaking && (
                <span className="flex items-center gap-0.5 ml-1" title="Speaking">
                  <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1 h-4 bg-red-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1 h-2 bg-red-400 rounded-full animate-bounce" />
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
