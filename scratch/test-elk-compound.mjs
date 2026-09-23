import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const graph = {
  id: "root",
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': '48',
    'elk.layered.spacing.nodeNodeBetweenLayers': '64',
    'elk.edgeRouting': 'ORTHOGONAL',
  },
  children: [
    {
      id: "atom_container",
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.padding': '[top=40,left=30,bottom=30,right=30]',
      },
      children: [
        { id: "nucleus", width: 160, height: 160 },
        { id: "electron_cloud", width: 280, height: 60 }
      ],
      edges: [
        { id: "inner_e", sources: ["nucleus"], targets: ["electron_cloud"] }
      ]
    },
    { id: "proton", width: 140, height: 140 },
    { id: "neutron", width: 140, height: 140 }
  ],
  edges: [
    { id: "e1", sources: ["atom_container"], targets: ["proton"] },
    { id: "e2", sources: ["atom_container"], targets: ["neutron"] }
  ]
};

const res = await elk.layout(graph);
console.log("Root Children:");
for (const child of res.children) {
  console.log(`Node ${child.id}: x=${child.x}, y=${child.y}, w=${child.width}, h=${child.height}`);
  if (child.children) {
    for (const sub of child.children) {
      console.log(`  -> SubNode ${sub.id}: x=${sub.x}, y=${sub.y}, w=${sub.width}, h=${sub.height}`);
    }
  }
}
