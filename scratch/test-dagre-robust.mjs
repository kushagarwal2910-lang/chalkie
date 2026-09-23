import dagre from 'dagre';

const g = new dagre.graphlib.Graph();
g.setGraph({
  rankdir: 'TB',
  nodesep: 48,
  ranksep: 64,
  marginx: 40,
  marginy: 40
});
g.setDefaultEdgeLabel(() => ({}));

const objects = [
  { id: "atom", width: 400, height: 260 },
  { id: "proton", width: 140, height: 140 },
  { id: "neutron", width: 140, height: 140 },
  { id: "proton_quarks", width: 110, height: 70 },
  { id: "neutron_quarks", width: 110, height: 70 },
  { id: "legend", width: 180, height: 60 } // disconnected node
];

const connections = [
  { from: "atom", to: "proton" },
  { from: "atom", to: "neutron" },
  { from: "proton", to: "proton_quarks" },
  { from: "neutron", to: "neutron_quarks" }
];

for (const obj of objects) {
  g.setNode(obj.id, { width: obj.width, height: obj.height });
}

for (const conn of connections) {
  g.setEdge(conn.from, conn.to);
}

dagre.layout(g);

for (const obj of objects) {
  const node = g.node(obj.id);
  console.log(`${obj.id}: x=${node.x - node.width/2}, y=${node.y - node.height/2}, w=${node.width}, h=${node.height}`);
}

for (const conn of connections) {
  const edge = g.edge(conn.from, conn.to);
  console.log(`Edge ${conn.from} -> ${conn.to}:`, edge.points);
}
