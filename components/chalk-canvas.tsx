"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createShapeId,
  type Editor,
  type TLShapeId,
  type TLShapePartial,
  Tldraw,
} from "tldraw";
import type { LessonPlan, LessonSegment, VisualConnection, VisualObject } from "@/lib/lesson-schema";
import { CHALK_VISUAL_TYPE, chalkShapeUtils } from "@/components/chalk-visual-shape";
import { CUSTOM_CHART_TYPE, CUSTOM_SVG_TYPE, CUSTOM_TEMPLATE_TYPE } from "@/components/custom-shapes";
import { applyElkLayout } from "@/lib/elk-spatial-layout";
import { formatMathFormula } from "@/lib/math-formatter";
import type { CanvasPlaybackState } from "@/lib/playback-sync";
import { getProgressiveVisibleObjects } from "@/lib/progressive-scene";
import { getVisualFootprint } from "@/lib/visual-footprint";
import {
  CHALK_CONNECTOR_TYPE, CHALK_CONNECTOR_BINDING_TYPE,
  ChalkConnectorShapeUtil, ChalkConnectorBindingUtil, installChalkConnectorRouting,
} from "@/components/chalk-connector-shape";

const canvasShapeUtils = [...chalkShapeUtils, ChalkConnectorShapeUtil];
const canvasBindingUtils = [ChalkConnectorBindingUtil];

const anchorValue: Record<VisualConnection["fromAnchor"], { x: number; y: number }> = {
  top: { x: 0.5, y: 0 }, right: { x: 1, y: 0.5 }, bottom: { x: 0.5, y: 1 }, left: { x: 0, y: 0.5 }, center: { x: 0.5, y: 0.5 },
};

