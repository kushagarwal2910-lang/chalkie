/** Orthogonal routes used when a user moves a laid-out diagram node. */
export interface RoutePoint { x: number; y: number }
export interface RoutingBox { id?: string; x: number; y: number; width: number; height: number }
export type PortDirection = "top" | "right" | "bottom" | "left";

const EPSILON = 0.01;
const directions: Record<PortDirection, RoutePoint> = {
  top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};

export function simplifyRoute(points: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = result.at(-1);
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < EPSILON) continue;
    const before = result.at(-2);
    if (previous && before &&
      Math.abs((previous.x - before.x) * (point.y - previous.y) - (previous.y - before.y) * (point.x - previous.x)) < EPSILON &&
      (previous.x - before.x) * (point.x - previous.x) + (previous.y - before.y) * (point.y - previous.y) >= 0) {
      result.pop();
    }
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

/** Tests the open interior; running along an obstacle's clearance boundary is valid. */
export function segmentIntersectsBox(a: RoutePoint, b: RoutePoint, box: RoutingBox): boolean {
  const left = box.x + EPSILON;
  const right = box.x + box.width - EPSILON;
  const top = box.y + EPSILON;
  const bottom = box.y + box.height - EPSILON;
  let low = 0;
  let high = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, left, right], [a.y, b.y - a.y, top, bottom]]) {
    if (Math.abs(delta) < EPSILON) {
      if (origin <= min || origin >= max) return false;
    } else {
      const first = (min - origin) / delta;
      const last = (max - origin) / delta;
      low = Math.max(low, Math.min(first, last));
      high = Math.min(high, Math.max(first, last));
      if (high <= low) return false;
    }
  }
  return high > low && high > 0 && low < 1;
}

export function routeIntersectsBox(points: RoutePoint[], box: RoutingBox): boolean {
  return points.some((point, index) => index > 0 && segmentIntersectsBox(points[index - 1], point, box));
}

export interface OrthogonalRouteOptions {
  start: RoutePoint;
  end: RoutePoint;
  startDirection?: PortDirection;
  endDirection?: PortDirection;
  obstacles: RoutingBox[];
  startId?: string;
  endId?: string;
  clearance?: number;
  existingRoutes?: RoutePoint[][];
}

function crossingCost(a: RoutePoint, b: RoutePoint, routes: RoutePoint[][]): number {
  let cost = 0;
  for (const points of routes) {
    for (let index = 1; index < points.length; index++) {
      const c = points[index - 1];
      const d = points[index];
      const horizontal = Math.abs(a.y - b.y) < EPSILON;
      const otherHorizontal = Math.abs(c.y - d.y) < EPSILON;
      if (horizontal !== otherHorizontal) {
        const h1 = horizontal ? a : c, h2 = horizontal ? b : d;
        const v1 = horizontal ? c : a, v2 = horizontal ? d : b;
        if (v1.x > Math.min(h1.x, h2.x) + EPSILON && v1.x < Math.max(h1.x, h2.x) - EPSILON &&
          h1.y > Math.min(v1.y, v2.y) + EPSILON && h1.y < Math.max(v1.y, v2.y) - EPSILON) cost += 120;
      } else {
        const sameLane = horizontal ? Math.abs(a.y - c.y) < 5 : Math.abs(a.x - c.x) < 5;
        const overlap = horizontal
          ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
          : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
        if (sameLane && overlap > EPSILON) cost += 250 + overlap * 2;
      }
    }
  }
  return cost;
}

class MinHeap {
  items: Array<{ key: number; score: number }> = [];
  push(value: { key: number; score: number }) {
    let index = this.items.length;
    this.items.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].score <= value.score) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score) child++;
        if (this.items[child].score >= last.score) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

/**
 * Uses a visibility grid around actual obstacles, not a fixed curved bend. ELK is
 * still authoritative for untouched diagrams; this reroutes edited endpoints.
 * Overlapping endpoint boxes may leave no obstacle-free route after a manual edit.
 */
