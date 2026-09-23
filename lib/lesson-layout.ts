import type { LessonPlan, VisualObject, VisualPart } from "@/lib/lesson-schema";

const CANVAS_WIDTH = 1160;
const CANVAS_HEIGHT = 700;
const GAP = 36;
const EDGE = 24;
const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

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

function normalizePartCoordinates(part: VisualPart, objX: number, objY: number, objW: number, objH: number): VisualPart {
  let { x, y, width, height, data } = part;
  if (objX > 0 && x >= objX && x <= objX + objW * 1.5) {
    x -= objX;
  }
  if (objY > 0 && y >= objY && y <= objY + objH * 1.5) {
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
    return { ...part, x, y, width: endX - x, height: endY - y, data: "", text, strokeWidth, opacity };
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
  else if (["radial", "coil", "wave", "particles", "orbit"].includes(part.type)) data = /^\s*\d+\s*$/.test(part.data) ? part.data.trim() : "";
  else if (part.type === "cluster" || part.type === "quarks") data = part.data.replace(/[<>]/g, "").trim().slice(0, 60);
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
  const rawAxes = parts.find((part) => part.type === "axes");
  const axes = rawAxes ? sanitizePart(normalizePartCoordinates(rawAxes, objectX, objectY, objectWidth, objectHeight), objectBounds) : null;
  const plotBounds = axes ? axisPlotBounds(axes, objectBounds) : objectBounds;
  const occupied: TextBox[] = [];

  return parts.map((rawPart) => {
    const part = normalizePartCoordinates(rawPart, objectX, objectY, objectWidth, objectHeight);
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

function resolveCollision(a: VisualObject, b: VisualObject, isConnected: boolean, gap = GAP) {
  if (isConnected) {
    // If a connects to b, b is downstream: push b to the right of a
    if (b.x >= a.x) {
      b.x = a.x + a.width + gap;
      // Align Y if close
      if (Math.abs(b.y - a.y) < 60) {
        b.y = a.y + (a.height - b.height) / 2;
      }
    } else {
      a.x = b.x + b.width + gap;
    }
    return;
  }

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

export function normalizeLessonLayout(plan: LessonPlan): LessonPlan {
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

    // Allow realistic aspect ratios for physical cutaways (e.g. thin oxide layers, tall cylinders/plugs)
    const minW = hasAxes ? 360 : isBackdrop ? 440 : 80;
    const maxW = isBackdrop ? 1080 : hasAxes ? 820 : 560;
    const minH = hasAxes ? 240 : isBackdrop ? 260 : 36;
    const maxH = isBackdrop ? 660 : hasAxes ? 520 : 480;

    const width = clamp(object.width, minW, maxW);
    const height = clamp(object.height, minH, maxH);

    return {
      ...object,
      id: objectId,
      label: object.label.replace(/[<>]/g, "").slice(0, 48),
      labelPlacement: hasAxes ? "none" as const : object.labelPlacement,
      width,
      height,
      x: clamp(object.x, EDGE, CANVAS_WIDTH - width - EDGE),
      y: clamp(object.y, EDGE, CANVAS_HEIGHT - height - EDGE),
      parts: sanitizeParts(object.parts, width, height, object.x, object.y),
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

  // Sort non-backdrops by their pedagogical introduction order
  nonBackdrops.sort((a, b) => {
    const orderA = pedagogicalOrder.get(a.id) ?? 999;
    const orderB = pedagogicalOrder.get(b.id) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.x - b.x;
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

    // Sort children by pedagogical order, then by original x
    children.sort((a, b) => {
      const orderA = pedagogicalOrder.get(a.id) ?? 999;
      const orderB = pedagogicalOrder.get(b.id) ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.x - b.x;
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
        // b is directly downstream of a — enforce left-to-right
        if (b.x < a.x + a.width + 48) {
          b.x = a.x + a.width + 60;
          b.y = a.y + (a.height - b.height) / 2;
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
          const isConnected = directConnections.has(`${a.id}->${b.id}`) || directConnections.has(`${b.id}->${a.id}`);
          resolveCollision(a, b, isConnected, 56);
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

  // 10. Handle free backdrops (no children) — just ensure they don't overlap other objects
  for (const backdrop of backdrops) {
    if (parentToChildren.has(backdrop.id)) continue;
    // Place behind all non-backdrops that are near it
    const nearChildren = nonBackdrops.filter((child) => {
      const cx = child.x + child.width / 2;
      const cy = child.y + child.height / 2;
      return cx >= backdrop.x - 80 && cx <= backdrop.x + backdrop.width + 80
          && cy >= backdrop.y - 80 && cy <= backdrop.y + backdrop.height + 80;
    });
    if (nearChildren.length > 0) {
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
  const allObjects = [...backdrops, ...nonBackdrops];
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
    const targetIds = [...new Set(segment.targetIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)))];
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