function objectShape(object: VisualObject): TLShapePartial {
  const shapeId = createShapeId(object.id);

  const { width: safeW, height: safeH } = getVisualFootprint(object);
  const safeLabel = formatMathFormula(object.label || "");
  const safeRole = typeof object.role === "string" && object.role ? object.role : "component";
  const meta = {
    chalkieId: object.id, role: safeRole, layoutParentId: object.parentId || "",
    layoutKey: JSON.stringify([object.x, object.y, safeW, safeH]),
  };
  const safePlacement = (["inside", "below", "above", "left", "right", "none"].includes(object.labelPlacement as any)
    ? object.labelPlacement
    : "below") as "inside" | "below" | "above" | "left" | "right" | "none";
  const safePartsJson = JSON.stringify(Array.isArray(object.parts) ? object.parts : []);

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
        w: safeW,
        h: safeH,
        templateType: safeType,
        title: rawProps.title || safeLabel || "",
        subtitle: rawProps.subtitle || "",
        themeColor: rawProps.themeColor || object.color || "blue",
        data: dataPayload,
      },
      meta,
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
        w: safeW,
        h: safeH,
        title: rawProps.title || safeLabel || "Statistical Chart",
        chartType,
        data: finalData,
        xAxisLabel: rawProps.xAxisLabel || "",
        yAxisLabel: rawProps.yAxisLabel || "",
        color: rawProps.color || object.color || "blue",
      },
      meta,
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
        w: safeW,
        h: safeH,
        title: rawProps.title || safeLabel || "",
        caption: rawProps.caption || "",
        svgString: typeof svgString === "string" ? svgString : "",
      },
      meta,
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
        w: safeW,
        h: safeH,
        label: safeLabel,
        labelPlacement: safePlacement,
        role: safeRole,
        partsJson: safePartsJson,
      },
      meta,
    } as TLShapePartial;
  }

  if (object.shapeType === "note") {
    // Formula cards need the same explicit footprint used by the layout engine;
    // native sticky notes impose a different, fixed minimum size.
    return {
      id: shapeId,
      type: CHALK_VISUAL_TYPE,
      x: object.x,
      y: object.y,
      props: {
        w: safeW,
        h: safeH,
        label: safeLabel,
        labelPlacement: "inside",
        role: safeRole,
        partsJson: safePartsJson,
      },
      meta,
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
        w: safeW,
        h: safeH,
        label: safeLabel,
        labelPlacement: "above",
        role: object.role === "environment" ? "environment" : "container",
        partsJson: safePartsJson,
      },
      meta,
    } as TLShapePartial;
  }

  // Default: custom chalk visual shape with SVG parts and chassis
  return {
    id: shapeId,
    type: CHALK_VISUAL_TYPE,
    x: object.x,
    y: object.y,
    props: {
      w: safeW,
      h: safeH,
      label: safeLabel,
      labelPlacement: safePlacement,
      role: safeRole,
      partsJson: safePartsJson,
    },
    meta,
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


function syncScene(
  editor: Editor,
  lesson: LessonPlan,
  activeStep: number,
  isPresenting: boolean,
  reset = false
) {
  if (reset) editor.deleteShapes(editor.getCurrentPageShapes()
    .filter((shape) => shape.meta.chalkieId || shape.meta.chalkieConnection)
    .map((shape) => shape.id));

  // 1. Progressively reveal objects synchronously with teaching narration
  const visibleObjects = getProgressiveVisibleObjects(lesson, activeStep, isPresenting);
  const currentShapeIds = Array.from(editor.getCurrentPageShapeIds());

  // Visible object IDs at current step:
  const visibleObjectShapeIds = new Set(visibleObjects.map((o) => createShapeId(o.id)));
  const validLessonShapeIds = new Set(lesson.objects.map((o) => createShapeId(o.id)));
  const validArrowShapeIds = new Set(lesson.connections.map((c) => createShapeId(c.id)));

  // Remove stale shapes from prior lessons, or shapes from future steps during presentation
  // NEVER delete user-drawn shapes (user shapes do not have chalkieId / chalkieConnection meta)
  const shapesToDelete: TLShapeId[] = [];
  for (const sId of currentShapeIds) {
    const shape = editor.getShape(sId);
    if (!shape) continue;
    const chalkieId = (shape.meta as any)?.chalkieId;
    if (chalkieId) {
      if (!validLessonShapeIds.has(sId) || (isPresenting && !visibleObjectShapeIds.has(sId))) {
        shapesToDelete.push(sId);
      }
    } else if (shape.meta?.chalkieConnection) {
      if (!validArrowShapeIds.has(sId)) {
        shapesToDelete.push(sId);
      }
    }
  }
  if (shapesToDelete.length) {
    editor.deleteShapes(shapesToDelete);
  }

  // 2. Add or update visible objects with corrected coordinates
  const missingObjects: VisualObject[] = [];
  const existingToUpdate: TLShapePartial[] = [];

  for (const object of visibleObjects) {
    let existingShape = editor.getShape(createShapeId(object.id));
    const newShape = objectShape(object);
    if (existingShape && existingShape.type !== newShape.type) {
      editor.deleteShapes([existingShape.id]);
      existingShape = undefined;
    }
    if (existingShape) {
      const layoutChanged = existingShape.meta.layoutKey !== newShape.meta?.layoutKey;
      const currentProps = existingShape.props as any;
      // Playback changes must not undo a user's drag or resize. New lesson layout
      // geometry is applied only when the planned footprint actually changes.
      const newProps = { ...newShape.props, ...(!layoutChanged ? { w: currentProps.w, h: currentProps.h } : {}) };
      if (layoutChanged || JSON.stringify(currentProps) !== JSON.stringify(newProps)) {
        existingToUpdate.push({
          id: existingShape.id,
          type: existingShape.type,
          ...(layoutChanged ? { x: object.x, y: object.y } : {}),
          props: newProps,
          meta: { ...existingShape.meta, ...newShape.meta },
        } as TLShapePartial);
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
          return {
            id: createShapeId(obj.id),
            type: CHALK_VISUAL_TYPE,
            x: obj.x,
            y: obj.y,
            props: {
              w: getVisualFootprint(obj).width,
              h: getVisualFootprint(obj).height,
              label: formatMathFormula(obj.label || ""),
              labelPlacement: "below" as const,
              role: obj.role || "component",
              partsJson: JSON.stringify(Array.isArray(obj.parts) ? obj.parts : []),
            },
            meta: { chalkieId: obj.id, role: obj.role || "component" },
          } as TLShapePartial;
        });
        editor.createShapes(fallbacks);
      } catch (fallbackErr) {
        console.error("[chalkie] fatal shape creation failure", fallbackErr);
      }
    }
  }

  // Preserve the route ELK planned, including bends, distinct ports and labels.
  // Only lesson-owned connectors are reconciled; user-drawn arrows are untouched.
  const byId = new Map(visibleObjects.map((object) => [object.id, object]));
  const connectorIds: TLShapeId[] = [];
  for (const connection of lesson.connections) {
    const id = createShapeId(connection.id);
    const from = byId.get(connection.from);
    const to = byId.get(connection.to);
    let existing = editor.getShape(id);
    if (!from || !to) {
      if (existing?.meta.chalkieConnection) editor.deleteShapes([id]);
      continue;
    }
    if (existing && existing.type !== CHALK_CONNECTOR_TYPE) {
      editor.deleteShapes([id]);
      existing = undefined;
    }
    const routeKey = JSON.stringify(connection);
    const points = connection.points || [anchorPoint(from, connection.fromAnchor), anchorPoint(to, connection.toAnchor)];
    const origin = points[0];
    const label = connection.labelPosition;
    const props = {
      points: points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })),
      color: connection.color || "cyan",
      label: connection.label || "",
      arrowhead: connection.arrowhead || "arrow",
      labelPosition: label ? { ...label, x: label.x - origin.x, y: label.y - origin.y } : undefined,
    };
    const meta = {
      chalkieConnection: connection.id, routeKey,
      label: connection.label || "", from: from.label || from.id, to: to.label || to.id,
      connectionType: connection.route || "flow",
    };
    if (!existing) {
      editor.createShape({ id, type: CHALK_CONNECTOR_TYPE, x: origin.x, y: origin.y, props, meta });
    } else if (existing.meta.routeKey !== routeKey) {
      editor.updateShape({ id, type: CHALK_CONNECTOR_TYPE, x: origin.x, y: origin.y, props, meta });
    }
    const bindings = editor.getBindingsFromShape(id, CHALK_CONNECTOR_BINDING_TYPE);
    const endpoints = [
      { terminal: "start" as const, object: from, anchor: connection.fromPort || safeAnchorNorm(connection.fromAnchor) },
      { terminal: "end" as const, object: to, anchor: connection.toPort || safeAnchorNorm(connection.toAnchor) },
    ];
    for (const endpoint of endpoints) {
      const binding = bindings.find((b) => b.props.terminal === endpoint.terminal);
      const toId = createShapeId(endpoint.object.id);
      const bindingProps = { terminal: endpoint.terminal, normalizedAnchor: endpoint.anchor };
      if (!binding) {
        editor.createBinding({ type: CHALK_CONNECTOR_BINDING_TYPE, fromId: id, toId, props: bindingProps });
      } else if (binding.toId !== toId || JSON.stringify(binding.props) !== JSON.stringify(bindingProps)) {
        editor.updateBinding({ id: binding.id, type: CHALK_CONNECTOR_BINDING_TYPE, toId, props: bindingProps });
      }
    }
    connectorIds.push(id);
  }
  if (connectorIds.length) editor.sendToBack(connectorIds);
  const environments = visibleObjects
    .filter((object) => BACKDROP_ROLES.has(object.role) || object.shapeType === "frame")
    .sort((a, b) => a.width * a.height - b.width * b.height)
    .map((object) => createShapeId(object.id))
    .filter((id) => editor.getShape(id));
  // Outer containers must sit behind their nested children, regardless of input order.
  for (const id of environments) editor.sendToBack([id]);

  // Clear any shape selection so no blue bounding boxes or resize handles obstruct presentation
  try {
    editor.selectNone();
  } catch {}
}

