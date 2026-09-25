// Run: node --test scratch/test-spatial-regression.mjs
// These tests call the real production layout, not a duplicate implementation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { applyElkLayout } from '../lib/elk-spatial-layout.ts';
import { getVisualFootprint } from '../lib/visual-footprint.ts';
import { wrapConnectorLabel } from '../lib/connector-routing.ts';

const fixtureDirectory = new URL('../outputs/spatial-audit/fixtures/', import.meta.url);
mkdirSync(fixtureDirectory, { recursive: true });

function object(id, extra = {}) {
  return { id, role: 'component', shapeType: 'custom', label: id, labelPlacement: 'below',
    x: 80, y: 80, width: 180, height: 120,
    parts: [{ type: 'rect', x: 12, y: 12, width: 150, height: 72, data: '', text: '',
      fill: 'blue', stroke: 'ink', strokeWidth: 2, opacity: 1 }], ...extra };
}
function edge(id, from, to, label = id) {
  return { id, from, to, label, color: 'blue', route: 'elbow', fromAnchor: 'right', toAnchor: 'left', arrowhead: 'arrow', bend: 0 };
}
function plan(id, objects, connections = [], extra = {}) {
  const fixture = { id, title: id, question: `Explain ${id}`, summary: '', diagramType: 'system',
    visualStrategy: 'Separate semantic components with labeled connections', sources: [], objects, connections,
    segments: [{ id: 'explanation', title: id, narration: `Explain ${id} step by step.`,
      targetIds: [...objects.map(o => o.id), ...connections.map(c => c.id)].slice(0, 16), action: 'reveal', durationMs: 5000 }], ...extra };
  writeFileSync(new URL(`${id}.json`, fixtureDirectory), JSON.stringify(fixture, null, 2));
  return fixture;
}
const overlap = (a, b) => a.x < b.x + b.width - 0.1 && a.x + a.width > b.x + 0.1 &&
  a.y < b.y + b.height - 0.1 && a.y + a.height > b.y + 0.1;
function assertScene(result, { allowedContainment = [], expectedObjects, expectedEdges } = {}) {
  if (expectedObjects !== undefined) assert.equal(result.objects.length, expectedObjects, 'layout must preserve all semantic objects');
  if (expectedEdges !== undefined) assert.equal(result.connections.length, expectedEdges, 'layout must preserve all valid connections');
  const allowed = new Set(allowedContainment.map(pair => [...pair].sort().join('|')));
  const objectIds = new Set(result.objects.map(o => o.id));
  const allIds = new Set([...objectIds, ...result.connections.map(c => c.id)]);
  assert.equal(allIds.size, result.objects.length + result.connections.length, 'object and edge IDs must be unique');
  for (const o of result.objects) {
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(o[key]), `${o.id}.${key} must be finite`);
    assert.ok(o.width > 0 && o.height > 0, `${o.id} must have a positive footprint`);
    const rendered = getVisualFootprint(o);
    assert.equal(o.width, rendered.width, `${o.id} would grow after layout in tldraw`);
    assert.equal(o.height, rendered.height, `${o.id} would grow after layout in tldraw`);
  }
  for (let i = 0; i < result.objects.length; i++) for (let j = i + 1; j < result.objects.length; j++) {
    const a = result.objects[i], b = result.objects[j];
    if (!allowed.has([a.id, b.id].sort().join('|'))) assert.ok(!overlap(a, b), `${a.id} and ${b.id} collide in their rendered footprints`);
  }
  for (const c of result.connections) {
    assert.ok(objectIds.has(c.from), `${c.id} has a missing source`);
    assert.ok(objectIds.has(c.to), `${c.id} has a missing target`);
  }
  for (const segment of result.segments) for (const id of segment.targetIds) assert.ok(allIds.has(id), `narration target ${id} was orphaned`);
}
function inside(child, parent) {
  return child.x >= parent.x && child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width + 0.1 && child.y + child.height <= parent.y + parent.height + 0.1;
}

