import type { FollowUpPlan, LessonPlan, LessonSegment, VisualConnection, VisualObject } from "@/lib/lesson-schema";
import { normalizeLessonLayout } from "@/lib/lesson-layout";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const safeId = (value: string, fallback: string) => value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || fallback;

export type FollowUpMerge = {
  lesson: LessonPlan;
  startIndex: number;
  newObjectIds: string[];
};

function uniqueId(base: string, used: Set<string>) {
  let result = base;
  let suffix = 2;
  while (used.has(result)) result = `${base.slice(0, 52)}-${suffix++}`;
  used.add(result);
  return result;
}

function extensionLayout(plan: FollowUpPlan, idMap: Map<string, string>, objects: VisualObject[]): LessonPlan {
  const internalConnections = plan.connections.flatMap((connection, index) => {
    const from = idMap.get(connection.from);
    const to = idMap.get(connection.to);
    if (!from || !to || from === to) return [];
    return [{ ...connection, id: `extension-${index + 1}`, from, to }];
  });
  const firstId = objects[0]?.id ?? "extension-subject";
  const placeholder: LessonSegment = {
    id: "extension-layout",
    title: "Visual extension",
    narration: "Visual extension",
    targetIds: [firstId],
    action: "reveal",
    durationMs: 1200,
  };
  return normalizeLessonLayout({
    id: "follow-up-layout",
    title: plan.title,
    question: plan.title,
    summary: plan.answer,
    diagramType: "system",
    visualStrategy: plan.visualStrategy,
    sources: [],
    objects,
    connections: internalConnections,
    segments: [placeholder, { ...placeholder, id: "extension-layout-2" }],
  });
}

function automaticAnchors(from: VisualObject, to: VisualObject) {
  const dx = (to.x + to.width / 2) - (from.x + from.width / 2);
  const dy = (to.y + to.height / 2) - (from.y + from.height / 2);
  return Math.abs(dx) >= Math.abs(dy)
    ? { fromAnchor: dx >= 0 ? "right" as const : "left" as const, toAnchor: dx >= 0 ? "left" as const : "right" as const }
    : { fromAnchor: dy >= 0 ? "bottom" as const : "top" as const, toAnchor: dy >= 0 ? "top" as const : "bottom" as const };
}

export function mergeFollowUpLesson(current: LessonPlan, plan: FollowUpPlan): FollowUpMerge {
  const startIndex = current.segments.length;
  const usedObjectIds = new Set(current.objects.map((object) => object.id));
  const room = Math.max(0, 72 - current.objects.length);
  const rawObjects = plan.coverage === "append" ? plan.objects.slice(0, room) : [];
  const prefix = `follow-${safeId(plan.id, String(startIndex + 1))}`;
  const idMap = new Map<string, string>();
  const preparedObjects = rawObjects.map((object, index) => {
    const id = uniqueId(safeId(`${prefix}-${safeId(object.id, `object-${index + 1}`)}`, `follow-object-${index + 1}`), usedObjectIds);
    idMap.set(object.id, id);
    return { ...object, id };
  });

  const normalized = preparedObjects.length ? extensionLayout(plan, idMap, preparedObjects) : null;
  const localObjects = normalized?.objects ?? [];
  const currentMaxX = current.objects.length ? Math.max(...current.objects.map((object) => object.x + object.width)) : 0;
  const currentMinY = current.objects.length ? Math.min(...current.objects.map((object) => object.y)) : 24;
  const extensionMinX = localObjects.length ? Math.min(...localObjects.map((object) => object.x)) : 24;
  const extensionMinY = localObjects.length ? Math.min(...localObjects.map((object) => object.y)) : 24;
  const xOffset = currentMaxX + 180 - extensionMinX;
  const yOffset = currentMinY - extensionMinY;
  const newObjects = localObjects.map((object) => ({ ...object, x: object.x + xOffset, y: object.y + yOffset }));
  const objectById = new Map([...current.objects, ...newObjects].map((object) => [object.id, object]));

  const usedConnectionIds = new Set(current.connections.map((connection) => connection.id));
  const internalConnections = (normalized?.connections ?? []).map((connection) => ({
    ...connection,
    id: uniqueId(`${prefix}-${safeId(connection.id, "link")}`, usedConnectionIds),
  }));
  const crossConnections: VisualConnection[] = plan.connections.flatMap((connection, index) => {
    const from = idMap.get(connection.from) ?? (usedObjectIds.has(connection.from) ? connection.from : undefined);
    const to = idMap.get(connection.to) ?? (usedObjectIds.has(connection.to) ? connection.to : undefined);
    if (!from || !to || from === to || (idMap.has(connection.from) && idMap.has(connection.to))) return [];
    const fromObject = objectById.get(from);
    const toObject = objectById.get(to);
    if (!fromObject || !toObject) return [];
    return [{
      ...connection,
      id: uniqueId(`${prefix}-bridge-${safeId(connection.id, String(index + 1))}`, usedConnectionIds),
      from,
      to,
      label: connection.label.replace(/[<>]/g, "").slice(0, 36),
      route: connection.route === "curve" ? "curve" as const : "elbow" as const,
      ...(connection.route === "curve" ? {} : automaticAnchors(fromObject, toObject)),
      bend: clamp(connection.bend, -160, 160),
    }];
  });

  const validIds = new Set(objectById.keys());
  const fallbackIds = plan.targetIds.map((id) => idMap.get(id) ?? id).filter((id) => validIds.has(id));
  const fallback = fallbackIds[0] ?? newObjects[0]?.id ?? current.objects[0]?.id;
  const usedSegmentIds = new Set(current.segments.map((segment) => segment.id));
  const newSegments = plan.segments.map((segment, index) => {
    const mapped = segment.targetIds.map((id) => idMap.get(id) ?? id).filter((id) => validIds.has(id));
    return {
      ...segment,
      id: uniqueId(`${prefix}-${safeId(segment.id, `step-${index + 1}`)}`, usedSegmentIds),
      title: segment.title.replace(/[<>]/g, "").slice(0, 80),
      narration: segment.narration.replace(/[<>]/g, "").slice(0, 700),
      targetIds: mapped.length ? [...new Set(mapped)] : fallback ? [fallback] : segment.targetIds,
      durationMs: clamp(segment.durationMs, 1200, 45000),
    };
  });

  return {
    startIndex,
    newObjectIds: newObjects.map((object) => object.id),
    lesson: {
      ...current,
      summary: `${current.summary}${current.summary ? " " : ""}Follow-up: ${plan.answer}`.slice(0, 1600),
      objects: [...current.objects, ...newObjects],
      connections: [...current.connections, ...internalConnections, ...crossConnections],
      segments: [...current.segments, ...newSegments],
    },
  };
}
