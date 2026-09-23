import dagre from 'dagre';

function layoutConnectedLessonWithDagre(lesson, viewport, options = {}, occupiedBoxes = []) {
  const gap = options.gap ?? 32;
  const padding = options.padding ?? 40;
  const gridSize = options.gridSize ?? 24;

  const contentMaxW = Math.min(1060, Math.max(760, viewport.w - padding * 2));
  const contentMaxH = Math.min(640, Math.max(480, viewport.h - padding * 2));

  const g = new dagre.graphlib.Graph();
  const rankdir = ["process", "mechanism", "timeline"].includes(lesson.diagramType) ? "LR" : "TB";

  g.setGraph({
    rankdir,
    nodesep: Math.max(40, gap * 1.3),
    ranksep: Math.max(52, gap * 1.7),
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const objMap = new Map();
  for (const obj of lesson.objects) {
    objMap.set(obj.id, obj);
    g.setNode(obj.id, {
      width: Math.max(60, obj.width),
      height: Math.max(40, obj.height),
    });
  }

  for (const conn of lesson.connections) {
    if (objMap.has(conn.from) && objMap.has(conn.to) && conn.from !== conn.to) {
      g.setEdge(conn.from, conn.to);
    }
  }

  dagre.layout(g);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const positions = new Map();

  for (const obj of lesson.objects) {
    const node = g.node(obj.id);
    if (!node) continue;
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

  const presentationW = Math.min(contentMaxW, viewport.w - padding * 2);
  const presentationH = Math.min(contentMaxH, viewport.h - padding * 2);
  let offsetX = viewport.x + Math.max(padding, (presentationW - graphW) / 2) - minX;
  let offsetY = viewport.y + Math.max(padding, (presentationH - graphH) / 2) - minY;

  if (occupiedBoxes.length > 0) {
    const lowestOccupiedY = occupiedBoxes.reduce((max, b) => Math.max(max, b.y + b.h), viewport.y + padding);
    if (offsetY < lowestOccupiedY + gap) {
      offsetY = lowestOccupiedY + gap;
    }
  }

  const placedObjects = lesson.objects.map((obj) => {
    const pos = positions.get(obj.id);
    if (!pos) return obj;
    return {
      ...obj,
      x: Math.round(pos.x + offsetX),
      y: Math.round(pos.y + offsetY),
      width: pos.width,
      height: pos.height,
    };
  });

  const placedObjMap = new Map(placedObjects.map((o) => [o.id, o]));

  const placedConnections = lesson.connections.map((conn) => {
    const fromObj = placedObjMap.get(conn.from);
    const toObj = placedObjMap.get(conn.to);

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
      bend: 0,
    };
  });

  return {
    ...lesson,
    objects: placedObjects,
    connections: placedConnections,
  };
}

const viewport = { x: 40, y: 40, w: 1280, h: 800 };
const atomLesson = {
  id: "atom",
  title: "Atom Overview",
  diagramType: "structure",
  objects: [
    { id: "atom-main", label: "Atom", width: 440, height: 280, x: 0, y: 0 },
    { id: "proton", label: "Proton", width: 140, height: 140, x: 0, y: 0 },
    { id: "neutron", label: "Neutron", width: 140, height: 140, x: 0, y: 0 },
    { id: "quarks-p", label: "Proton Quarks", width: 110, height: 80, x: 0, y: 0 },
    { id: "quarks-n", label: "Neutron Quarks", width: 110, height: 80, x: 0, y: 0 }
  ],
  connections: [
    { id: "c1", from: "atom-main", to: "proton" },
    { id: "c2", from: "atom-main", to: "neutron" },
    { id: "c3", from: "proton", to: "quarks-p" },
    { id: "c4", from: "neutron", to: "quarks-n" }
  ]
};

const res = layoutConnectedLessonWithDagre(atomLesson, viewport);
console.log("DAGRE Layout Validation:");
for (const o of res.objects) {
  console.log(`- ${o.id}: [${o.x}, ${o.y}, ${o.x + o.width}, ${o.y + o.height}]`);
}
for (const c of res.connections) {
  console.log(`- Connection ${c.id}: ${c.from} (${c.fromAnchor}) -> ${c.to} (${c.toAnchor})`);
}
