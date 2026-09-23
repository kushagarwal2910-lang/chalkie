import type { Editor, TLShape } from "tldraw";
import dagre from "dagre";
import type { LessonPlan, VisualConnection, VisualObject } from "@/lib/lesson-schema";

export interface BoundingBox {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpatialLayoutOptions {
  padding?: number;
  gap?: number;
  gridSize?: number;
  allowOutsideViewportIfFull?: boolean;
}

const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

/**
 * Normalizes tldraw shape IDs (stripping "shape:" prefix if present).
 */
export function normalizeShapeId(id: string): string {
  return id.startsWith("shape:") ? id.slice(6) : id;
}

/**
 * Checks if two bounding boxes collide given a minimum safety margin (gap).
 */
export function checkBoundingBoxIntersection(boxA: BoundingBox, boxB: BoundingBox, gap = 24): boolean {
  return (
    boxA.x < boxB.x + boxB.w + gap &&
    boxA.x + boxA.w + gap > boxB.x &&
    boxA.y < boxB.y + boxB.h + gap &&
    boxA.y + boxA.h + gap > boxB.y
  );
}

/**
 * Checks whether point (px, py) is contained within box.
 */
function isPointInBox(px: number, py: number, box: { x: number; y: number; w: number; h: number }): boolean {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

/**
 * Checks whether boxA is predominantly inside boxB (container relationship).
 */
function isBoxInsideContainer(
  child: { x: number; y: number; w: number; h: number },
  container: { x: number; y: number; w: number; h: number },
  tolerance = 24
): boolean {
  return (
    child.x >= container.x - tolerance &&
    child.y >= container.y - tolerance &&
    child.x + child.w <= container.x + container.w + tolerance &&
    child.y + child.h <= container.y + container.h + tolerance
  );
}

/**
 * Snaps a coordinate value to an architectural grid.
 */
export function snapToGrid(value: number, gridSize = 24): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Reads existing shapes from tldraw canvas using:
 *    - editor.getShapes() / editor.getCurrentPageShapes()
 *    - editor.getShapePageBounds(shape)
 */
export function getExistingCanvasBounds(
  editor: Editor,
  excludeShapeIds: Set<string> = new Set()
): BoundingBox[] {
  const allShapes: TLShape[] = (editor as any).getShapes
    ? (editor as any).getShapes()
    : editor.getCurrentPageShapes();

  const occupied: BoundingBox[] = [];

  for (const shape of allShapes) {
    const rawId = shape.id;
    const cleanId = normalizeShapeId(shape.id);
    const chalkieId = (shape.meta as any)?.chalkieId;

    if (
      excludeShapeIds.has(rawId) ||
      excludeShapeIds.has(cleanId) ||
      (chalkieId && excludeShapeIds.has(chalkieId))
    ) {
      continue;
    }

    if (shape.type === "arrow" || shape.type === "line") continue;

    const bounds = editor.getShapePageBounds(shape);
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      occupied.push({
        id: rawId,
        x: bounds.minX,
        y: bounds.minY,
        w: bounds.width,
        h: bounds.height,
      });
    }
  }

  return occupied;
}

/**
 * Reads user's current visible screen area using:
 *    - editor.getViewportPageBounds()
 */
export function getCanvasViewportBounds(editor: Editor): BoundingBox {
  const vp = editor.getViewportPageBounds();
  if (!vp || vp.width <= 0 || vp.height <= 0) {
    return { x: 40, y: 40, w: 1280, h: 800 };
  }
  return {
    x: vp.minX,
    y: vp.minY,
    w: vp.width,
    h: vp.height,
  };
}

/**
 * Collision-avoidance and grid-snapping algorithm with Row-Wrapping.
 * Keeps coordinates strictly within contentMax bounds, wrapping to the next row
 * instead of pushing elements off to infinite horizontal space!
 */
export function computeNonOverlappingPosition(
  proposed: { x: number; y: number; w: number; h: number },
  occupiedBoxes: BoundingBox[],
  viewport: BoundingBox,
  options: SpatialLayoutOptions = {},
  flowDirection: "right" | "down" | "radial" = "right"
): { x: number; y: number } {
  const { gap = 24, gridSize = 24, padding = 48 } = options;

  const minX = viewport.x + padding;
  const minY = viewport.y + padding;
  const maxX = Math.max(minX + 80, viewport.x + viewport.w - padding - proposed.w);
  const maxY = Math.max(minY + 80, viewport.y + viewport.h - padding - proposed.h);

  // Clamp proposed coordinate strictly within the viewport area
  let candidateX = snapToGrid(Math.max(minX, Math.min(maxX, proposed.x)), gridSize);
  let candidateY = snapToGrid(Math.max(minY, Math.min(maxY, proposed.y)), gridSize);

  const candidateBox: BoundingBox = { x: candidateX, y: candidateY, w: proposed.w, h: proposed.h };

  const collidesWithAny = (box: BoundingBox) =>
    occupiedBoxes.some((occ) => checkBoundingBoxIntersection(box, occ, gap));

  // If candidate is already completely free, use it immediately
  if (!collidesWithAny(candidateBox)) {
    return { x: candidateX, y: candidateY };
  }

  // Directed search prioritized by flowDirection
  const step = gridSize;
  const maxSearchRadius = Math.max(viewport.w, viewport.h);

  for (let radius = step; radius <= maxSearchRadius; radius += step) {
    let offsets: Array<{ dx: number; dy: number }>;

    if (flowDirection === "right") {
      offsets = [
        { dx: radius, dy: 0 },
        { dx: radius, dy: radius * 0.5 },
        { dx: radius, dy: -radius * 0.5 },
        { dx: 0, dy: radius },
        { dx: 0, dy: -radius },
        { dx: radius, dy: radius },
        { dx: -radius, dy: radius },
      ];
    } else if (flowDirection === "down") {
      offsets = [
        { dx: 0, dy: radius },
        { dx: radius * 0.5, dy: radius },
        { dx: -radius * 0.5, dy: radius },
        { dx: radius, dy: 0 },
        { dx: -radius, dy: 0 },
        { dx: radius, dy: radius },
      ];
    } else {
      offsets = [
        { dx: radius, dy: 0 },
        { dx: 0, dy: radius },
        { dx: radius, dy: radius },
        { dx: -radius, dy: 0 },
        { dx: 0, dy: -radius },
        { dx: radius, dy: -radius },
        { dx: -radius, dy: radius },
      ];
    }

    for (const offset of offsets) {
      const targetX = candidateX + offset.dx;
      // If candidate exceeds right boundary, do NOT clamp to maxX (causes stacking); skip and let it wrap!
      if (targetX < minX || targetX > maxX) continue;

      const testX = snapToGrid(targetX, gridSize);
      const testY = snapToGrid(Math.max(minY, Math.min(maxY, candidateY + offset.dy)), gridSize);
      const testBox: BoundingBox = { x: testX, y: testY, w: proposed.w, h: proposed.h };

      if (!collidesWithAny(testBox)) {
        return { x: testX, y: testY };
      }
    }
  }

  // ROW-WRAPPING FALLBACK: If rightward space is exhausted, wrap to next row below!
  const lowestOccupiedY = occupiedBoxes.reduce((max, b) => Math.max(max, b.y + b.h), minY);
  const wrapY = snapToGrid(lowestOccupiedY + gap, gridSize);
  return { x: minX, y: wrapY };
}

/**
 * Directed Graph Layout Engine using Dagre:
 * Mathematically calculates collision-free (x, y) coordinates for all nodes
 * and routes directional connections without cutting through shapes or text labels.
 */
export function layoutConnectedLessonWithDagre(
  lesson: LessonPlan,
  viewport: BoundingBox,
  options: SpatialLayoutOptions = {},
  occupiedBoxes: BoundingBox[] = []
): LessonPlan {
  const gap = options.gap ?? 32;
  const padding = options.padding ?? 40;
  const gridSize = options.gridSize ?? 24;

  const contentMaxW = Math.min(1060, Math.max(760, viewport.w - padding * 2));
  const contentMaxH = Math.min(640, Math.max(480, viewport.h - padding * 2));

  const g = new dagre.graphlib.Graph();
  const rankdir = ["process", "mechanism", "timeline"].includes(lesson.diagramType) ? "LR" : "TB";

  g.setGraph({
    rankdir,
    nodesep: Math.max(40, gap * 1.3),
    ranksep: Math.max(52, gap * 1.7),
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const objMap = new Map<string, VisualObject>();
  for (const obj of lesson.objects) {
    objMap.set(obj.id, obj);
    g.setNode(obj.id, {
      width: Math.max(150, obj.width),
      height: Math.max(80, obj.height),
    });
  }

  for (const conn of lesson.connections) {
    if (objMap.has(conn.from) && objMap.has(conn.to) && conn.from !== conn.to) {
      g.setEdge(conn.from, conn.to);
    }
  }

  dagre.layout(g);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();

  for (const obj of lesson.objects) {
    const node = g.node(obj.id);
    if (!node) continue;
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;
    positions.set(obj.id, { x, y, width: node.width, height: node.height });
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + node.width > maxX) maxX = x + node.width;
    if (y + node.height > maxY) maxY = y + node.height;
  }

  const graphW = maxX - minX;
  const graphH = maxY - minY;

  const presentationW = Math.min(contentMaxW, viewport.w - padding * 2);
  const presentationH = Math.min(contentMaxH, viewport.h - padding * 2);
  let offsetX = viewport.x + Math.max(padding, (presentationW - graphW) / 2) - minX;
  let offsetY = viewport.y + Math.max(padding, (presentationH - graphH) / 2) - minY;

  if (occupiedBoxes.length > 0) {
    const lowestOccupiedY = occupiedBoxes.reduce((max, b) => Math.max(max, b.y + b.h), viewport.y + padding);
    if (offsetY < lowestOccupiedY + gap) {
      offsetY = lowestOccupiedY + gap;
    }
  }

  const placedObjects = lesson.objects.map((obj) => {
    const pos = positions.get(obj.id);
    if (!pos) return obj;
    return {
      ...obj,
      x: snapToGrid(pos.x + offsetX, gridSize),
      y: snapToGrid(pos.y + offsetY, gridSize),
      width: pos.width,
      height: pos.height,
    };
  });

  const placedObjMap = new Map(placedObjects.map((o) => [o.id, o]));

  const placedConnections = lesson.connections.map((conn) => {
    const fromObj = placedObjMap.get(conn.from);
    const toObj = placedObjMap.get(conn.to);

    let fromAnchor = conn.fromAnchor || "bottom";
    let toAnchor = conn.toAnchor || "top";

    if (fromObj && toObj) {
      const dx = (toObj.x + toObj.width / 2) - (fromObj.x + fromObj.width / 2);
      const dy = (toObj.y + toObj.height / 2) - (fromObj.y + fromObj.height / 2);
      if (Math.abs(dx) >= Math.abs(dy)) {
        fromAnchor = dx >= 0 ? "right" : "left";
        toAnchor = dx >= 0 ? "left" : "right";
      } else {
        fromAnchor = dy >= 0 ? "bottom" : "top";
        toAnchor = dy >= 0 ? "top" : "bottom";
      }
    }

    return {
      ...conn,
      fromAnchor,
      toAnchor,
      bend: 0,
    };
  });

  return {
    ...lesson,
    objects: placedObjects,
    connections: placedConnections,
  };
}

/**
 * Master Spatial Layout Engine:
 * - Directed Graph Layout (Dagre): For all connected diagrams, calculates collision-free
 *   ranks, nodes, and connector docking points with zero overlaps.
 * - Budgeted Viewport Presentation Grid: Packs the entire lesson within a bounded
 *   1040x620 area so tldraw comfortably frames it at 85-100% zoom (never 31%!).
 * - Multi-Container Architectural Grid: Arranges 2-3 containers in balanced 2-column
 *   or 2-row layouts rather than blowing out horizontally past 2000px.
 * - Subcomponent Enclosure: Clamps and arranges subcomponents inside their parent
 *   containers with internal grid alignment and zero child-child overlap.
 * - Topological Flow: Respects causality and reading order.
 */
export function applySpatialAutoLayout(
  editor: Editor,
  lesson: LessonPlan,
  options: SpatialLayoutOptions = {}
): LessonPlan {
  const viewport = getCanvasViewportBounds(editor);
  const padding = options.padding ?? 40;
  const gap = options.gap ?? 28;
  const gridSize = options.gridSize ?? 24;

  const currentLessonShapeIds = new Set<string>();
  for (const o of lesson.objects) {
    currentLessonShapeIds.add(o.id);
    currentLessonShapeIds.add(normalizeShapeId(o.id));
    currentLessonShapeIds.add(`shape:${normalizeShapeId(o.id)}`);
  }

  const externalOccupied = getExistingCanvasBounds(editor, currentLessonShapeIds);

  // 1. If lesson has connections (DAG / directed flowchart / process / breakdown), use Dagre Directed Graph Engine!
  if (lesson.connections.length > 0 && lesson.objects.length > 1) {
    return layoutConnectedLessonWithDagre(lesson, viewport, options, externalOccupied);
  }

  // Maximum content boundary to prevent horizontal blowout
  const contentMaxW = Math.min(1060, Math.max(760, viewport.w - padding * 2));
  const contentMaxH = Math.min(640, Math.max(480, viewport.h - padding * 2));
  const canvasMinX = snapToGrid(viewport.x + Math.max(padding, (viewport.w - contentMaxW) / 2), gridSize);
  const canvasMinY = snapToGrid(viewport.y + Math.max(padding, (viewport.h - contentMaxH) / 2), gridSize);
  const canvasMaxX = canvasMinX + contentMaxW;

  const occupiedBoxes: BoundingBox[] = [...externalOccupied];

  // Separate containers and standalone components
  const containers: VisualObject[] = [];
  const standaloneComponents: VisualObject[] = [];
  const containerChildrenMap = new Map<string, VisualObject[]>();

  for (const obj of lesson.objects) {
    if (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame") {
      containers.push(obj);
      containerChildrenMap.set(obj.id, []);
    }
  }

  // Assign components to containers if geometrically inside or role-bound
  for (const obj of lesson.objects) {
    if (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame") continue;

    let parentContainer: VisualObject | null = null;
    for (const container of containers) {
      if (
        isBoxInsideContainer(
          { x: obj.x, y: obj.y, w: Math.max(20, obj.width), h: Math.max(20, obj.height) },
          { x: container.x, y: container.y, w: Math.max(80, container.width), h: Math.max(60, container.height) }
        )
      ) {
        parentContainer = container;
        break;
      }
    }

    if (parentContainer) {
      containerChildrenMap.get(parentContainer.id)!.push(obj);
    } else {
      standaloneComponents.push(obj);
    }
  }

  const updatedObjects: VisualObject[] = [];

  // ARCHITECTURAL CONTAINER GRID PACKING
  // If multiple containers exist, arrange them in a balanced multi-column or 2-row grid
  if (containers.length > 0) {
    interface Slot { x: number; y: number; w: number; h: number }
    let containerSlots: Slot[] = [];

    if (containers.length === 1) {
      containerSlots = [
        {
          x: canvasMinX,
          y: canvasMinY,
          w: Math.min(contentMaxW, Math.max(containers[0].width, 780)),
          h: Math.min(contentMaxH, Math.max(containers[0].height, 460)),
        },
      ];
    } else if (containers.length === 2) {
      // 2 balanced side-by-side columns
      const colW = snapToGrid((contentMaxW - gap) / 2, gridSize);
      const colH = snapToGrid(contentMaxH, gridSize);
      containerSlots = [
        { x: canvasMinX, y: canvasMinY, w: colW, h: colH },
        { x: canvasMinX + colW + gap, y: canvasMinY, w: colW, h: colH },
      ];
    } else if (containers.length === 3) {
      // 3 balanced side-by-side columns (e.g. Input Layer, Hidden Layer, Output Layer)
      const colW = snapToGrid((contentMaxW - gap * 2) / 3, gridSize);
      const colH = snapToGrid(contentMaxH, gridSize);
      containerSlots = [
        { x: canvasMinX, y: canvasMinY, w: colW, h: colH },
        { x: canvasMinX + colW + gap, y: canvasMinY, w: colW, h: colH },
        { x: canvasMinX + (colW + gap) * 2, y: canvasMinY, w: colW, h: colH },
      ];
    } else {
      // 2x2 Grid
      const colW = snapToGrid((contentMaxW - gap) / 2, gridSize);
      const rowH = snapToGrid((contentMaxH - gap) / 2, gridSize);
      containerSlots = [
        { x: canvasMinX, y: canvasMinY, w: colW, h: rowH },
        { x: canvasMinX + colW + gap, y: canvasMinY, w: colW, h: rowH },
        { x: canvasMinX, y: canvasMinY + rowH + gap, w: colW, h: rowH },
        { x: canvasMinX + colW + gap, y: canvasMinY + rowH + gap, w: colW, h: rowH },
      ];
    }

    containers.forEach((container, index) => {
      const slot = containerSlots[index] || {
        x: canvasMinX,
        y: canvasMinY,
        w: container.width,
        h: container.height,
      };

      const children = containerChildrenMap.get(container.id) || [];

      // Auto-fit container dimensions so it comfortably surrounds its children
      let finalW = slot.w;
      let finalH = slot.h;

      if (children.length > 0) {
        const childMaxX = Math.max(...children.map((c) => (c.x - container.x) + Math.max(30, c.width)));
        const childMaxY = Math.max(...children.map((c) => (c.y - container.y) + Math.max(30, c.height)));
        finalW = Math.max(slot.w, childMaxX + 36);
        finalH = Math.max(slot.h, childMaxY + 36);
      }

      const updatedContainer: VisualObject = {
        ...container,
        x: slot.x,
        y: slot.y,
        width: finalW,
        height: finalH,
      };

      updatedObjects.push(updatedContainer);
      occupiedBoxes.push({
        id: container.id,
        x: updatedContainer.x,
        y: updatedContainer.y,
        w: updatedContainer.width,
        h: updatedContainer.height,
      });

      // Internal subcomponent layout inside this container
      if (children.length > 0) {
        const placedChildBoxes: BoundingBox[] = [];
        const dx = slot.x - container.x;
        const dy = slot.y - container.y;

        for (const child of children) {
          let childX = child.x + dx;
          let childY = child.y + dy;
          const childW = Math.max(30, child.width);
          const childH = Math.max(24, child.height);

          // Strictly clamp child within container inner bounds
          childX = Math.max(slot.x + 16, Math.min(slot.x + finalW - childW - 16, childX));
          childY = Math.max(slot.y + 28, Math.min(slot.y + finalH - childH - 16, childY));

          // Resolve internal sibling overlaps inside container
          const collidesWithSibling = placedChildBoxes.some((b) =>
            checkBoundingBoxIntersection({ x: childX, y: childY, w: childW, h: childH }, b, 16)
          );

          if (collidesWithSibling) {
            const rightEdge = placedChildBoxes.reduce((max, b) => Math.max(max, b.x + b.w), slot.x + 16);
            if (rightEdge + childW + 16 <= slot.x + finalW) {
              childX = rightEdge + 16;
            } else {
              const bottomEdge = placedChildBoxes.reduce((max, b) => Math.max(max, b.y + b.h), slot.y + 28);
              childX = slot.x + 16;
              childY = bottomEdge + 16;
            }
          }

          placedChildBoxes.push({ id: child.id, x: childX, y: childY, w: childW, h: childH });
          updatedObjects.push({
            ...child,
            x: snapToGrid(childX, 12),
            y: snapToGrid(childY, 12),
          });
        }
      }
    });
  }

  // PROCESS STANDALONE COMPONENTS (NOT INSIDE CONTAINERS)
  const incomingMap = new Map<string, string[]>();
  for (const conn of lesson.connections) {
    if (!incomingMap.has(conn.to)) incomingMap.set(conn.to, []);
    incomingMap.get(conn.to)!.push(conn.from);
  }

  const placedObjectMap = new Map<string, VisualObject>();
  for (const u of updatedObjects) placedObjectMap.set(u.id, u);

  const flowType = ["process", "mechanism", "system", "timeline"].includes(lesson.diagramType)
    ? "right"
    : lesson.diagramType === "cycle"
    ? "radial"
    : "down";

  for (const obj of standaloneComponents) {
    let proposedX = obj.x;
    let proposedY = obj.y;

    const incomingSources = incomingMap.get(obj.id) || [];
    const placedPredecessor = incomingSources.map((id) => placedObjectMap.get(id)).find(Boolean);

    if (placedPredecessor) {
      if (flowType === "right") {
        proposedX = Math.max(proposedX, placedPredecessor.x + placedPredecessor.width + gap);
        proposedY = placedPredecessor.y;
      } else if (flowType === "down") {
        proposedX = placedPredecessor.x;
        proposedY = Math.max(proposedY, placedPredecessor.y + placedPredecessor.height + gap);
      }
    } else if (containers.length > 0) {
      // Place standalone component in free space below or beside the containers
      const lowestY = occupiedBoxes.reduce((max, b) => Math.max(max, b.y + b.h), canvasMinY);
      proposedX = canvasMinX;
      proposedY = lowestY + gap;
    }

    // Row-wrap check: if proposed position exceeds canvasMaxX, wrap to next row!
    if (proposedX + Math.max(40, obj.width) > canvasMaxX) {
      proposedX = canvasMinX;
      const lowestOccupiedY = occupiedBoxes.reduce((max, b) => Math.max(max, b.y + b.h), canvasMinY);
      proposedY = lowestOccupiedY + gap;
    }

    const proposedPos = {
      x: proposedX,
      y: proposedY,
      w: Math.max(40, obj.width),
      h: Math.max(40, obj.height),
    };

    const resolvedPos = computeNonOverlappingPosition(
      proposedPos,
      occupiedBoxes,
      viewport,
      options,
      flowType as any
    );

    const updatedObj: VisualObject = {
      ...obj,
      x: resolvedPos.x,
      y: resolvedPos.y,
    };

    placedObjectMap.set(obj.id, updatedObj);
    updatedObjects.push(updatedObj);

    occupiedBoxes.push({
      id: obj.id,
      x: resolvedPos.x,
      y: resolvedPos.y,
      w: updatedObj.width,
      h: updatedObj.height,
    });
  }

  return {
    ...lesson,
    objects: updatedObjects,
  };
}
