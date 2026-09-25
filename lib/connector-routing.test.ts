import assert from "node:assert/strict";
import test from "node:test";
import { connectorLabelTextWidth, layoutConnectorLabel, routeIntersectsBox, routeOrthogonalConnector, simplifyRoute, wrapConnectorLabel, type RoutePoint } from "./connector-routing.ts";

function orthogonal(points: RoutePoint[]) {
  assert.ok(points.length >= 2);
  for (let i = 1; i < points.length; i++) {
    assert.ok(Math.abs(points[i].x - points[i - 1].x) < 0.01 || Math.abs(points[i].y - points[i - 1].y) < 0.01, `Diagonal segment ${JSON.stringify(points.slice(i - 1, i + 1))}`);
  }
}

test("routes around a tall intermediary block instead of using a fixed shallow bend", () => {
  const obstacle = { id: "wall", x: 190, y: -160, width: 120, height: 420 };
  const points = routeOrthogonalConnector({ start: { x: 100, y: 50 }, end: { x: 400, y: 50 }, startDirection: "right", endDirection: "left", obstacles: [obstacle] });
  orthogonal(points);
  assert.equal(routeIntersectsBox(points, obstacle), false);
  assert.deepEqual(points[0], { x: 100, y: 50 });
  assert.deepEqual(points.at(-1), { x: 400, y: 50 });
});

test("finds a path through staggered obstacle corridors", () => {
  const obstacles = [
    { x: 90, y: -300, width: 60, height: 360 },
    { x: 220, y: 30, width: 60, height: 420 },
    { x: 350, y: -300, width: 60, height: 370 },
  ];
  const points = routeOrthogonalConnector({ start: { x: 0, y: 0 }, end: { x: 500, y: 0 }, startDirection: "right", endDirection: "left", obstacles });
  orthogonal(points);
  assert.ok(obstacles.every((obstacle) => !routeIntersectsBox(points, obstacle)));
});

test("endpoint escape stubs do not route back through either node", () => {
  const from = { id: "a", x: 0, y: 0, width: 100, height: 100 };
  const to = { id: "b", x: 260, y: 0, width: 100, height: 100 };
  const points = routeOrthogonalConnector({ start: { x: 100, y: 50 }, end: { x: 360, y: 50 }, startDirection: "right", endDirection: "right", startId: "a", endId: "b", obstacles: [from, to] });
  orthogonal(points);
  assert.ok(!routeIntersectsBox(points, from));
  assert.ok(!routeIntersectsBox(points, to));
});

test("self-loop on the same port retains a nonzero loop", () => {
  const node = { id: "a", x: 0, y: 0, width: 100, height: 100 };
  const point = { x: 100, y: 50 };
  const points = routeOrthogonalConnector({ start: point, end: point, startDirection: "right", endDirection: "right", startId: "a", endId: "a", obstacles: [node] });
  orthogonal(points);
  assert.ok(points.length >= 5);
  assert.equal(routeIntersectsBox(points, node), false);
});

test("parallel connections choose a different free lane", () => {
  const options = { start: { x: 0, y: 0 }, end: { x: 300, y: 0 }, startDirection: "right" as const, endDirection: "left" as const, obstacles: [] };
  const first = routeOrthogonalConnector(options);
  const second = routeOrthogonalConnector({ ...options, existingRoutes: [first] });
  orthogonal(second);
  assert.notDeepEqual(first, second);
});

test("labels preserve full text and their reserved multiline footprint", () => {
  const text = "Transfers electron energy through the membrane proton pump";
  const lines = wrapConnectorLabel(text, 190);
  assert.equal(lines.join(" "), text);
  const label = layoutConnectorLabel([{ x: 0, y: 0 }, { x: 300, y: 0 }], text, [], { x: 80, y: 10, width: 190, height: lines.length * 17 + 12 });
  assert.equal(label?.height, lines.length * 17 + 12);
  assert.equal(label?.x, 80);
});

test("route simplification preserves corners and intentional reversals", () => {
  assert.deepEqual(simplifyRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 20, y: 0 }]), [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 20, y: 0 },
  ]);
});

test("wide glyphs and unbroken labels stay within the reserved width", () => {
  const label = "MMMMMMMMMMMMMMMWWWWWW energy transmission";
  const lines = wrapConnectorLabel(label, 120);
  assert.equal(lines.join("").replaceAll(" ", ""), label.replaceAll(" ", ""));
  assert.ok(lines.every((line) => connectorLabelTextWidth(line) <= 100));
});
