import type { NetworkGraphData, NetworkGraphConnection, NetworkGraphNode } from '../components/canvas-templates/network-graph';
import { layoutConnectorLabel, routeOrthogonalConnector, type RoutingBox, type PortDirection } from './connector-routing.ts';

export interface TemplatePoint { x: number; y: number }
export interface TemplateNode extends TemplatePoint {
  id: string;
  label: string;
  sublabel?: string;
  val?: string | number;
  active?: boolean;
  color: string;
  width: number;
  height: number;
  group: number;
}
interface TemplateEdge {
  id: string;
  from: string;
  to: string;
  start: TemplatePoint;
  end: TemplatePoint;
  label?: string;
  color: string;
  d: string;
  labelPosition: TemplatePoint;
  labelBox?: RoutingBox & { lines: string[] };
  points?: TemplatePoint[];
}

const NETWORK_HEADER = 90;
const NETWORK_FOOTER = 38;
const NETWORK_SLOT_WIDTH = 148;
const NETWORK_SLOT_HEIGHT = 92;
const CYCLE_HEADER = 86;
export const CYCLE_CARD_WIDTH = 160;
export const CYCLE_CARD_HEIGHT = 88;

function networkGroups(data: NetworkGraphData) {
  const fallback = [
    { label: 'Input Layer', color: 'blue', nodes: ['x₁', 'x₂', 'x₃'] },
    { label: 'Hidden Layer', color: 'violet', nodes: ['h₁', 'h₂', 'h₃', 'h₄'] },
    { label: 'Output Layer', color: 'emerald', nodes: ['ŷ'] },
  ];
  const groups = Array.isArray(data?.groups) && data.groups.length ? data.groups : fallback;
  const usedIds = new Set<string>();
  return groups.map((group, groupIndex) => ({
    id: 'id' in group && group.id ? String(group.id) : `group-${groupIndex}`,
    label: group.label || `Layer ${groupIndex + 1}`,
    color: group.color || (groupIndex === 0 ? 'blue' : groupIndex === groups.length - 1 ? 'emerald' : 'violet'),
    nodes: (Array.isArray(group.nodes) && group.nodes.length ? group.nodes : ['Node 1']).map((raw, nodeIndex) => {
      const node: NetworkGraphNode = typeof raw === 'string' ? { label: raw } : raw;
      const base = node?.id || `g${groupIndex}-n${nodeIndex}`;
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      usedIds.add(id);
      return { ...node, id, label: node?.label || `Node ${nodeIndex + 1}` };
    }),
  }));
}

export function getNetworkMinimumSize(data: NetworkGraphData = {}) {
  const groups = networkGroups(data);
  const maxNodes = Math.max(1, ...groups.map(group => group.nodes.length));
  return data.direction === 'vertical'
    ? { width: Math.max(480, 180 + maxNodes * NETWORK_SLOT_WIDTH), height: NETWORK_HEADER + NETWORK_FOOTER + groups.length * 152 }
    : { width: Math.max(480, 64 + groups.length * NETWORK_SLOT_WIDTH + (groups.length - 1) * 84),
        height: NETWORK_HEADER + NETWORK_FOOTER + 48 + maxNodes * NETWORK_SLOT_HEIGHT };
}

