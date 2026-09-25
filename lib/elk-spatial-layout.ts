import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkEdgeSection, ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs/lib/elk-api";
import type { LessonPlan, VisualConnection, VisualObject } from "./lesson-schema";
import { BACKDROP_ROLES, normalizeLessonLayout } from "./lesson-layout.ts";
import { getVisualFootprint } from "./visual-footprint.ts";
import { connectorLabelTextWidth, wrapConnectorLabel } from "./connector-routing.ts";

const elk = new ELK();
const EDGE = 48;

type Box = { x: number; y: number; width: number; height: number };
export interface ElkLayoutOptions {
  direction?: "RIGHT" | "DOWN";
  nodeSpacing?: number;
  layerSpacing?: number;
  padding?: number;
}

export function doBoxesOverlap(a: Box, b: Box, gap = 16): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function isContainer(object: VisualObject) {
  return BACKDROP_ROLES.has(object.role) || object.shapeType === "frame";
}

/** Prefer explicit ownership; otherwise infer the smallest complete enclosure. */
function assignParents(objects: VisualObject[], originalObjects: VisualObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  // Minimum renderer dimensions may expand a card. Infer ownership from the
  // supplied scene before that expansion, then let ELK grow its enclosure.
  const geometry = new Map(objects.map((object, index) => [object.id, originalObjects[index] ?? object]));
  const parents = new Map<string, string>();
  for (const object of objects) {
    const explicit = object.parentId && byId.get(object.parentId);
    if (explicit && explicit.id !== object.id && isContainer(explicit)) {
      parents.set(object.id, explicit.id);
      continue;
    }
    const childBox = geometry.get(object.id)!;
    const candidates = objects.filter((candidate) => {
      const box = geometry.get(candidate.id)!;
      return candidate.id !== object.id && isContainer(candidate)
        && box.width * box.height > childBox.width * childBox.height
        && childBox.x >= box.x && childBox.y >= box.y
        && childBox.x + childBox.width <= box.x + box.width
        && childBox.y + childBox.height <= box.y + box.height
        && (childBox.x > box.x || childBox.y > box.y);
    });
    candidates.sort((a, b) => {
      const first = geometry.get(a.id)!;
      const second = geometry.get(b.id)!;
      return first.width * first.height - second.width * second.height || a.id.localeCompare(b.id);
    });
    if (candidates[0]) parents.set(object.id, candidates[0].id);
  }
  // Invalid explicit cycles must not make recursive graph construction hang.
  for (const object of objects) {
    const seen = new Set([object.id]);
    let parent = parents.get(object.id);
    while (parent) {
      if (seen.has(parent)) {
        parents.delete(object.id);
        break;
      }
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
  for (const object of objects) object.parentId = parents.get(object.id);
  return parents;
}

function sectionPoints(sections: ElkEdgeSection[] | undefined): ElkPoint[] {
  if (!sections?.length) return [];
  const ordered: ElkEdgeSection[] = [];
  const remaining = new Map(sections.map((section) => [section.id, section]));
  let section: ElkEdgeSection | undefined = sections.find((item) => !item.incomingSections?.length) ?? sections[0];
  while (section && remaining.has(section.id)) {
    ordered.push(section);
    remaining.delete(section.id);
    section = section.outgoingSections?.map((id) => remaining.get(id)).find(Boolean);
  }
  ordered.push(...remaining.values());
  const points: ElkPoint[] = [];
  for (const item of ordered) {
    for (const point of [item.startPoint, ...(item.bendPoints ?? []), item.endPoint]) {
      const last = points.at(-1);
      if (!last || last.x !== point.x || last.y !== point.y) points.push({ ...point });
    }
  }
  // Compound boundary ports can be rounded by ELK while interior ports retain
  // fractional coordinates. Preserve both ports and make the small skew an
  // explicit orthogonal dogleg instead of drawing a diagonal through a node.
  const orthogonal: ElkPoint[] = [];
  for (const point of points) {
    const previous = orthogonal.at(-1);
    if (previous && Math.abs(previous.x - point.x) > 0.001 && Math.abs(previous.y - point.y) > 0.001) {
      if (Math.abs(previous.x - point.x) >= Math.abs(previous.y - point.y)) {
        const x = (previous.x + point.x) / 2;
        orthogonal.push({ x, y: previous.y }, { x, y: point.y });
      } else {
        const y = (previous.y + point.y) / 2;
        orthogonal.push({ x: previous.x, y }, { x: point.x, y });
      }
    }
    orthogonal.push(point);
  }
  return orthogonal;
}

function portAt(point: ElkPoint, object: VisualObject) {
  return { x: Math.max(0, Math.min(1, (point.x - object.x) / object.width)), y: Math.max(0, Math.min(1, (point.y - object.y) / object.height)) };
}

function anchorAt(port: ElkPoint): VisualConnection["fromAnchor"] {
  const sides = [
    { anchor: "left" as const, distance: port.x },
    { anchor: "right" as const, distance: 1 - port.x },
    { anchor: "top" as const, distance: port.y },
    { anchor: "bottom" as const, distance: 1 - port.y },
  ];
  return sides.sort((a, b) => a.distance - b.distance)[0].anchor;
}

function labelWidth(label: string) {
  return Math.min(240, Math.max(76, connectorLabelTextWidth(label) + 20));
}

/**
 * Lay out readable, renderer-sized nodes and preserve ELK's obstacle-aware routes.
 * The whiteboard is infinite: zoom the camera to fit, never shrink shape geometry
 * after routing or replace orthogonal sections with a guessed one-bend curve.
 */
export async function applyElkLayout(rawPlan: LessonPlan, options: ElkLayoutOptions = {}): Promise<LessonPlan> {
  const plan = normalizeLessonLayout(rawPlan);
  if (!plan.objects.length) return plan;
  const parents = assignParents(plan.objects, rawPlan.objects);
  const direction = options.direction ?? (/\b(hierarchy|tree|classification|atmospher|strata|altitude|vertical|layers|stack)\b/i.test(`${plan.diagramType} ${plan.question} ${plan.visualStrategy}`) ? "DOWN" : "RIGHT");
  const nodeSpacing = Math.max(32, options.nodeSpacing ?? 48);
  const layerSpacing = Math.max(48, options.layerSpacing ?? 100);
  let rootId = "__chalkie_root";
  const usedIds = new Set([...plan.objects.map((object) => object.id), ...plan.connections.map((connection) => connection.id)]);
  while (usedIds.has(rootId)) rootId += "_";
  const buildNode = (object: VisualObject): ElkNode => {
    const children = plan.objects.filter((child) => parents.get(child.id) === object.id).map(buildNode);
    const { width, height } = getVisualFootprint(object);
    return {
      id: object.id,
      width,
      height,
      ...(children.length ? {
        children,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": direction,
          "elk.padding": "[top=64,left=32,bottom=32,right=32]",
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": `(${width},${height})`,
          "elk.spacing.nodeNode": String(nodeSpacing),
          "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
        },
      } : {}),
    };
  };
  const graph: ElkNode = {
    id: rootId,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": `[top=${options.padding ?? EDGE},left=${options.padding ?? EDGE},bottom=${options.padding ?? EDGE},right=${options.padding ?? EDGE}]`,
      "elk.spacing.nodeNode": String(nodeSpacing),
      "elk.spacing.edgeNode": "24",
      "elk.spacing.edgeEdge": "16",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.mergeEdges": "false",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "80",
    },
    children: plan.objects.filter((object) => !parents.has(object.id)).map(buildNode),
    edges: plan.connections.map((connection): ElkExtendedEdge => ({
      id: connection.id,
      sources: [connection.from],
      targets: [connection.to],
      ...(connection.label ? { labels: [{
        text: connection.label,
        width: labelWidth(connection.label),
        height: wrapConnectorLabel(connection.label, labelWidth(connection.label)).length * 17 + 12,
        layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
      }] } : {}),
    })),
  };

  const layout = await elk.layout(graph);
  const origins = new Map<string, ElkPoint>([[rootId, { x: 0, y: 0 }]]);
  const nodes = new Map<string, Box>();
  const edges = new Map<string, { edge: ElkExtendedEdge; owner: string }>();
  const visit = (node: ElkNode, origin: ElkPoint) => {
    for (const edge of node.edges ?? []) edges.set(edge.id, { edge, owner: node.id });
    for (const child of node.children ?? []) {
      const point = { x: origin.x + (child.x ?? 0), y: origin.y + (child.y ?? 0) };
      origins.set(child.id, point);
      nodes.set(child.id, { ...point, width: child.width ?? 0, height: child.height ?? 0 });
      visit(child, point);
    }
  };
  visit(layout, { x: 0, y: 0 });
  const objects = plan.objects.map((object) => ({ ...object, ...nodes.get(object.id) }));
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const connections = plan.connections.map((connection): VisualConnection => {
    const result = edges.get(connection.id);
    const edge = result?.edge;
    const origin = origins.get(edge?.container ?? result?.owner ?? rootId) ?? { x: 0, y: 0 };
    const points = sectionPoints(edge?.sections).map((point) => ({ x: point.x + origin.x, y: point.y + origin.y }));
    if (points.length < 2) throw new Error(`ELK returned no route for ${connection.id}`);
    const fromPort = portAt(points[0], objectById.get(connection.from)!);
    const toPort = portAt(points.at(-1)!, objectById.get(connection.to)!);
    const label = edge?.labels?.[0];
    return {
      ...connection,
      route: "elbow",
      bend: 0,
      points,
      fromPort,
      toPort,
      fromAnchor: anchorAt(fromPort),
      toAnchor: anchorAt(toPort),
      labelPosition: label && label.x !== undefined && label.y !== undefined ? {
        x: label.x + origin.x, y: label.y + origin.y, width: label.width ?? 0, height: label.height ?? 0,
      } : undefined,
    };
  });
  return { ...plan, objects, connections };
}
