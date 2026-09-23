import dagre from 'dagre';

// Simulate the lesson from the user's screenshot
const testLesson = {
  id: "atom-overview",
  title: "Atom Structure Overview",
  diagramType: "structure",
  objects: [
    {
      id: "atom-main",
      label: "Atom",
      role: "container",
      width: 440,
      height: 280,
      x: 0,
      y: 0
    },
    {
      id: "proton-node",
      label: "Proton",
      role: "component",
      width: 130,
      height: 130,
      x: 0,
      y: 0
    },
    {
      id: "neutron-node",
      label: "Neutron",
      role: "component",
      width: 130,
      height: 130,
      x: 0,
      y: 0
    },
    {
      id: "proton-quarks",
      label: "Proton Quarks",
      role: "component",
      width: 100,
      height: 70,
      x: 0,
      y: 0
    },
    {
      id: "neutron-quarks",
      label: "Neutron Quarks",
      role: "component",
      width: 100,
      height: 70,
      x: 0,
      y: 0
    }
  ],
  connections: [
    { id: "c1", from: "atom-main", to: "proton-node", label: "" },
    { id: "c2", from: "atom-main", to: "neutron-node", label: "" },
    { id: "c3", from: "proton-node", to: "proton-quarks", label: "quarks" },
    { id: "c4", from: "neutron-node", to: "neutron-quarks", label: "quarks" }
  ]
};

function runDagreLayout(lesson, viewport = { x: 40, y: 40, w: 1200, h: 800 }) {
  const g = new dagre.graphlib.Graph();
  const rankdir = ["process", "mechanism", "timeline"].includes(lesson.diagramType) ? "LR" : "TB";
  
  g.setGraph({
    rankdir,
    nodesep: 44,
    ranksep: 56,
    marginx: 0,
    marginy: 0
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const obj of lesson.objects) {
    g.setNode(obj.id, { width: obj.width, height: obj.height });
  }

  for (const conn of lesson.connections) {
    g.setEdge(conn.from, conn.to);
  }

  dagre.layout(g);

  // Compute graph total bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const positions = new Map();

  for (const obj of lesson.objects) {
    const node = g.node(obj.id);
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;
    positions.set(obj.id, { x, y, width: node.width, height: node.height });
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + node.width > maxX) maxX = x + node.width;
    if (y + node.height > maxY) maxY = y + node.height;
  }

  const graphW = maxX - minX;
  const graphH = maxY - minY;

  // Center within viewport presentation area
  const presentationW = Math.min(1060, viewport.w - 80);
  const presentationH = Math.min(640, viewport.h - 80);
  const offsetX = viewport.x + Math.max(40, (presentationW - graphW) / 2) - minX;
  const offsetY = viewport.y + Math.max(40, (presentationH - graphH) / 2) - minY;

  const placedObjects = lesson.objects.map((obj) => {
    const pos = positions.get(obj.id);
    return {
      ...obj,
      x: Math.round(pos.x + offsetX),
      y: Math.round(pos.y + offsetY)
    };
  });

  const placedConnections = lesson.connections.map((conn) => {
    const fromObj = placedObjects.find((o) => o.id === conn.from);
    const toObj = placedObjects.find((o) => o.id === conn.to);
    const edge = g.edge(conn.from, conn.to);
    
    // Automatically determine anchors from edge direction
    let fromAnchor = "bottom";
    let toAnchor = "top";
    if (fromObj && toObj) {
      const dx = (toObj.x + toObj.width/2) - (fromObj.x + fromObj.width/2);
      const dy = (toObj.y + toObj.height/2) - (fromObj.y + fromObj.height/2);
      if (Math.abs(dx) > Math.abs(dy)) {
        fromAnchor = dx > 0 ? "right" : "left";
        toAnchor = dx > 0 ? "left" : "right";
      } else {
        fromAnchor = dy > 0 ? "bottom" : "top";
        toAnchor = dy > 0 ? "top" : "bottom";
      }
    }

    return {
      ...conn,
      fromAnchor,
      toAnchor,
      points: edge ? edge.points.map(p => ({ x: Math.round(p.x + offsetX), y: Math.round(p.y + offsetY) })) : []
    };
  });

  return { objects: placedObjects, connections: placedConnections, graphW, graphH };
}

const result = runDagreLayout(testLesson);
console.log("=== DAGRE GRAPH AUTO-LAYOUT RESULT ===");
console.log(`Total Graph Size: ${result.graphW}x${result.graphH}`);
console.log("\nPlaced Objects:");
for (const obj of result.objects) {
  console.log(`- ${obj.id} (${obj.label}): x=${obj.x}, y=${obj.y}, w=${obj.width}, h=${obj.height} -> Box [${obj.x}, ${obj.y}, ${obj.x+obj.width}, ${obj.y+obj.height}]`);
}

console.log("\nConnections:");
for (const conn of result.connections) {
  console.log(`- ${conn.id}: ${conn.from} (${conn.fromAnchor}) -> ${conn.to} (${conn.toAnchor}), points=${JSON.stringify(conn.points)}`);
}

// Check for any overlaps
let overlaps = 0;
for (let i = 0; i < result.objects.length; i++) {
  for (let j = i + 1; j < result.objects.length; j++) {
    const a = result.objects[i];
    const b = result.objects[j];
    const collide = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    if (collide) {
      console.error(`COLLISION between ${a.id} and ${b.id}`);
      overlaps++;
    }
  }
}
console.log(`\nTotal collisions detected: ${overlaps}`);
