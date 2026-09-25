import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const EDGE = 48;
const USABLE_W = CANVAS_WIDTH - 2 * EDGE; // 1184
const USABLE_H = CANVAS_HEIGHT - 2 * EDGE; // 624

function doBoxesOverlap(a, b, gap = 16) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

export async function layoutWithElk(plan, options = {}) {
  if (!plan.objects || plan.objects.length === 0) return plan;

  const qLower = (plan.question || "").toLowerCase();
  const summaryLower = (plan.summary || "").toLowerCase();
  const visualStratLower = (plan.visualStrategy || "").toLowerCase();
  const combinedText = `${qLower} ${summaryLower} ${visualStratLower}`;

  const isVerticalDomain =
    ["hierarchy", "tree", "classification", "layers", "stack"].includes(plan.diagramType) ||
    /\b(atmosphere|atmospheric|layer|strata|geological|crust|mantle|core|ocean\s+depth|elevation|altitude|depth|vertical|pyramid|stack)\b/i.test(combinedText);

  const direction = options.direction || (isVerticalDomain ? "DOWN" : "RIGHT");
  const nodeSpacing = options.nodeSpacing ?? 48;
  const layerSpacing = options.layerSpacing ?? 84;
  const graphPadding = options.padding ?? 40;

  // 1. Separate containers, standalones, and formulas
  const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);
  const containers = [];
  const standalones = [];
  const formulas = [];

  for (const obj of plan.objects) {
    const isBackdrop = BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame";
    const isFormula =
      obj.role === "formula" ||
      (obj.role === "annotation" && obj.shapeType === "note") ||
      obj.shapeType === "note" ||
      /^(formula|equation|governing equation|learning equation|loss equation)/i.test(obj.label.trim());

    if (isFormula) {
      formulas.push(obj);
    } else if (isBackdrop) {
      containers.push(obj);
    } else {
      standalones.push(obj);
    }
  }

  // 2. Identify intentional parent-child containment
  const containerChildrenMap = new Map();
  const claimedChildIds = new Set();

  for (const container of containers) {
    containerChildrenMap.set(container.id, []);
    const cBounds = {
      left: container.x - 30,
      right: container.x + container.width + 30,
      top: container.y - 30,
      bottom: container.y + container.height + 30,
    };

    for (const child of standalones) {
      if (claimedChildIds.has(child.id)) continue;

      const childCx = child.x + child.width / 2;
      const childCy = child.y + child.height / 2;
      const isGeometricallyInside =
        childCx >= cBounds.left && childCx <= cBounds.right &&
        childCy >= cBounds.top && childCy <= cBounds.bottom;

      const isNameMatched =
        child.id.toLowerCase().includes(container.id.toLowerCase()) ||
        (container.id.includes("layer") && child.id.includes("neuron")) ||
        (container.id.includes("layer") && child.id.includes("node"));

      if (isGeometricallyInside || isNameMatched) {
        containerChildrenMap.get(container.id).push(child);
        claimedChildIds.add(child.id);
      }
    }
  }

  const rootStandalones = standalones.filter((s) => !claimedChildIds.has(s.id));

  // 3. Build ELK Graph representation
  const elkChildren = [];

  for (const container of containers) {
    const children = containerChildrenMap.get(container.id) || [];
    if (children.length > 0) {
      const isNeuralLayer =
        container.id.toLowerCase().includes("layer") &&
        children.some(
          (ch) =>
            ch.id.toLowerCase().includes("neuron") ||
            ch.id.toLowerCase().includes("node") ||
            ch.parts?.some((p) => p.type === "ellipse")
        );

      elkChildren.push({
        id: container.id,
        width: Math.max(160, container.width),
        height: Math.max(100, container.height),
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": isNeuralLayer ? "DOWN" : (direction === "DOWN" ? "RIGHT" : "DOWN"),
          "elk.padding": "[top=64,left=28,bottom=28,right=28]",
          "elk.spacing.nodeNode": "24",
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": `(${Math.max(160, container.width)}, ${Math.max(100, container.height)})`,
        },
        children: children.map((c) => ({
          id: c.id,
          width: Math.max(48, c.width),
          height: Math.max(36, c.height),
        })),
      });
    } else {
      elkChildren.push({
        id: container.id,
        width: Math.max(160, container.width),
        height: Math.max(100, container.height),
      });
    }
  }

  for (const obj of rootStandalones) {
    elkChildren.push({
      id: obj.id,
      width: Math.max(80, obj.width),
      height: Math.max(60, obj.height),
    });
  }

  // 4. Map connections to ELK edges
  const allKnownIds = new Set([
    ...containers.map((c) => c.id),
    ...standalones.map((s) => s.id),
  ]);

  const elkEdges = [];
  for (const conn of plan.connections) {
    if (allKnownIds.has(conn.from) && allKnownIds.has(conn.to) && conn.from !== conn.to) {
      elkEdges.push({
        id: conn.id,
        sources: [conn.from],
        targets: [conn.to],
      });
    }
  }

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": String(nodeSpacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
      "elk.padding": `[top=${graphPadding},left=${graphPadding},bottom=${graphPadding},right=${graphPadding}]`,
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "SPLINES",
    },
    children: elkChildren,
    edges: elkEdges,
  };

  try {
    const layouted = await elk.layout(elkGraph);

    // 5. Apply calculated coordinates back to objects
    const positionMap = new Map();

    for (const node of layouted.children || []) {
      positionMap.set(node.id, {
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: Math.round(node.width),
        height: Math.round(node.height),
      });

      if (node.children) {
        for (const sub of node.children) {
          positionMap.set(sub.id, {
            x: Math.round(node.x + sub.x),
            y: Math.round(node.y + sub.y),
            width: Math.round(sub.width),
            height: Math.round(sub.height),
          });
        }
      }
    }

    const updatedObjects = plan.objects.map((obj) => {
      const pos = positionMap.get(obj.id);
      if (!pos) return { ...obj };

      return {
        ...obj,
        x: pos.x,
        y: pos.y,
        width: pos.width && pos.width > obj.width ? pos.width : obj.width,
        height: pos.height && pos.height > obj.height ? pos.height : obj.height,
      };
    });

    // 6. Post-layout safety relaxation: resolve any collisions and propagate deltas to children
    const nonNested = updatedObjects.filter((o) => !claimedChildIds.has(o.id));
    for (let iter = 0; iter < 10; iter++) {
      let shifted = false;
      for (let i = 0; i < nonNested.length; i++) {
        for (let j = i + 1; j < nonNested.length; j++) {
          const a = nonNested[i];
          const b = nonNested[j];
          if (doBoxesOverlap(a, b, 24)) {
            shifted = true;
            const ox = Math.min(a.x + a.width + 24, b.x + b.width + 24) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.height + 24, b.y + b.height + 24) - Math.max(a.y, b.y);

            let deltaBx = 0;
            let deltaBy = 0;
            let deltaAx = 0;
            let deltaAy = 0;

            if (direction === "DOWN" || oy < ox) {
              if (b.y >= a.y) {
                const newY = a.y + a.height + 36;
                deltaBy = newY - b.y;
                b.y = newY;
              } else {
                const newY = b.y + b.height + 36;
                deltaAy = newY - a.y;
                a.y = newY;
              }
            } else {
              if (b.x >= a.x) {
                const newX = a.x + a.width + 36;
                deltaBx = newX - b.x;
                b.x = newX;
              } else {
                const newX = b.x + b.width + 36;
                deltaAx = newX - a.x;
                a.x = newX;
              }
            }

            // Propagate shift to children
            if (deltaBx !== 0 || deltaBy !== 0) {
              const bChildren = containerChildrenMap.get(b.id) || [];
              for (const ch of bChildren) {
                const targetObj = updatedObjects.find((o) => o.id === ch.id);
                if (targetObj) {
                  targetObj.x += deltaBx;
                  targetObj.y += deltaBy;
                }
              }
            }
            if (deltaAx !== 0 || deltaAy !== 0) {
              const aChildren = containerChildrenMap.get(a.id) || [];
              for (const ch of aChildren) {
                const targetObj = updatedObjects.find((o) => o.id === ch.id);
                if (targetObj) {
                  targetObj.x += deltaAx;
                  targetObj.y += deltaAy;
                }
              }
            }
          }
        }
      }
      if (!shifted) break;
    }

    // 7. Formula ribbon placement at bottom of canvas
    if (formulas.length > 0) {
      const formulaObjs = updatedObjects.filter((o) =>
        formulas.some((f) => f.id === o.id)
      );
      const totalFormulaW = formulaObjs.reduce((sum, f) => sum + f.width, 0) + (formulaObjs.length - 1) * 32;
      let formulaStartX = Math.max(EDGE, Math.round((CANVAS_WIDTH - totalFormulaW) / 2));
      const formulaY = Math.round(CANVAS_HEIGHT - EDGE - Math.max(...formulaObjs.map((f) => f.height)));

      for (const f of formulaObjs) {
        f.x = formulaStartX;
        f.y = formulaY;
        formulaStartX += f.width + 32;
      }
    }

    // 8. Global Proportional Fit & Centering to 16:9 Canvas (1280x720)
    let minX = Math.min(...updatedObjects.map((o) => o.x));
    let maxX = Math.max(...updatedObjects.map((o) => o.x + o.width));
    let minY = Math.min(...updatedObjects.map((o) => o.y));
    let maxY = Math.max(...updatedObjects.map((o) => o.y + o.height));
    let totalW = maxX - minX;
    let totalH = maxY - minY;

    const scaleX = USABLE_W / Math.max(1, totalW);
    const scaleY = USABLE_H / Math.max(1, totalH);
    const scale = Math.min(1.0, scaleX, scaleY);

    if (scale < 1.0) {
      const centerX = minX + totalW / 2;
      const centerY = minY + totalH / 2;

      for (const o of updatedObjects) {
        o.width = Math.round(o.width * scale);
        o.height = Math.round(o.height * scale);
        o.x = Math.round(centerX + (o.x - centerX) * scale);
        o.y = Math.round(centerY + (o.y - centerY) * scale);
      }

      minX = Math.min(...updatedObjects.map((o) => o.x));
      maxX = Math.max(...updatedObjects.map((o) => o.x + o.width));
      minY = Math.min(...updatedObjects.map((o) => o.y));
      maxY = Math.max(...updatedObjects.map((o) => o.y + o.height));
      totalW = maxX - minX;
      totalH = maxY - minY;
    }

    const shiftX = Math.round((CANVAS_WIDTH - totalW) / 2 - minX);
    const shiftY = Math.round((CANVAS_HEIGHT - totalH) / 2 - minY);

    for (const o of updatedObjects) {
      o.x += shiftX;
      o.y += shiftY;
    }

    // 9. Update Connection Anchors to Match Final Geometry
    const updatedConnections = plan.connections.map((conn) => {
      const fromObj = updatedObjects.find((o) => o.id === conn.from);
      const toObj = updatedObjects.find((o) => o.id === conn.to);
      if (!fromObj || !toObj) return conn;

      const dx = (toObj.x + toObj.width / 2) - (fromObj.x + fromObj.width / 2);
      const dy = (toObj.y + toObj.height / 2) - (fromObj.y + fromObj.height / 2);

      const autoAnchors = Math.abs(dx) >= Math.abs(dy)
        ? { fromAnchor: dx >= 0 ? "right" : "left", toAnchor: dx >= 0 ? "left" : "right" }
        : { fromAnchor: dy >= 0 ? "bottom" : "top", toAnchor: dy >= 0 ? "top" : "bottom" };

      return {
        ...conn,
        ...autoAnchors,
      };
    });

    return {
      ...plan,
      objects: updatedObjects,
      connections: updatedConnections,
    };
  } catch (err) {
    console.warn("[elk-spatial-layout] ELK layout failed, retaining original coordinates:", err);
    return plan;
  }
}