// Slab intersection against the rectangle's strict interior. Touching a boundary
// is legal for an attached edge; cutting through a shape is not.
function cutsInterior(a, b, box) {
  const margin = 0.2;
  let lo = 0, hi = 1;
  for (const [axis, min, max] of [['x', box.x + margin, box.x + box.width - margin],
    ['y', box.y + margin, box.y + box.height - margin]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 0.00001) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return lo <= hi;
}
function onBoundary(point, box) {
  return point.x >= box.x - 0.1 && point.x <= box.x + box.width + 0.1 &&
    point.y >= box.y - 0.1 && point.y <= box.y + box.height + 0.1 &&
    Math.min(Math.abs(point.x - box.x), Math.abs(point.x - box.x - box.width),
      Math.abs(point.y - box.y), Math.abs(point.y - box.y - box.height)) < 0.1;
}
function assertRoutes(result) {
  const byId = Object.fromEntries(result.objects.map(o => [o.id, o]));
  for (const c of result.connections) {
    assert.ok(c.points?.length >= 2, `${c.id} needs the actual routed polyline, not a generic bend`);
    assert.ok(c.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${c.id} has invalid route geometry`);
    assert.ok(onBoundary(c.points[0], byId[c.from]), `${c.id} does not start on its source boundary`);
    assert.ok(onBoundary(c.points.at(-1), byId[c.to]), `${c.id} does not end on its target boundary`);
    for (const port of [c.fromPort, c.toPort]) assert.ok(port && port.x >= 0 && port.x <= 1 && port.y >= 0 && port.y <= 1, `${c.id} needs normalized endpoint ports`);
    for (let index = 1; index < c.points.length; index++) {
      const a = c.points[index - 1], b = c.points[index];
      assert.ok(Math.abs(a.x - b.x) < 0.1 || Math.abs(a.y - b.y) < 0.1, `${c.id} segment ${index} is not orthogonal`);
      for (const obstacle of result.objects) {
        const isEndpointAncestor = (obstacle.id !== c.from && inside(byId[c.from], obstacle)) ||
          (obstacle.id !== c.to && inside(byId[c.to], obstacle));
        if (isEndpointAncestor) continue;
        assert.ok(!cutsInterior(a, b, obstacle), `${c.id} segment ${index} cuts through ${obstacle.id}`);
      }
    }
  }
}
function hierarchyPairs(result) {
  const byId = new Map(result.objects.map(o => [o.id, o]));
  const pairs = [];
  for (const object of result.objects) {
    const seen = new Set([object.id]);
    let parentId = object.parentId;
    while (parentId) {
      assert.ok(!seen.has(parentId), 'parent metadata contains a cycle');
      seen.add(parentId);
      const parent = byId.get(parentId);
      assert.ok(parent, 'parent metadata refers to a missing object');
      pairs.push([object.id, parentId]);
      assert.ok(inside(object, parent), `${object.id} escaped ancestor ${parentId}`);
      parentId = parent.parentId;
    }
  }
  return pairs;
}

function denseNetwork() {
  const groups = [3, 4, 2].map((count, layer) => Array.from({ length: count }, (_, index) =>
    object(`unit-${layer}-${index}`, { x: 80 + layer * 320, y: 80 + index * 160,
      label: `Neuron ${layer}.${index}`, parts: [{ type: 'ellipse', x: 36, y: 10, width: 78, height: 78,
        text: '', data: '', fill: 'blue', stroke: 'ink', strokeWidth: 2, opacity: 1 }] })));
  const edges = [];
  for (let layer = 0; layer < 2; layer++) for (const a of groups[layer]) for (const b of groups[layer + 1])
    edges.push(edge(`weight-${a.id}-${b.id}`, a.id, b.id, 'weight'));
  return plan('fully-connected-neural-network', groups.flat(), edges);
}

test('dense 3-4-2 network retains nine distinct neurons and all twenty connections', async () => {
  const result = await applyElkLayout(denseNetwork());
  assertScene(result, { expectedObjects: 9, expectedEdges: 20 });
  assertRoutes(result);
});

test('nested containers retain true parentage while their siblings stay separate', async () => {
  const input = plan('nested-cpu-components', [
    object('cpu', { role: 'container', x: 40, y: 40, width: 1000, height: 600, parts: [] }),
    object('cache-bank', { role: 'container', x: 650, y: 100, width: 300, height: 400, parts: [] }),
    object('control', { x: 100, y: 120 }), object('arithmetic', { x: 350, y: 120 }),
    object('cache-cell', { x: 700, y: 180, width: 180, height: 120 }),
    object('ram', { x: 1200, y: 120 }),
  ], [edge('control-data', 'control', 'arithmetic'), edge('cache-write', 'arithmetic', 'cache-cell'), edge('memory-read', 'cache-cell', 'ram')]);
  const result = await applyElkLayout(input);
  assertScene(result, { expectedObjects: 6, expectedEdges: 3, allowedContainment: [
    ['cpu', 'cache-bank'], ['cpu', 'control'], ['cpu', 'arithmetic'], ['cpu', 'cache-cell'], ['cache-bank', 'cache-cell'],
  ] });
  const byId = Object.fromEntries(result.objects.map(o => [o.id, o]));
  for (const id of ['cache-bank', 'control', 'arithmetic', 'cache-cell']) assert.ok(inside(byId[id], byId.cpu), `${id} escaped cpu`);
  assert.ok(inside(byId['cache-cell'], byId['cache-bank']), 'nested cache child escaped its smallest enclosing container');
  assertRoutes(result);
});

test('cycles, parallel edges, reverse edges and self-loops survive with stable targets', async () => {
  const input = plan('message-retry-cycle', [object('producer'), object('queue'), object('worker')], [
    edge('submit', 'producer', 'queue'), edge('deliver', 'queue', 'worker'), edge('retry', 'worker', 'queue'),
    edge('retry-local', 'worker', 'worker'), edge('ack', 'worker', 'producer'), edge('deliver-again', 'queue', 'worker'),
  ]);
  const result = await applyElkLayout(input);
  assertScene(result, { expectedObjects: 3, expectedEdges: 6 });
  assert.equal(result.connections.filter(c => c.from === c.to).length, 1);
  assert.equal(result.connections.filter(c => c.from === 'queue' && c.to === 'worker').length, 2);
  assertRoutes(result);
  const parallel = result.connections.filter(c => c.from === 'queue' && c.to === 'worker');
  assert.notDeepEqual(parallel[0].points, parallel[1].points, 'parallel labeled edges must not be the exact same stroke');
});

test('an unrelated backdrop remains an obstacle to routed arrows', async () => {
  const input = plan('unrelated-container-obstacle', [
    object('source', { x: 40, y: 260 }),
    object('obstacle', { role: 'container', x: 400, y: 40, width: 350, height: 220, parts: [] }),
    object('target', { x: 940, y: 260 }),
    object('observer', { x: 440, y: 420 }),
  ], [edge('forward', 'source', 'target'), edge('feedback', 'target', 'source'), edge('observe', 'observer', 'obstacle')]);
  const result = await applyElkLayout(input);
  assertScene(result, { expectedObjects: 4, expectedEdges: 3 });
  assertRoutes(result);
});

test('tall ordered diagrams grow the canvas instead of shrinking shapes under renderer minimums', async () => {
  const objects = Array.from({ length: 14 }, (_, index) => object(`stratum-${index}`, {
    x: 80, y: 80 + index * 200, label: `Atmosphere altitude layer ${index}`, width: 300, height: 150,
  }));
  const connections = objects.slice(1).map((o, index) => edge(`up-${index}`, objects[index].id, o.id));
  const result = await applyElkLayout(plan('atmosphere-vertical-stack', objects, connections), { direction: 'DOWN' });
  assertScene(result, { expectedObjects: 14, expectedEdges: 13 });
  for (let i = 1; i < result.objects.length; i++) assert.ok(result.objects[i].y > result.objects[i - 1].y, 'vertical relationship order was lost');
  assert.ok(Math.max(...result.objects.map(o => o.y + o.height)) > 720, 'large scenes need an infinite canvas, not destructive fitting');
});

test('disconnected comparisons with long labels keep readable, nonoverlapping footprints', async () => {
  const objects = Array.from({ length: 10 }, (_, index) => object(`comparison-${index}`, {
    label: `Comparison result ${index}: daughter cells retain their distinct chromosome count`,
    labelPlacement: ['left', 'right', 'above', 'below'][index % 4], width: 180, height: 100,
  }));
  const result = await applyElkLayout(plan('disconnected-biological-comparison', objects, [], { diagramType: 'comparison' }));
  assertScene(result, { expectedObjects: 10, expectedEdges: 0 });
  assert.ok(result.objects.every(o => o.label.length >= 60), 'layout discarded descriptive labels');
});

test('formula cards share the same reserved size as their visible canvas shapes', async () => {
  const objects = [object('battery'), object('resistor-one'), object('resistor-two'),
    ...['V = I * R', 'I_total = I_1 + I_2', '1 / R_eq = 1 / R_1 + 1 / R_2', 'P = I^2 * R'].map((label, index) =>
      object(`formula-${index}`, { role: 'formula', shapeType: 'note', label, width: 80, height: 40, parts: [] }))];
  const result = await applyElkLayout(plan('parallel-circuit-formulas', objects, [edge('branch-one', 'battery', 'resistor-one'), edge('branch-two', 'battery', 'resistor-two')]));
  assertScene(result, { expectedObjects: 7, expectedEdges: 2 });
});

test('formula-only lessons remain finite without a non-formula diagram', async () => {
  const objects = Array.from({ length: 5 }, (_, index) => object(`formula-${index}`, {
    role: 'formula', shapeType: 'note', label: `E_${index} = m * c^2`, width: 300, height: 110, parts: [],
  }));
  assertScene(await applyElkLayout(plan('formula-only', objects)), { expectedObjects: 5, expectedEdges: 0 });
});

test('mixed templates, charts and standalone objects are all retained', async () => {
  const objects = [object('overview', { shapeType: 'custom-template', templateType: 'hero-breakdown',
      props: { templateType: 'hero-breakdown', data: { title: 'Overview', items: [] } }, width: 400, height: 260 }),
    object('trend', { shapeType: 'custom-chart', chart: { type: 'line', data: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }] }, width: 400, height: 260 }),
    object('detail', { shapeType: 'custom-svg', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>', width: 220, height: 180 }),
    object('conclusion')];
  assertScene(await applyElkLayout(plan('mixed-semantic-views', objects, [edge('overview-trend', 'overview', 'trend'), edge('trend-detail', 'trend', 'detail')])),
    { expectedObjects: 4, expectedEdges: 2 });
});

test('normalizing and laying out the same lesson twice keeps geometry and IDs stable', async () => {
  const first = await applyElkLayout(denseNetwork());
  const second = await applyElkLayout(first);
  assert.deepEqual(second, first, 'server + browser layout must not accumulate scaling, ID prefixes, or semantic changes');
});

test('production layout does not mutate its source lesson or vector parts', async () => {
  const input = denseNetwork();
  const before = structuredClone(input);
  await applyElkLayout(input);
  assert.deepEqual(input, before);
});

test('short connector labels reserve enough width to remain on one line', async () => {
  const input = plan('short-edge-labels', [object('source'), object('queue'), object('worker')], [
    edge('submit', 'source', 'queue', 'submit'),
    edge('deliver', 'queue', 'worker', 'deliver'),
    edge('wide', 'worker', 'source', 'WWW'),
  ]);
  const result = await applyElkLayout(input);
  assertScene(result, { expectedObjects: 3, expectedEdges: 3 });
  assertRoutes(result);
  for (const connection of result.connections) {
    assert.ok(connection.labelPosition, `${connection.id} needs a reserved label box`);
    assert.deepEqual(wrapConnectorLabel(connection.label, connection.labelPosition.width), [connection.label]);
    assert.equal(connection.labelPosition.height, 29, `${connection.id} should reserve one text line`);
  }
});

test('edges between a container and its own descendants attach to the actual endpoints', async () => {
  const input = plan('ancestor-descendant-connections', [
    object('outer', { role: 'container', x: 20, y: 20, width: 1000, height: 700, parts: [] }),
    object('inner', { role: 'container', parentId: 'outer', x: 100, y: 100, width: 480, height: 360, parts: [] }),
    object('child', { parentId: 'inner', x: 160, y: 200 }),
    object('sibling', { parentId: 'outer', x: 700, y: 200 }),
  ], [edge('outer-to-child', 'outer', 'child'), edge('child-to-outer', 'child', 'outer'), edge('sibling-child', 'sibling', 'child')]);
  const first = await applyElkLayout(input);
  assertScene(first, { expectedObjects: 4, expectedEdges: 3, allowedContainment: hierarchyPairs(first) });
  assertRoutes(first);
  assert.deepEqual(await applyElkLayout(first), first, 'nested layout must remain stable when the browser lays out a server result');
});

test('cyclic explicit parent metadata is repaired into a finite acyclic hierarchy', async () => {
  const input = plan('invalid-parent-cycle', [
    object('box-a', { role: 'container', parentId: 'box-b', width: 300, height: 200, parts: [] }),
    object('box-b', { role: 'container', parentId: 'box-a', width: 300, height: 200, parts: [] }),
    object('leaf', { parentId: 'box-a', x: 160, y: 200 }),
  ], [edge('inspect', 'leaf', 'box-b', '')]);
  const result = await applyElkLayout(input);
  assertScene(result, { expectedObjects: 3, expectedEdges: 1, allowedContainment: hierarchyPairs(result) });
  assertRoutes(result);
});

for (const name of ['cache-load-balancer', 'feedback-cycle']) {
  test(`recorded deployed live generation: ${name}`, async () => {
    const input = JSON.parse(readFileSync(new URL(`./fixtures/spatial/${name}.json`, import.meta.url), 'utf8'));
    const result = await applyElkLayout(input);
    assertScene(result, { expectedObjects: input.objects.length, expectedEdges: input.connections.length, allowedContainment: hierarchyPairs(result) });
    assertRoutes(result);
    assert.deepEqual(await applyElkLayout(result), result);
  });
}

for (const direction of ['horizontal', 'vertical']) {
  test(`embedded ${direction} network reserves count-aware template space`, async () => {
    const data = { title: 'Signal processing layers', direction, connections: 'sequential', groups: [
      { label: 'Input sensors', color: 'blue', nodes: ['Temperature', 'Pressure', 'Humidity', 'Light'] },
      { label: 'Processing', color: 'violet', nodes: ['Normalize', 'Filter', 'Transform', 'Aggregate', 'Validate'] },
      { label: 'Output signals', color: 'emerald', nodes: ['Prediction', 'Confidence', 'Alarm'] },
    ] };
    const input = plan(`template-network-${direction}`, [object('network', { shapeType: 'custom-template',
      templateType: 'network-graph', props: { templateType: 'network-graph', data }, width: 320, height: 220, parts: [] })]);
    assertScene(await applyElkLayout(input), { expectedObjects: 1, expectedEdges: 0 });
  });
}

test('embedded twelve-step cycle reserves space for every card and connecting arc', async () => {
  const data = { title: 'Twelve-stage deployment cycle', centerLabel: 'Feedback', centerDetail: 'Each stage feeds the next',
    steps: Array.from({ length: 12 }, (_, index) => ({ label: `Stage ${index + 1}`, detail: 'Validate the outcome before the next phase.' })) };
  const input = plan('template-cycle-twelve-steps', [object('cycle', { shapeType: 'custom-template',
    templateType: 'process-cycle', props: { templateType: 'process-cycle', data }, width: 320, height: 220, parts: [] })]);
  assertScene(await applyElkLayout(input), { expectedObjects: 1, expectedEdges: 0 });
});