export function routeOrthogonalConnector(options: OrthogonalRouteOptions): RoutePoint[] {
  const { start, end, startId, endId, existingRoutes = [] } = options;
  const clearance = options.clearance ?? 12;
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const startDirection = options.startDirection ?? (horizontal ? (end.x >= start.x ? "right" : "left") : (end.y >= start.y ? "bottom" : "top"));
  const endDirection = options.endDirection ?? (horizontal ? (end.x >= start.x ? "left" : "right") : (end.y >= start.y ? "top" : "bottom"));
  const inflate = (box: RoutingBox): RoutingBox => ({ ...box, x: box.x - clearance, y: box.y - clearance, width: box.width + clearance * 2, height: box.height + clearance * 2 });
  const obstacles = options.obstacles.map(inflate);
  const escape = (point: RoutePoint, direction: PortDirection, id?: string): RoutePoint => {
    const vector = directions[direction];
    let length = clearance + 4;
    const own = id ? obstacles.find((box) => box.id === id) : undefined;
    if (own) {
      if (direction === "right") length = Math.max(length, own.x + own.width - point.x);
      if (direction === "left") length = Math.max(length, point.x - own.x);
      if (direction === "bottom") length = Math.max(length, own.y + own.height - point.y);
      if (direction === "top") length = Math.max(length, point.y - own.y);
    }
    return { x: point.x + vector.x * length, y: point.y + vector.y * length };
  };
  const first = escape(start, startDirection, startId);
  const last = escape(end, endDirection, endId);
  const clear = (a: RoutePoint, b: RoutePoint) => !obstacles.some((box) => segmentIntersectsBox(a, b, box));
  const samePort = Math.hypot(first.x - last.x, first.y - last.y) < EPSILON;
  const candidates: RoutePoint[][] = samePort ? [] : [
    [first, { x: last.x, y: first.y }, last],
    [first, { x: first.x, y: last.y }, last],
  ];
  const xs = new Set([first.x, last.x, (first.x + last.x) / 2]);
  const ys = new Set([first.y, last.y, (first.y + last.y) / 2]);
  for (const box of obstacles) {
    xs.add(box.x); xs.add(box.x + box.width);
    ys.add(box.y); ys.add(box.y + box.height);
  }
  // Separate parallel lanes when another route already occupies a clear corridor.
  for (const point of [first, last]) {
    xs.add(point.x - 20); xs.add(point.x + 20);
    ys.add(point.y - 20); ys.add(point.y + 20);
  }
  const outer = clearance + 24;
  xs.add(Math.min(...xs) - outer); xs.add(Math.max(...xs) + outer);
  ys.add(Math.min(...ys) - outer); ys.add(Math.max(...ys) + outer);
  if (samePort) {
    const normal = directions[startDirection];
    for (const length of [32, 56, 88]) {
      for (const side of [-1, 1]) {
        const a = { x: first.x + normal.x * length, y: first.y + normal.y * length };
        const b = { x: a.x - normal.y * length * side, y: a.y + normal.x * length * side };
        const c = { x: first.x - normal.y * length * side, y: first.y + normal.x * length * side };
        candidates.push([first, a, b, c, last]);
      }
    }
  } else {
    for (const x of xs) candidates.push([first, { x, y: first.y }, { x, y: last.y }, last]);
    for (const y of ys) candidates.push([first, { x: first.x, y }, { x: last.x, y }, last]);
  }
  const score = (points: RoutePoint[]) => points.reduce((sum, point, index) => index === 0 ? 0 : sum +
    Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) +
    crossingCost(points[index - 1], point, existingRoutes) + 16, 0);
  const valid = candidates.map(simplifyRoute).filter((points) => points.every((p, i) => i === 0 || clear(points[i - 1], p)));
  if (valid.length) {
    valid.sort((a, b) => score(a) - score(b));
    return simplifyRoute([start, ...valid[0], end]);
  }

  const columns = [...xs].sort((a, b) => a - b);
  const rows = [...ys].sort((a, b) => a - b);
  const width = columns.length;
  const pointAt = (node: number) => ({ x: columns[node % width], y: rows[Math.floor(node / width)] });
  const startNode = rows.indexOf(first.y) * width + columns.indexOf(first.x);
  const endNode = rows.indexOf(last.y) * width + columns.indexOf(last.x);
  // Direction is part of the search state, making the bend penalty meaningful.
  const initialKey = startNode * 3;
  const costs = new Map<number, number>([[initialKey, 0]]);
  const previous = new Map<number, number>();
  const queue = new MinHeap();
  queue.push({ key: initialKey, score: 0 });
  let finalKey: number | undefined;
  while (queue.items.length) {
    const current = queue.pop()!;
    const node = Math.floor(current.key / 3);
    const axis = current.key % 3;
    if (node === endNode) { finalKey = current.key; break; }
    const col = node % width;
    const row = Math.floor(node / width);
    const a = pointAt(node);
    const neighbors = [col > 0 ? node - 1 : -1, col + 1 < width ? node + 1 : -1, row > 0 ? node - width : -1, row + 1 < rows.length ? node + width : -1];
    for (const next of neighbors) {
      if (next < 0) continue;
      const b = pointAt(next);
      if (!clear(a, b)) continue;
      const nextAxis = Math.abs(a.x - b.x) < EPSILON ? 2 : 1;
      const key = next * 3 + nextAxis;
      const cost = costs.get(current.key)! + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) +
        (axis && axis !== nextAxis ? 24 : 0) + crossingCost(a, b, existingRoutes);
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost); previous.set(key, current.key);
      queue.push({ key, score: cost + Math.abs(last.x - b.x) + Math.abs(last.y - b.y) });
    }
  }
  if (finalKey !== undefined) {
    const path: RoutePoint[] = [];
    let key: number | undefined = finalKey;
    while (key !== undefined) { path.push(pointAt(Math.floor(key / 3))); key = previous.get(key); }
    return simplifyRoute([start, ...path.reverse(), end]);
  }
  // Manual overlaps cannot always be routed. Choose the least obstructed detour,
  // keeping endpoint identity and direction instead of dropping the connection.
  candidates.sort((a, b) => {
    const collisions = (points: RoutePoint[]) => obstacles.filter((box) => routeIntersectsBox(points, box)).length;
    return collisions(a) - collisions(b) || score(a) - score(b);
  });
  return simplifyRoute([start, ...candidates[0], end]);
}

