"use client";

import {
  BindingUtil, Group2d, Polyline2d, Rectangle2d, ShapeUtil, SVGContainer, T, Vec,
  type Editor, type RecordProps, type TLBinding, type TLShape,
} from "tldraw";
import {
  layoutConnectorLabel, routeIntersectsBox, routeOrthogonalConnector,
  type PortDirection, type RoutePoint, type RoutingBox,
} from "@/lib/connector-routing";

export const CHALK_CONNECTOR_TYPE = "chalk-connector" as const;
export const CHALK_CONNECTOR_BINDING_TYPE = "chalk-connector" as const;

interface ChalkConnectorProps {
  points: RoutePoint[];
  color: string;
  label: string;
  arrowhead: string;
  labelPosition?: { x: number; y: number; width: number; height: number };
}

interface ChalkConnectorBindingProps {
  terminal: "start" | "end";
  normalizedAnchor: RoutePoint;
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap { [CHALK_CONNECTOR_TYPE]: ChalkConnectorProps }
  export interface TLGlobalBindingPropsMap { [CHALK_CONNECTOR_BINDING_TYPE]: ChalkConnectorBindingProps }
}

export type ChalkConnectorShape = TLShape<typeof CHALK_CONNECTOR_TYPE>;
export type ChalkConnectorBinding = TLBinding<typeof CHALK_CONNECTOR_BINDING_TYPE>;

const pointValidator = T.object({ x: T.number, y: T.number });
const palette: Record<string, string> = {
  ink: "#7dd3fc", black: "#7dd3fc", slate: "#94a3b8", gray: "#94a3b8", grey: "#94a3b8",
  blue: "#60a5fa", cyan: "#22d3ee", "light-blue": "#38bdf8", violet: "#a78bfa",
  orange: "#fb923c", green: "#4ade80", red: "#f87171", yellow: "#facc15", white: "#f8fafc",
};

function routePoints(shape: ChalkConnectorShape) {
  return shape.props.points.length >= 2 ? shape.props.points : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
}

