import dagre from 'dagre';

const g = new dagre.graphlib.Graph({ compound: true });
g.setGraph({
  rankdir: 'TB',
  nodesep: 48,
  ranksep: 64,
  marginx: 20,
  marginy: 20
});
g.setDefaultEdgeLabel(() => ({}));

// Nodes
g.setNode('atom', { width: 400, height: 260 });
g.setNode('proton', { width: 140, height: 140 });
g.setNode('neutron', { width: 140, height: 140 });
g.setNode('proton_quarks', { width: 100, height: 80 });
g.setNode('neutron_quarks', { width: 100, height: 80 });

// Edges
g.setEdge('atom', 'proton');
g.setEdge('atom', 'neutron');
g.setEdge('proton', 'proton_quarks');
g.setEdge('neutron', 'neutron_quarks');

dagre.layout(g);

console.log("DAGRE Layout Output:");
g.nodes().forEach((nodeId) => {
  const node = g.node(nodeId);
  console.log(`Node ${nodeId}: center=(${node.x}, ${node.y}), top-left=(${node.x - node.width/2}, ${node.y - node.height/2}), size=(${node.width}x${node.height})`);
});

g.edges().forEach((e) => {
  const edge = g.edge(e);
  console.log(`Edge ${e.v} -> ${e.w}: points=${JSON.stringify(edge.points)}`);
});
