import dagre from 'dagre';

const g = new dagre.graphlib.Graph({ compound: true });
g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 50 });
g.setDefaultEdgeLabel(() => ({}));

// Parent container
g.setNode('atom_container', { label: 'Atom Box' });

// Children inside container
g.setNode('nucleus', { width: 140, height: 140 });
g.setParent('nucleus', 'atom_container');

g.setNode('electrons', { width: 220, height: 60 });
g.setParent('electrons', 'atom_container');

// Outside nodes
g.setNode('proton', { width: 120, height: 120 });
g.setNode('neutron', { width: 120, height: 120 });

// Edges
g.setEdge('nucleus', 'electrons');
g.setEdge('atom_container', 'proton');
g.setEdge('atom_container', 'neutron');

dagre.layout(g);

console.log("Compound Layout:");
g.nodes().forEach((id) => {
  const n = g.node(id);
  console.log(`${id}: x=${n.x}, y=${n.y}, w=${n.width}, h=${n.height}, parent=${g.parent(id)}`);
});