function boundary(center: TemplateNode, toward: TemplatePoint) {
  const dx = toward.x - center.x, dy = toward.y - center.y;
  const scale = Math.min(center.width / 2 / Math.max(0.0001, Math.abs(dx)), center.height / 2 / Math.max(0.0001, Math.abs(dy)));
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** Coordinates are relative to the template root for both DOM nodes and SVG. */
export function computeNetworkGeometry(data: NetworkGraphData, width: number, height: number) {
  const groups = networkGroups(data);
  const vertical = data?.direction === 'vertical';
  const nodes: TemplateNode[] = [];
  const groupLabels = groups.map((group, groupIndex) => {
    const groupFraction = (groupIndex + 0.5) / groups.length;
    const label = vertical
      ? { x: 84, y: NETWORK_HEADER + groupFraction * (height - NETWORK_HEADER - NETWORK_FOOTER) }
      : { x: 32 + groupFraction * (width - 64), y: NETWORK_HEADER + 14 };
    group.nodes.forEach((node, nodeIndex) => {
      const fraction = (nodeIndex + 0.5) / group.nodes.length;
      const x = vertical ? 164 + fraction * (width - 192) : label.x;
      const y = vertical ? label.y : NETWORK_HEADER + 48 + fraction * (height - NETWORK_HEADER - NETWORK_FOOTER - 48);
      const longLabel = node.label.length > 6;
      nodes.push({ ...node, x, y, color: group.color, group: groupIndex, width: longLabel ? 116 : 48, height: longLabel ? 56 : 48 });
    });
    return { ...group, ...label };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  // Numeric references mean flattened, zero-based node indices. Explicit IDs
  // continue to work, including the generated g0-n0 identifiers for string nodes.
  const resolve = (reference: string | number) => byId.get(String(reference)) ??
    (typeof reference === 'number' ? nodes[reference] : undefined);
  const raw = data?.connections ?? 'fully-connected';
  const pairs: NetworkGraphConnection[] = [];
  if (Array.isArray(raw)) pairs.push(...raw);
  else for (let group = 0; group < groups.length - 1; group++) {
    const from = groups[group].nodes, to = groups[group + 1].nodes;
    if (raw === 'sequential') {
      for (let index = 0; index < Math.min(from.length, to.length); index++) pairs.push({ from: from[index].id, to: to[index].id });
    } else for (const a of from) for (const b of to) pairs.push({ from: a.id, to: b.id });
  }
  const occupied: RoutingBox[] = nodes.map(node => ({ id: node.id, x: node.x - node.width / 2, y: node.y - node.height / 2, width: node.width, height: node.height }));
  const existingRoutes: TemplatePoint[][] = [];
  const edgeLabels: RoutingBox[] = [];
  const edges: TemplateEdge[] = pairs.flatMap((pair, index): TemplateEdge[] => {
    const from = resolve(pair.from), to = resolve(pair.to);
    if (!from || !to) return [];
    const label = pair.label || (pair.weight != null ? String(pair.weight) : undefined);
    // Custom edges can skip layers, return backwards or run in parallel. Route
    // them around the same node rectangles used for the visible cards.
    if (Array.isArray(raw)) {
      const dx = to.x - from.x, dy = to.y - from.y;
      const horizontal = from === to || Math.abs(dx) >= Math.abs(dy);
      const parallel = pairs.map((candidate, candidateIndex) => ({ candidate, candidateIndex })).filter(({ candidate }) => resolve(candidate.from) === from && resolve(candidate.to) === to);
      const ordinal = parallel.findIndex(entry => entry.candidateIndex === index);
      const crossSize = horizontal ? Math.min(from.height, to.height) : Math.min(from.width, to.width);
      const offset = (ordinal - (parallel.length - 1) / 2) * Math.min(12, crossSize / (parallel.length + 1));
      const startDirection: PortDirection = horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
      const endDirection: PortDirection = from === to ? 'right' : horizontal ? (dx >= 0 ? 'left' : 'right') : (dy >= 0 ? 'top' : 'bottom');
      const start = horizontal ? { x: from.x + (dx >= 0 ? 1 : -1) * from.width / 2, y: from.y + (from === to ? -10 : offset) } : { x: from.x + offset, y: from.y + (dy >= 0 ? 1 : -1) * from.height / 2 };
      const end = from === to ? { x: from.x + from.width / 2, y: from.y + 10 } : horizontal ? { x: to.x - (dx >= 0 ? 1 : -1) * to.width / 2, y: to.y + offset } : { x: to.x + offset, y: to.y - (dy >= 0 ? 1 : -1) * to.height / 2 };
      const points = routeOrthogonalConnector({ start, end, startDirection, endDirection, startId: from.id, endId: to.id, obstacles: [...occupied, ...edgeLabels], existingRoutes, clearance: 10 });
      existingRoutes.push(points);
      const labelBox = label ? layoutConnectorLabel(points, label, [...occupied, ...edgeLabels]) : undefined;
      if (labelBox) edgeLabels.push(labelBox);
      return [{ id: `edge-${index}`, from: from.id, to: to.id, start, end, label, labelBox, color: from.color, points,
        labelPosition: labelBox ? { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 } : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        d: points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') }];
    }
    const dx = to.x - from.x, dy = to.y - from.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy) || (!vertical && Math.abs(dx) > 1);
    const controlA = horizontal ? { x: from.x + dx * 0.45, y: from.y } : { x: from.x, y: from.y + dy * 0.45 };
    const controlB = horizontal ? { x: to.x - dx * 0.45, y: to.y } : { x: to.x, y: to.y - dy * 0.45 };
    const start = boundary(from, controlA), end = boundary(to, controlB);
    return [{ id: `edge-${index}`, from: from.id, to: to.id, start, end, label, color: from.color,
      labelPosition: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      d: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}` }];
  });
  return { groups: groupLabels, nodes, edges, vertical };
}

function cycleRadius(count: number) {
  const safeCount = Math.max(1, count);
  const cardDiagonal = Math.hypot(CYCLE_CARD_WIDTH, CYCLE_CARD_HEIGHT);
  return Math.max(180, safeCount > 1 ? (cardDiagonal + 32) / (2 * Math.sin(Math.PI / safeCount)) : 180);
}
export function getCycleMinimumSize(data: { steps?: unknown[] } | number = {}) {
  const count = typeof data === 'number' ? data : Array.isArray(data?.steps) && data.steps.length ? data.steps.length : 4;
  const radius = cycleRadius(count);
  return { width: Math.ceil(radius * 2 + CYCLE_CARD_WIDTH + 64), height: Math.ceil(CYCLE_HEADER + radius * 2 + CYCLE_CARD_HEIGHT + 64) };
}

/** Cards and arrows use one circular track; each arc terminates at a card edge. */
export function computeCycleGeometry(count: number, width: number, height: number) {
  const safeCount = Math.max(1, count);
  const center = { x: width / 2, y: CYCLE_HEADER + (height - CYCLE_HEADER) / 2 };
  const radius = Math.max(1, Math.min((width - CYCLE_CARD_WIDTH - 64) / 2, (height - CYCLE_HEADER - CYCLE_CARD_HEIGHT - 64) / 2));
  const delta = Math.PI * 2 / safeCount;
  const point = (angle: number) => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  const nodes = Array.from({ length: safeCount }, (_, index) => {
    const angle = -Math.PI / 2 + index * delta;
    return { ...point(angle), angle, width: CYCLE_CARD_WIDTH, height: CYCLE_CARD_HEIGHT };
  });
  function edgeAngle(node: typeof nodes[number], sign: number) {
    let lo = 0, hi = Math.min(Math.PI / 2, delta / 2);
    for (let iteration = 0; iteration < 45; iteration++) {
      const offset = (lo + hi) / 2, candidate = point(node.angle + sign * offset);
      const contained = Math.abs(candidate.x - node.x) < CYCLE_CARD_WIDTH / 2 && Math.abs(candidate.y - node.y) < CYCLE_CARD_HEIGHT / 2;
      if (contained) lo = offset; else hi = offset;
    }
    return (lo + hi) / 2;
  }
  const edges = nodes.map((node, index) => {
    const next = nodes[(index + 1) % safeCount];
    const startAngle = node.angle + edgeAngle(node, 1);
    const endAngle = node.angle + delta - edgeAngle(next, -1);
    const start = point(startAngle), end = point(endAngle);
    return { id: `arc-${index}`, start, end,
      d: `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${endAngle - startAngle > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}` };
  });
  return { center, radius, nodes, edges };
}
