import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeNetworkGeometry, getNetworkMinimumSize, computeCycleGeometry, getCycleMinimumSize } from '../lib/template-geometry.ts';
import { routeIntersectsBox } from '../lib/connector-routing.ts';

const bounds = node => ({ x: node.x - node.width / 2, y: node.y - node.height / 2, width: node.width, height: node.height });
function overlap(a, b) {
  return a.x < b.x + b.width - 0.001 && a.x + a.width > b.x + 0.001 && a.y < b.y + b.height - 0.001 && a.y + a.height > b.y + 0.001;
}
function onEdge(point, node) {
  const box = bounds(node);
  return point.x >= box.x - 0.001 && point.x <= box.x + box.width + 0.001 && point.y >= box.y - 0.001 && point.y <= box.y + box.height + 0.001 &&
    Math.min(Math.abs(point.x - box.x), Math.abs(point.x - box.x - box.width), Math.abs(point.y - box.y), Math.abs(point.y - box.y - box.height)) < 0.001;
}
function assertNodeBoxes(nodes, width, height) {
  const boxes = nodes.map(bounds);
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.y >= 86 && box.x + box.width <= width && box.y + box.height <= height, 'card escapes content area');
  }
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) assert.ok(!overlap(boxes[a], boxes[b]), `card ${a} collides with ${b}`);
}

for (const direction of ['horizontal', 'vertical']) {
  test(`network ${direction}: many groups and long labels have shared node/arrow coordinates`, () => {
    const data = { direction, groups: Array.from({ length: 5 }, (_, group) => ({ label: `Group ${group}`, nodes: Array.from({ length: 7 }, (_, index) => ({ id: `g${group}-${index}`, label: `Long component label ${index}` })) })) };
    const minimum = getNetworkMinimumSize(data);
    const scene = computeNetworkGeometry(data, minimum.width, minimum.height);
    assert.equal(scene.nodes.length, 35);
    assert.equal(scene.edges.length, 196);
    assertNodeBoxes(scene.nodes, minimum.width, minimum.height);
    for (const edge of scene.edges) {
      assert.ok(onEdge(edge.start, scene.nodes.find(node => node.id === edge.from)));
      assert.ok(onEdge(edge.end, scene.nodes.find(node => node.id === edge.to)));
    }
  });
}

test('sequential mode connects matching adjacent nodes instead of inventing all-to-all edges', () => {
  const data = { connections: 'sequential', groups: [{ label: 'A', nodes: ['a', 'b', 'c'] }, { label: 'B', nodes: ['d', 'e', 'f', 'g'] }, { label: 'C', nodes: ['h', 'i'] }] };
  const minimum = getNetworkMinimumSize(data), scene = computeNetworkGeometry(data, minimum.width, minimum.height);
  assert.equal(scene.edges.length, 5);
  assert.deepEqual(scene.edges.map(edge => [edge.from, edge.to]), [
    ['g0-n0', 'g1-n0'], ['g0-n1', 'g1-n1'], ['g0-n2', 'g1-n2'], ['g1-n0', 'g2-n0'], ['g1-n1', 'g2-n1'],
  ]);
});

test('explicit network IDs, numeric indices, labels, weights and a self-loop are retained', () => {
  const data = { groups: [{ label: 'A', nodes: [{ id: 'first', label: 'A' }, { id: 'second', label: 'B' }] }], connections: [
    { from: 'first', to: 'second', label: 'next' }, { from: 1, to: 0, weight: 0.5 }, { from: 'first', to: 'first', label: 'retry' },
  ] };
  const minimum = getNetworkMinimumSize(data), scene = computeNetworkGeometry(data, minimum.width, minimum.height);
  assert.equal(scene.edges.length, 3);
  assert.deepEqual(scene.edges.map(edge => edge.label), ['next', '0.5', 'retry']);
  assert.ok(scene.edges.every(edge => !/NaN|Infinity/.test(edge.d)));
});

test('custom network edges skip intermediate nodes safely and parallel arrows use distinct paths', () => {
  const data = { groups: [
    { label: 'A', nodes: [{ id: 'a', label: 'Source' }] },
    { label: 'B', nodes: [{ id: 'b', label: 'Obstacle' }] },
    { label: 'C', nodes: [{ id: 'c', label: 'Target' }] },
  ], connections: [{ from: 'a', to: 'c', label: 'request' }, { from: 'a', to: 'c', label: 'retry' }, { from: 'c', to: 'a', label: 'return' }, { from: 'b', to: 'b', label: 'local' }] };
  const minimum = getNetworkMinimumSize(data), scene = computeNetworkGeometry(data, minimum.width, minimum.height);
  assert.notDeepEqual(scene.edges[0].points, scene.edges[1].points);
  for (const edge of scene.edges) {
    assert.ok(onEdge(edge.start, scene.nodes.find(node => node.id === edge.from)));
    assert.ok(onEdge(edge.end, scene.nodes.find(node => node.id === edge.to)));
    for (const node of scene.nodes) assert.ok(!routeIntersectsBox(edge.points, bounds(node)), `${edge.id} cuts through ${node.id}`);
  }
});

for (const count of [1, 2, 3, 4, 7, 12, 20]) {
  test(`cycle with ${count} steps has no card/hub overlaps and arcs terminate at visible card edges`, () => {
    const minimum = getCycleMinimumSize(count), scene = computeCycleGeometry(count, minimum.width, minimum.height);
    assert.equal(scene.nodes.length, count);
    assert.equal(scene.edges.length, count);
    assertNodeBoxes(scene.nodes, minimum.width, minimum.height);
    const hub = { x: scene.center.x - 60, y: scene.center.y - 60, width: 120, height: 120 };
    scene.nodes.forEach(node => assert.ok(!overlap(bounds(node), hub), 'step card overlaps central hub'));
    scene.edges.forEach((edge, index) => {
      assert.ok(onEdge(edge.start, scene.nodes[index]), `arc ${index} source misses visible card`);
      assert.ok(onEdge(edge.end, scene.nodes[(index + 1) % count]), `arc ${index} target misses visible card`);
      assert.ok(!/NaN|Infinity/.test(edge.d));
    });
  });
}