// Test with 3 sample diagrams:
// 1. Solar eclipse
const eclipsePlan = {
  id: "test-eclipse",
  diagramType: "spatial",
  objects: [
    { id: "sun", role: "subject", label: "Sun", width: 180, height: 180, x: 100, y: 100 },
    { id: "moon", role: "component", label: "Moon", width: 120, height: 120, x: 200, y: 100 },
    { id: "earth", role: "subject", label: "Earth", width: 160, height: 160, x: 300, y: 100 },
  ],
  connections: [
    { id: "c1", from: "sun", to: "moon", fromAnchor: "right", toAnchor: "left" },
    { id: "c2", from: "moon", to: "earth", fromAnchor: "right", toAnchor: "left" },
  ],
};

// 2. Neural Net with Layers and Neurons
const nnPlan = {
  id: "test-nn",
  diagramType: "system",
  objects: [
    { id: "input-layer", role: "container", label: "Input Layer", width: 180, height: 320, x: 100, y: 100 },
    { id: "x1", role: "component", label: "x1", width: 60, height: 60, x: 120, y: 120 },
    { id: "x2", role: "component", label: "x2", width: 60, height: 60, x: 120, y: 200 },
    { id: "hidden-layer", role: "container", label: "Hidden Layer", width: 180, height: 320, x: 400, y: 100 },
    { id: "h1", role: "component", label: "h1", width: 60, height: 60, x: 420, y: 120 },
    { id: "h2", role: "component", label: "h2", width: 60, height: 60, x: 420, y: 200 },
    { id: "formula-card", role: "formula", label: "y = Wx + b", width: 320, height: 100, x: 200, y: 500 },
  ],
  connections: [
    { id: "c1", from: "input-layer", to: "hidden-layer" },
  ],
};

console.log("=== Testing Eclipse Plan ===");
const res1 = await layoutWithElk(eclipsePlan);
console.log(res1.objects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })));
console.log(res1.connections);

console.log("\n=== Testing Neural Net Plan ===");
const res2 = await layoutWithElk(nnPlan);
console.log(res2.objects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.width, h: o.height })));
console.log(res2.connections);