export interface ConnectorLabelLayout extends RoutingBox { lines: string[] }

/** Conservative 13px sans-serif metrics shared by ELK and the SVG renderer. */
export function connectorLabelTextWidth(text: string): number {
  return Array.from(text).reduce((width, character) => width + (
    /[MW@%&]/.test(character) ? 13 : /[mw]/.test(character) ? 11 : /[ilI.,'!:;|]/.test(character) ? 4 :
      /\s/.test(character) ? 4 : /[A-Z0-9]/.test(character) ? 9 : /[^\x00-\x7f]/.test(character) ? 13 : 8
  ), 0);
}

export function wrapConnectorLabel(label: string, width = 190): string[] {
  const contentWidth = Math.max(28, width - 20);
  const lines: string[] = [];
  let line = "";
  for (const word of label.trim().split(/\s+/)) {
    let rest = "";
    if (line && connectorLabelTextWidth(`${line} ${word}`) > contentWidth) { lines.push(line); line = ""; }
    for (const character of Array.from(word)) {
      if (rest && connectorLabelTextWidth(rest + character) > contentWidth) { lines.push(rest); rest = ""; }
      rest += character;
    }
    line = line ? `${line} ${rest}` : rest;
  }
  if (line) lines.push(line);
  return lines;
}

export function layoutConnectorLabel(points: RoutePoint[], label: string, obstacles: RoutingBox[] = [], preferred?: RoutingBox): ConnectorLabelLayout | undefined {
  if (!label.trim() || points.length < 2) return undefined;
  const width = preferred?.width ?? Math.max(76, Math.min(190, connectorLabelTextWidth(label) + 20));
  const lines = wrapConnectorLabel(label, width);
  const height = Math.max(preferred?.height ?? 0, lines.length * 17 + 12);
  if (preferred) return { ...preferred, width, height, lines };
  const segments = points.slice(1).map((point, index) => ({ a: points[index], b: point, length: Math.hypot(point.x - points[index].x, point.y - points[index].y) })).sort((a, b) => b.length - a.length);
  const candidates: RoutingBox[] = [];
  for (const { a, b } of segments) {
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const horizontal = Math.abs(a.y - b.y) < EPSILON;
    candidates.push(
      { x: x - width / 2, y: horizontal ? y - height - 8 : y - height / 2, width, height },
      { x: horizontal ? x - width / 2 : x + 8, y: horizontal ? y + 8 : y - height / 2, width, height },
    );
  }
  const overlapArea = (box: RoutingBox) => obstacles.reduce((sum, obstacle) => sum + Math.max(0, Math.min(box.x + box.width, obstacle.x + obstacle.width) - Math.max(box.x, obstacle.x)) * Math.max(0, Math.min(box.y + box.height, obstacle.y + obstacle.height) - Math.max(box.y, obstacle.y)), 0);
  candidates.sort((a, b) => overlapArea(a) - overlapArea(b));
  return { ...candidates[0], lines };
}