interface PresenterCursorState {
  visible: boolean;
  targetBox?: { x: number; y: number; w: number; h: number } | null;
}

function visibleCanvasViewport(editor: Editor, shell: HTMLDivElement | null) {
  if (!shell || shell.closest("[inert]")) return null;
  const rect = shell.getBoundingClientRect();
  const viewport = editor.getViewportScreenBounds();
  // tldraw clamps a hidden editor's measured dimensions to one pixel.
  if (rect.width <= 1 || rect.height <= 1 || viewport.width <= 1 || viewport.height <= 1) return null;
  return viewport;
}

function frameCanvasScene(editor: Editor, shell: HTMLDivElement | null, duration = 420) {
  const vp = visibleCanvasViewport(editor, shell);
  if (!vp) return false;
  const shapes = editor.getCurrentPageShapes();
  if (!shapes.length) return false;
  const bounds = editor.getCurrentPageBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    editor.zoomToFit({ animation: { duration } });
    return true;
  }
  const pad = Math.min(56, vp.width / 4, vp.height / 4);
  const scaleX = (vp.width - pad) / bounds.width;
  const scaleY = (vp.height - pad) / bounds.height;
  // Fit the camera to the infinite page instead of squeezing the diagram.
  const targetZoom = Math.min(1.02, Math.max(0.05, Math.min(scaleX, scaleY)));
  editor.setCamera({
    x: vp.width / (2 * targetZoom) - bounds.midX,
    y: vp.height / (2 * targetZoom) - bounds.midY,
    z: targetZoom,
  }, duration > 0 ? { animation: { duration } } : undefined);
  return true;
}