function pathData(points: RoutePoint[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
}

function ConnectorSvg({ shape }: { shape: ChalkConnectorShape }) {
  const points = routePoints(shape);
  const end = points.at(-1)!;
  const previous = points.at(-2)!;
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x) * 180 / Math.PI;
  const color = palette[shape.props.color] ?? "#94a3b8";
  const label = layoutConnectorLabel(points, shape.props.label, [], shape.props.labelPosition);
  const head = shape.props.arrowhead;
  return (
    <SVGContainer style={{ overflow: "visible" }}>
      <path d={pathData(points)} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      {head !== "none" && (
        <g transform={`translate(${end.x} ${end.y}) rotate(${angle})`} fill={color} stroke={color} strokeWidth={2.25}>
          {head === "dot" ? <circle cx={-3} cy={0} r={4} /> :
            head === "diamond" ? <path d="M0,0 L-6,-4 L-12,0 L-6,4 Z" /> :
              head === "bar" ? <path d="M0,-6 L0,6" fill="none" /> :
                head === "triangle" ? <path d="M0,0 L-10,-5 L-10,5 Z" /> :
                  <path d="M-9,-5 L0,0 L-9,5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      )}
      {label && (
        <g>
          <rect x={label.x} y={label.y} width={label.width} height={label.height} rx={5} fill="#0c0e18" fillOpacity={0.97} stroke="#334155" strokeWidth={0.75} />
          <text x={label.x + label.width / 2} y={label.y + 6 + 13} textAnchor="middle" fontSize={13} fontFamily="Inter, ui-sans-serif, system-ui" fill={color}>
            {label.lines.map((line, index) => <tspan key={index} x={label.x + label.width / 2} dy={index ? 17 : 0}>{line}</tspan>)}
          </text>
        </g>
      )}
    </SVGContainer>
  );
}

/** Renders the exact ELK polyline rather than asking native arrows to route again. */
export class ChalkConnectorShapeUtil extends ShapeUtil<ChalkConnectorShape> {
  static override type = CHALK_CONNECTOR_TYPE;
  static override props: RecordProps<ChalkConnectorShape> = {
    points: T.arrayOf(pointValidator), color: T.string, label: T.string, arrowhead: T.string,
    labelPosition: T.optional(T.object({ x: T.number, y: T.number, width: T.number, height: T.number })),
  };
  getDefaultProps(): ChalkConnectorProps {
    return { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "slate", label: "", arrowhead: "arrow" };
  }
  override canResize() { return false; }
  override canEdit() { return false; }
  override hideRotateHandle() { return true; }
  override canSnap() { return false; }
  getGeometry(shape: ChalkConnectorShape) {
    const points = routePoints(shape);
    const line = new Polyline2d({ points: points.map((point) => new Vec(point.x, point.y)) });
    const label = layoutConnectorLabel(points, shape.props.label, [], shape.props.labelPosition);
    return label ? new Group2d({ children: [line, new Rectangle2d({ ...label, isFilled: true })] }) : line;
  }
  component(shape: ChalkConnectorShape) { return <ConnectorSvg shape={shape} />; }
  getIndicatorPath(shape: ChalkConnectorShape) { return new Path2D(pathData(routePoints(shape))); }
}

function isConnector(shape: TLShape): shape is ChalkConnectorShape { return shape.type === CHALK_CONNECTOR_TYPE; }

function isLayoutObject(shape: TLShape) { return typeof shape.meta.chalkieId === "string"; }

function ancestors(editor: Editor, shape: TLShape) {
  const result = new Set<string>();
  let current: TLShape | undefined = shape;
  while (current) {
    const id: unknown = current.meta.layoutParentId;
    if (typeof id !== "string" || !id || result.has(id)) break;
    result.add(id);
    current = editor.getCurrentPageShapes().find((candidate) => candidate.meta.chalkieId === id);
  }
  return result;
}

function endpoint(editor: Editor, binding: ChalkConnectorBinding) {
  const bound = editor.getShape(binding.toId);
  if (!bound) return undefined;
  const box = editor.getShapeGeometry(bound).bounds;
  const anchor = binding.props.normalizedAnchor;
  const local = { x: box.x + box.width * anchor.x, y: box.y + box.height * anchor.y };
  const transform = editor.getShapePageTransform(bound);
  const point = transform.applyToPoint(local);
  // Transform the outward port normal with the node, including rotation.
  const near = [anchor.x, 1 - anchor.x, anchor.y, 1 - anchor.y];
  const side = near.indexOf(Math.min(...near));
  const normal = side === 0 ? { x: -1, y: 0 } : side === 1 ? { x: 1, y: 0 } : side === 2 ? { x: 0, y: -1 } : { x: 0, y: 1 };
  const shifted = transform.applyToPoint({ x: local.x + normal.x, y: local.y + normal.y });
  const dx = shifted.x - point.x, dy = shifted.y - point.y;
  const direction: PortDirection = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
  return { shape: bound, point, direction };
}

/** Refreshes only paths invalidated by a transform or an obstacle edit. */
export function refreshChalkConnectorRoutes(editor: Editor) {
  const shapes = editor.getCurrentPageShapes();
  const objects = shapes.filter(isLayoutObject);
  const obstacles: RoutingBox[] = objects.flatMap((shape) => {
    const box = editor.getShapePageBounds(shape);
    return box ? [{ id: shape.id, x: box.x, y: box.y, width: box.width, height: box.height }] : [];
  });
  const priorRoutes: RoutePoint[][] = [];
  const labelBoxes: RoutingBox[] = [];
  const updates: Array<{ id: ChalkConnectorShape["id"]; type: typeof CHALK_CONNECTOR_TYPE; props: Partial<ChalkConnectorProps> }> = [];
  for (const shape of shapes.filter(isConnector)) {
    const bindings = editor.getBindingsFromShape(shape, CHALK_CONNECTOR_BINDING_TYPE);
    const startBinding = bindings.find((binding) => binding.props.terminal === "start");
    const endBinding = bindings.find((binding) => binding.props.terminal === "end");
    if (!startBinding || !endBinding) continue;
    const start = endpoint(editor, startBinding), end = endpoint(editor, endBinding);
    if (!start || !end) continue;
    const excluded = new Set([...ancestors(editor, start.shape), ...ancestors(editor, end.shape)]);
    // A containing backdrop is not a wall: connectors may cross its boundary.
    const routeObstacles = obstacles.filter((box) => {
      const candidate = editor.getShape(box.id as TLShape["id"]);
      return !candidate || !excluded.has(String(candidate.meta.chalkieId));
    });
    const current = editor.getShapePageTransform(shape).applyToPoints(routePoints(shape));
    const endpointsMatch = Math.hypot(current[0].x - start.point.x, current[0].y - start.point.y) < 0.1 &&
      Math.hypot(current.at(-1)!.x - end.point.x, current.at(-1)!.y - end.point.y) < 0.1;
    const hit = routeObstacles.some((box) => box.id !== start.shape.id && box.id !== end.shape.id && routeIntersectsBox(current, box));
    if (endpointsMatch && !hit) {
      priorRoutes.push(current);
      const label = layoutConnectorLabel(routePoints(shape), shape.props.label, [], shape.props.labelPosition);
      if (label) {
        const corner = editor.getShapePageTransform(shape).applyToPoint(label);
        labelBoxes.push({ ...label, x: corner.x, y: corner.y });
      }
      continue;
    }
    const points = routeOrthogonalConnector({ start: start.point, end: end.point, startDirection: start.direction, endDirection: end.direction,
      startId: start.shape.id, endId: end.shape.id, obstacles: routeObstacles, existingRoutes: priorRoutes });
    const label = layoutConnectorLabel(points, shape.props.label, [...routeObstacles, ...labelBoxes]);
    const labelCorner = label ? editor.getPointInShapeSpace(shape, label) : undefined;
    const props: Partial<ChalkConnectorProps> = {
      points: points.map((point) => { const p = editor.getPointInShapeSpace(shape, point); return { x: p.x, y: p.y }; }),
      labelPosition: label && labelCorner ? { x: labelCorner.x, y: labelCorner.y, width: label.width, height: label.height } : undefined,
    };
    if (JSON.stringify(props.points) !== JSON.stringify(shape.props.points) || JSON.stringify(props.labelPosition) !== JSON.stringify(shape.props.labelPosition)) {
      updates.push({ id: shape.id, type: CHALK_CONNECTOR_TYPE, props });
    }
    priorRoutes.push(points);
    if (label) labelBoxes.push(label);
  }
  if (updates.length) editor.run(() => editor.updateShapes(updates), { history: "ignore" });
}

const pending = new WeakSet<Editor>();
function scheduleRefresh(editor: Editor) {
  if (pending.has(editor)) return;
  pending.add(editor);
  queueMicrotask(() => { pending.delete(editor); if (!editor.isDisposed) refreshChalkConnectorRoutes(editor); });
}

/** Binding records preserve endpoints when users duplicate or move diagram nodes. */
export class ChalkConnectorBindingUtil extends BindingUtil<ChalkConnectorBinding> {
  static override type = CHALK_CONNECTOR_BINDING_TYPE;
  static override props: RecordProps<ChalkConnectorBinding> = { terminal: T.literalEnum("start", "end"), normalizedAnchor: pointValidator };
  getDefaultProps(): ChalkConnectorBindingProps { return { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 } }; }
  override onAfterCreate() { scheduleRefresh(this.editor); }
  override onAfterChangeToShape({ shapeBefore, shapeAfter, reason }: { shapeBefore: TLShape; shapeAfter: TLShape; reason: "self" | "ancestry" }) {
    if (reason === "ancestry" || shapeBefore.x !== shapeAfter.x || shapeBefore.y !== shapeAfter.y || shapeBefore.rotation !== shapeAfter.rotation || shapeBefore.parentId !== shapeAfter.parentId ||
      JSON.stringify(shapeBefore.props) !== JSON.stringify(shapeAfter.props)) scheduleRefresh(this.editor);
  }
  override onAfterChangeFromShape() { scheduleRefresh(this.editor); }
  override onBeforeDeleteToShape({ binding }: { binding: ChalkConnectorBinding }) {
    if (this.editor.getShape(binding.fromId)) this.editor.deleteShapes([binding.fromId]);
  }
}

/** Also reroute around a moved third-party obstacle, not only the two endpoints. */
export function installChalkConnectorRouting(editor: Editor) {
  return editor.store.listen(({ changes }) => {
    const changed = Object.values(changes.updated).some(([before, after]) => {
      if (before.typeName !== "shape" || after.typeName !== "shape" || !isLayoutObject(after)) return false;
      const oldSize = before.props as { w?: number; h?: number };
      const newSize = after.props as { w?: number; h?: number };
      return before.x !== after.x || before.y !== after.y || before.rotation !== after.rotation || before.parentId !== after.parentId || oldSize.w !== newSize.w || oldSize.h !== newSize.h;
    });
    if (changed) scheduleRefresh(editor);
  }, { scope: "document" });
}
