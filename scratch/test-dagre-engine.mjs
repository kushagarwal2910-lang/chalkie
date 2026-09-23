import dagre from 'dagre';

export function layoutWithDagre(lesson, viewport = { x: 40, y: 40, w: 1200, h: 800 }, options = {}) {
  const gap = options.gap ?? 32;
  const padding = options.padding ?? 40;
  const gridSize = options.gridSize ?? 24;

  const contentMaxW = Math.min(1060, Math.max(760, viewport.w - padding * 2));
  const contentMaxH = Math.min(640, Math.max(480, viewport.h - padding * 2));

  const g = new dagre.graphlib.Graph();
  const rankdir = ["process", "mechanism", "timeline"].includes(lesson.diagramType) ? "LR" : "TB";

  g.setGraph({
    rankdir,
    nodesep: Math.max(36, gap * 1.2),
    ranksep: Math.max(48, gap * 1.6),
    marginx: 0,
    marginy: 0
  });
  g.setDefaultEdgeLabel(() => ({}));

  const objMap = new Map();
  for (const obj of lesson.objects) {
    objMap.set(obj.id, obj);
    g.setNode(obj.id, {
      width: Math.max(60, obj.width),
      height: Math.max(40, obj.height)
    });
  }

  for (const conn of lesson.connections) {
    if (objMap.has(conn.from) && objMap.has(conn.to) && conn.from !== conn.to) {
      g.setEdge(conn.from, conn.to);
    }
  }

  dagre.layout(g);

  // Compute graph bounds
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
  const presentationW = Math.min(contentMaxW, viewport.w - padding * 2);
  const presentationH = Math.min(contentMaxH, viewport.h - padding * 2);
  const offsetX = viewport.x + Math.max(padding, (presentationW - graphW) / 2) - minX;
  const offsetY = viewport.y + Math.max(padding, (presentationH - graphH) / 2) - minY;

  const placedObjects = lesson.objects.map((obj) => {
    const pos = positions.get(obj.id);
    return {
      ...obj,
      x: Math.round(pos.x + offsetX),
      y: Math.round(pos.y + offsetY),
      width: pos.width,
      height: pos.height
    };
  });

  const placedObjMap = new Map(placedObjects.map((o) => [o.id, o]));

  const placedConnections = lesson.connections.map((conn) => {
    const fromObj = placedObjMap.get(conn.from);
    const toObj = placedObjMap.get(conn.to);
    const edge = g.edge(conn.from, conn.to);

    let fromAnchor = conn.fromAnchor || "bottom";
    let toAnchor = conn.toAnchor || "top";

    if (fromObj && toObj) {
      const dx = (toObj.x + toObj.width / 2) - (fromObj.x + fromObj.width / 2);
      const dy = (toObj.y + toObj.height / 2) - (fromObj.y + fromObj.height / 2);
      if (Math.abs(dx) >= Math.abs(dy)) {
        fromAnchor = dx >= 0 ? "right" : "left";
        toAnchor = dx >= 0 ? "left" : "right";
      } else {
        fromAnchor = dy >= 0 ? "bottom" : "top";
        toAnchor = dy >= 0 ? "top" : "bottom";
      }
    }

    return {
      ...conn,
      fromAnchor,
      toAnchor,
      bend: 0
    };
  });

  return {
    ...lesson,
    objects: placedObjects,
    connections: placedConnections
  };
}

// Test with atom overview
const atomLesson = {
  id: "atom",
  title: "Atom Structure Overview",
  diagramType: "structure",
  objects: [
    { id: "atom-box", label: "Atom", width: 440, height: 280, x: 0, y: 0 },
    { id: "proton", label: "Proton", width: 140, height: 140, x: 0, y: 0 },
    { id: "neutron", label: "Neutron", width: 140, height: 140, x: 0, y: 0 },
    { id: "quarks-p", label: "Proton Quarks", width: 110, height: 80, x: 0, y: 0 },
    { id: "quarks-n", label: "Neutron Quarks", width: 110, height: 80, x: 0, y: 0 }
  ],
  connections: [
    { id: "c1", from: "atom-box", to: "proton" },
    { id: "c2", from: "atom-box", to: "neutron" },
    { id: "c3", from: "proton", to: "quarks-p" },
    { id: "c4", from: "neutron", to: "quarks-n" }
  ]
};

const result = layoutWithDagre(atomLesson);
console.log("Success! Placed", result.objects.length, "objects and", result.connections.length, "connections.");
for (const obj of result.objects) {
  console.log(`- ${obj.id}: [${obj.x}, ${obj.y}, ${obj.x+obj.width}, ${obj.y+obj.height}]`);
}