export function ChalkCanvas({
  lesson,
  activeSegment,
  activeStep,
  isPresenting,
  isSpeaking = false,
  activeTargetId = null,
  revealedStep = null,
  playbackRequest = 0,
  onPlaybackState,
}: {
  lesson?: LessonPlan | null;
  activeSegment?: LessonSegment | null;
  activeStep: number;
  isPresenting: boolean;
  isSpeaking?: boolean;
  activeTargetId?: string | null;
  revealedStep?: number | null;
  playbackRequest?: number;
  onPlaybackState?: (state: CanvasPlaybackState) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  // Genuine editor input opts out of whole-scene resize fitting. SDK camera
  // adjustments and workspace separators must not be mistaken for user input.
  const userCanvasInteractionRef = useRef(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [mountedEditor, setMountedEditor] = useState<Editor | null>(null);
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const lessonIdRef = useRef<string | null>(null);
  const [cursor, setCursor] = useState<PresenterCursorState>({ visible: false });
  const [laidOutLesson, setLaidOutLesson] = useState<{ input: LessonPlan; value: LessonPlan } | null>(null);
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
    setLayoutError(null);
    if (!lesson || !lesson.objects.length) {
      setLaidOutLesson(null);
      return;
    }

    // Immediately clear stale laid-out lesson from any previous topic so it never leaks
    setLaidOutLesson(null);

    let active = true;
    applyElkLayout(lesson).then((res) => {
      if (active) setLaidOutLesson({ input: lesson, value: res });
    }).catch((err) => {
      console.error("[chalkie] layout failed", err);
      if (active) setLayoutError("The diagram could not be arranged. Please generate the lesson again.");
    });

    return () => { active = false; };
  }, [lesson]);

  const effectiveLesson = laidOutLesson?.input === lesson ? laidOutLesson?.value : null;
  const isProgressive = revealedStep !== null;

  // The SDK removes its editor in production when its license check fails.
  // Observe that lifecycle instead of continuing to narrate against a stale Editor ref.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const checkLicense = () => setLicenseBlocked(!!shell.querySelector('[data-testid="tl-license-expired"]'));
    const observer = new MutationObserver(checkLicense);
    observer.observe(shell, { childList: true, subtree: true });
    checkLicense();
    return () => observer.disconnect();
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    const stopRouting = installChalkConnectorRouting(editor);
    editorRef.current = editor;
    setMountedEditor(editor);
    try {
      editor.user.updateUserPreferences({ colorScheme: "dark" });
    } catch {}
    return () => {
      stopRouting();
      editorRef.current = null;
      setMountedEditor(null);
      lessonIdRef.current = null;
      userCanvasInteractionRef.current = false;
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const editor = mountedEditor;
    if (!shell || !editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      clearTimeout(timer);
      const rect = shell.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1 || shell.closest("[inert]")) {
        // Native SDK shortcuts listen on the document while its instance is
        // focused. Clear that focus when the mobile tab makes this editor inert.
        if (editor.getIsFocused()) editor.blur();
        setHoveredArrow(null);
        setViewportSize((size) => size.width === 0 && size.height === 0 ? size : { width: 0, height: 0 });
        return;
      }
      // Wait until panel dragging settles. SDK screen bounds are throttled by
      // 200ms, so refresh them before fitting to avoid using the previous size.
      timer = setTimeout(() => {
        if (shell.closest("[inert]")) return;
        const currentRect = shell.getBoundingClientRect();
        if (currentRect.width <= 1 || currentRect.height <= 1) return;
        editor.updateViewportScreenBounds(editor.getContainer());
        const viewport = visibleCanvasViewport(editor, shell);
        if (!viewport) return;
        if (!editor.inputs.getIsPointing() && !userCanvasInteractionRef.current) {
          frameCanvasScene(editor, shell, 0);
        }
        setViewportSize((size) => size.width === viewport.width && size.height === viewport.height
          ? size : { width: viewport.width, height: viewport.height });
      }, 120);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    measure();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [mountedEditor]);

  // Synchronize whiteboard shapes on lesson, activeStep, or presentation mode changes
  useEffect(() => {
    onPlaybackState?.({ status: "loading", request: playbackRequest });
    if (layoutError) {
      onPlaybackState?.({ status: "error", request: playbackRequest, message: layoutError });
      return;
    }
    if (licenseBlocked) {
      onPlaybackState?.({ status: "error", request: playbackRequest, message: "The whiteboard needs a valid tldraw production license. Narration is paused until the canvas is available." });
      return;
    }
    const editor = mountedEditor;
    if (!editor || !effectiveLesson || !effectiveLesson.objects.length) return;
    const reset = lessonIdRef.current !== effectiveLesson.id;
    try {
      syncScene(editor, effectiveLesson, activeStep, isProgressive, reset);
      // Render the upcoming scene invisibly while speech buffers/queues. Reveal it
      // only on the voice's actual start event; previous steps stay on the board.
      const revealedIds = new Set(getProgressiveVisibleObjects(effectiveLesson, revealedStep ?? activeStep, isProgressive).map((object) => object.id));
      const opacityUpdates: TLShapePartial[] = [];
      for (const object of effectiveLesson.objects) {
        const shape = editor.getShape(createShapeId(object.id));
        if (shape) opacityUpdates.push({ id: shape.id, type: shape.type, opacity: revealedIds.has(object.id) ? 1 : 0 });
      }
      for (const connection of effectiveLesson.connections) {
        const shape = editor.getShape(createShapeId(connection.id));
        if (shape) opacityUpdates.push({ id: shape.id, type: shape.type, opacity: revealedIds.has(connection.from) && revealedIds.has(connection.to) ? 1 : 0 });
      }
      editor.updateShapes(opacityUpdates);
    } catch {
      onPlaybackState?.({ status: "error", request: playbackRequest, message: "The whiteboard could not prepare this step. Please reload and try again." });
      return;
    }
    lessonIdRef.current = effectiveLesson.id;
    if (reset) {
      userCanvasInteractionRef.current = false;
      if (shellRef.current && !shellRef.current.closest("[inert]")) {
        editor.updateViewportScreenBounds(editor.getContainer());
      }
      frameCanvasScene(editor, shellRef.current, 0);
    }
    // Store updates are synchronous, React shape rendering is not. Wait for a paint
    // before releasing narration, including after a slow dynamic import or ELK layout.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!shellRef.current?.querySelector(".tl-canvas")) return;
        const visible = getProgressiveVisibleObjects(effectiveLesson, activeStep, isProgressive);
        if (visible.some((object) => !editor.getShape(createShapeId(object.id)))) {
          onPlaybackState?.({ status: "error", request: playbackRequest, message: "Some lesson visuals could not be drawn. Please retry this lesson." });
          return;
        }
        onPlaybackState?.({ status: "ready", request: playbackRequest });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [effectiveLesson, activeStep, isProgressive, revealedStep, mountedEditor, licenseBlocked, layoutError, playbackRequest, onPlaybackState]);

  // Interactive Arrow Hover Detection: inspect arrow under pointer with generous margin
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const editor = editorRef.current;
    if (!editor) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY });

    const arrowShape = editor.getShapeAtPoint(pagePoint, {
      margin: 16,
      hitInside: true,
      filter: (s) => s.type === "arrow" || s.type === CHALK_CONNECTOR_TYPE,
    });

    if (arrowShape) {
      const meta = (arrowShape.meta as any) || {};
      if (meta.chalkieConnection || meta.label || meta.from) {
        setHoveredArrow((prev) => {
          if (
            prev &&
            prev.label === (meta.label || "Connection Flow") &&
            Math.abs(prev.x - screenX) < 12 &&
            Math.abs(prev.y - screenY) < 12
          ) {
            return prev;
          }
          return {
            x: screenX,
            y: screenY,
            label: meta.label || "Connection Flow",
            from: meta.from || "Source",
            to: meta.to || "Target",
            type: meta.connectionType,
          };
        });
        return;
      }
    }
    setHoveredArrow((prev) => (prev !== null ? null : prev));
  }, []);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const tooltip = tooltipRef.current;
    if (!hoveredArrow || !shell || !tooltip) return;
    const bounds = shell.getBoundingClientRect();
    const pill = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(hoveredArrow.x + 16, bounds.width - pill.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(hoveredArrow.y - pill.height / 2, bounds.height - pill.height - 8))}px`;
  }, [hoveredArrow, viewportSize]);

  // Resizing or revealing the panel can move the current teaching target outside
  // the viewport. Recheck its camera separately from shape animation/playback.
  useEffect(() => {
    const editor = mountedEditor;
    if (!editor || !isSpeaking || !activeSegment?.targetIds.length || editor.inputs.getIsPointing()) return;
    const vp = visibleCanvasViewport(editor, shellRef.current);
    if (!vp || viewportSize.width <= 1 || viewportSize.height <= 1) return;
    const bounds = activeSegment.targetIds
      .map((id) => editor.getShapePageBounds(createShapeId(id.split("#")[0])))
      .filter((box) => !!box);
    if (!bounds.length) return;
    const left = Math.min(...bounds.map((box) => box.minX));
    const top = Math.min(...bounds.map((box) => box.minY));
    const right = Math.max(...bounds.map((box) => box.maxX));
    const bottom = Math.max(...bounds.map((box) => box.maxY));
    const topLeftVp = editor.pageToViewport({ x: left, y: top });
    const bottomRightVp = editor.pageToViewport({ x: right, y: bottom });
    const inset = Math.min(64, vp.width / 8, vp.height / 8);
    const isComfortablyVisible = topLeftVp.x >= inset && topLeftVp.y >= inset &&
      bottomRightVp.x <= vp.width - inset && bottomRightVp.y <= vp.height - inset;
    if (isComfortablyVisible) return;
    const targetW = Math.max(right - left, 540);
    const targetH = Math.max(bottom - top, 380);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    editor.zoomToBounds(
      { x: centerX - targetW / 2, y: centerY - targetH / 2, w: targetW, h: targetH },
      { animation: { duration: 420 }, inset,
        targetZoom: Math.max(0.05, Math.min(0.72, (vp.width - inset * 2) / targetW, (vp.height - inset * 2) / targetH)) }
    );
  }, [activeSegment, effectiveLesson, isSpeaking, mountedEditor, viewportSize]);

  // Shape micro-animations during the active teaching segment. Panel resizes
  // deliberately do not restart these or change the narration readiness gate.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isSpeaking || !activeSegment?.targetIds.length) return;
    const ids = activeSegment.targetIds.map((id) => createShapeId(id.split("#")[0])).filter((id) => editor.getShape(id));
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

    ids.forEach((id, index) => {
      const timer = setTimeout(() => {
        const shape = editor.getShape(id);
        const base = baseTransforms.get(id);
        if (!shape || !base) return;

        // Emphasize without changing the collision-free footprint or arrow ports.
        // Motion inside a visual remains in its SVG; whole-node rotation can sweep
        // through neighboring nodes even when the resting layout is valid.
        if (base.opacity > 0) {
          editor.animateShape({ id, type: shape.type, opacity: 0.5 }, { animation: { duration: 240 } });
          timers.push(setTimeout(() => editor.animateShape({ id, type: shape.type, opacity: base.opacity }, { animation: { duration: 320 } }), 280));
        }
      }, index * 520);
      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
      for (const [sId, base] of baseTransforms.entries()) {
        const cur = editor.getShape(sId);
        if (cur && cur.opacity !== base.opacity) {
          editor.updateShape({ id: sId, type: cur.type, opacity: base.opacity });
        }
      }
    };
  }, [activeSegment, mountedEditor, effectiveLesson, isSpeaking]);
  // Deep Audio & Voice-Synchronized Teacher Laser Pointer tracking
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isPresenting || !isSpeaking || licenseBlocked || !activeSegment || !activeSegment.targetIds.length) {
      setCursor((prev) => (prev.visible ? { visible: false } : prev));
      return;
    }

    const ids = activeSegment.targetIds.map((id) => createShapeId(id.split("#")[0])).filter((id) => editor.getShape(id));
    if (!ids.length) {
      setCursor((prev) => (prev.visible ? { visible: false } : prev));
      return;
    }

    let rafId: number | null = null;

    const computePointerBox = () => {
      rafId = null;
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
        if (activeSegment.targetIds.length > 0) {
          currentObj =
            effectiveLesson?.objects.find((obj) => obj.id === activeSegment.targetIds[0].split("#")[0]) || null;
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

      setCursor((prev) => {
        if (
          prev.visible &&
          prev.targetBox &&
          Math.abs(prev.targetBox.x - targetBox.x) < 0.5 &&
          Math.abs(prev.targetBox.y - targetBox.y) < 0.5 &&
          Math.abs(prev.targetBox.w - targetBox.w) < 0.5 &&
          Math.abs(prev.targetBox.h - targetBox.h) < 0.5
        ) {
          return prev;
        }
        return {
          visible: true,
          targetBox,
        };
      });
    };

    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(computePointerBox);
    };

    scheduleUpdate();

    const unsubscribe = editor.store.listen(() => {
      scheduleUpdate();
    });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribe();
    };
  }, [activeSegment, activeTargetId, isPresenting, isSpeaking, effectiveLesson, mountedEditor, licenseBlocked]);

  return (
    <div
      ref={shellRef}
      className={`tldraw-shell relative w-full h-full overflow-hidden ${isPresenting ? "is-presenting" : ""}`}
      aria-label="Interactive lesson whiteboard"
      onPointerDownCapture={() => { userCanvasInteractionRef.current = true; }}
      onWheelCapture={() => { userCanvasInteractionRef.current = true; }}
      onKeyDownCapture={(event) => {
        if (event.key !== "Tab") userCanvasInteractionRef.current = true;
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoveredArrow(null)}
    >
      <Tldraw
        shapeUtils={canvasShapeUtils}
        bindingUtils={canvasBindingUtils}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />

      {licenseBlocked && (
        <div role="alert" className="absolute inset-0 z-40 grid place-items-center bg-[#0c0d12] p-8 text-center">
          <div className="max-w-sm space-y-3">
            <h2 className="text-lg font-semibold text-white">Whiteboard unavailable</h2>
            <p className="text-sm text-slate-300">This deployment needs a valid tldraw production license. Voice playback is paused so the explanation stays with its visuals.</p>
          </div>
        </div>
      )}

      {layoutError && !licenseBlocked && (
        <div role="alert" className="absolute inset-0 z-40 grid place-items-center bg-[#0c0d12] p-8 text-center text-sm text-slate-300">
          {layoutError}
        </div>
      )}

      {/* Interactive Arrow Hover Tooltip Pill */}
      {hoveredArrow && (
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-50 overflow-hidden"
          style={{
            left: 8,
            top: 8,
            width: "max-content",
            maxWidth: "min(320px, calc(100% - 16px))",
            maxHeight: "calc(100% - 16px)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-[#121524]/95 px-3.5 py-2 text-xs backdrop-blur-md border border-cyan-400/40 shadow-[0_4px_24px_rgba(0,0,0,0.85),0_0_14px_rgba(6,182,212,0.3)] text-slate-200">
            <div className="flex shrink-0 items-center justify-center w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-400 font-bold text-[11px]">
              →
            </div>
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <div className="font-semibold text-white tracking-wide text-xs">
                {hoveredArrow.label || "Connection Flow"}
              </div>
              <div className="text-[10px] text-cyan-300/80 font-mono flex flex-wrap items-center gap-1.5 mt-0.5">
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
            <div className="relative animate-laser-float">
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
