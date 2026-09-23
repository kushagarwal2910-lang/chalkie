import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const graph = {
  id: "root",
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '40',
    'elk.layered.spacing.nodeNodeBetweenLayers': '60',
    'elk.edgeRouting': 'ORTHOGONAL',
  },
  children: [
    { id: "atom", width: 400, height: 260 },
    { id: "proton", width: 140, height: 140 },
    { id: "neutron", width: 140, height: 140 },
    { id: "proton_quarks", width: 100, height: 80 },
    { id: "neutron_quarks", width: 100, height: 80 }
  ],
  edges: [
    { id: "e1", sources: ["atom"], targets: ["proton"] },
    { id: "e2", sources: ["atom"], targets: ["neutron"] },
    { id: "e3", sources: ["proton"], targets: ["proton_quarks"] },
    { id: "e4", sources: ["neutron"], targets: ["neutron_quarks"] }
  ]
};

const res = await elk.layout(graph);
console.log("ELK result children:");
for (const child of res.children) {
  console.log(`Node ${child.id}: x=${child.x}, y=${child.y}, w=${child.width}, h=${child.height}`);
}
console.log("\nELK result edges:");
for (const edge of res.edges) {
  console.log(`Edge ${edge.id}:`, JSON.stringify(edge.sections));
}
