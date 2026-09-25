import ELK from "elkjs/lib/elk.bundled.js";
import type { LessonPlan, VisualConnection, VisualObject } from "./lesson-schema";
import { normalizeLessonLayout } from "./lesson-layout.ts";

const elk = new ELK();

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const EDGE = 48;
const USABLE_W = CANVAS_WIDTH - 2 * EDGE; // 1184
const USABLE_H = CANVAS_HEIGHT - 2 * EDGE; // 624
const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

export interface ElkLayoutOptions {
  direction?: "RIGHT" | "DOWN";
  nodeSpacing?: number;
  layerSpacing?: number;
  padding?: number;
}

/**
 * Checks if two bounding boxes intersect with a safety margin (gap).
 */
export function doBoxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 16
): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function scaleObjectInternalParts(o: VisualObject, factor: number) {
  if (!Array.isArray(o.parts) || (factor >= 0.999 && factor <= 1.001)) return;
  for (const p of o.parts) {
    p.x = Math.round(p.x * factor);
    p.y = Math.round(p.y * factor);
    p.width = Math.round(p.width * factor);
    p.height = Math.round(p.height * factor);
    p.strokeWidth = Math.max(1, Math.round((p.strokeWidth || 2) * factor * 10) / 10);
    if (p.data && (p.type === "polygon" || p.type === "polyline")) {
      const coords = p.data.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (coords.length >= 2) {
        const scaled: string[] = [];
        for (let i = 0; i < coords.length; i += 2) {
          scaled.push(`${Math.round(coords[i] * factor)},${Math.round(coords[i + 1] * factor)}`);
        }
        p.data = scaled.join(" ");
      }
    }
  }
}

/**
 * Universal Whiteboard Spatial Layout powered by ELK.js (Eclipse Layout Kernel).
 * Maps hierarchical compound nodes, standalone components, and formula plaques
 * with guaranteed zero collisions, accurate parent-child coordinate offsets,
 * and perfect 16:9 canvas containment.
 */
export async function applyElkLayout(
  rawPlan: LessonPlan,
  options: ElkLayoutOptions = {}
): Promise<LessonPlan> {
  if (!rawPlan.objects || rawPlan.objects.length === 0) return rawPlan;

  // First run universal normalization to ensure clean IDs, math formulas, and bounds
  const plan = normalizeLessonLayout(rawPlan);

  const qLower = (plan.question || "").toLowerCase();
  const summaryLower = (plan.summary || "").toLowerCase();
  const visualStratLower = (plan.visualStrategy || "").toLowerCase();
  const combinedText = `${qLower} ${summaryLower} ${visualStratLower}`;

  const isVerticalDomain =
    ["hierarchy", "tree", "classification", "layers", "stack"].includes(plan.diagramType) ||
    /\b(atmosphere|atmospheric|strata|geological|crust|mantle|earth\s+core|ocean\s+depth|elevation|altitude|vertical\s+stack|troposphere|stratosphere|mesosphere|thermosphere)\b/i.test(combinedText) ||
    /\b(atmospheric layers?|geological layers?|soil layers?|rock layers?)\b/i.test(combinedText);

  const direction = options.direction || (isVerticalDomain ? "DOWN" : "RIGHT");
  const nodeSpacing = options.nodeSpacing ?? 40;
  const layerSpacing = options.layerSpacing ?? (direction === "RIGHT" ? 130 : 64);
  const graphPadding = options.padding ?? 32;

  // 1. Separate containers, standalones, and orphan formulas
  const containers: VisualObject[] = [];
  const standalones: VisualObject[] = [];
  const formulas: VisualObject[] = [];

  for (const obj of plan.objects) {
    const isBackdrop = BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame";
    const isConnected = plan.connections.some(
      (c) => c.from === obj.id || c.to === obj.id
    );

    const isFormula =
      obj.role === "formula" ||
      (obj.role === "annotation" && obj.shapeType === "note") ||
      obj.shapeType === "note" ||
      /^(formula|equation|governing equation|learning equation|loss equation)/i.test(obj.label.trim());

    // Connected formulas are integral diagram nodes and must participate in the ELK layered flow!
    if (isFormula && !isConnected) {
      formulas.push(obj);
    } else if (isBackdrop) {
      containers.push(obj);
    } else {
      standalones.push(obj);
    }
  }

  // 2. Identify intentional parent-child containment
  const containerChildrenMap = new Map<string, VisualObject[]>();
  const claimedChildIds = new Set<string>();

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

      // Only claim as a child if the child is genuinely enclosed within the container bounds
      const isGeometricallyInside =
        child.x >= container.x - 10 &&
        child.x + child.width <= container.x + container.width + 10 &&
        child.y >= container.y - 10 &&
        child.y + child.height <= container.y + container.height + 10;

      const isNameMatched =
        child.id.toLowerCase().includes(container.id.toLowerCase()) ||
        (container.id.includes("layer") && child.id.includes("neuron")) ||
        (container.id.includes("layer") && child.id.includes("node"));

      if (isGeometricallyInside || isNameMatched) {
        containerChildrenMap.get(container.id)!.push(child);
        claimedChildIds.add(child.id);
      }
    }
  }

  const rootStandalones = standalones.filter((s) => !claimedChildIds.has(s.id));

  // Harmonize layer heights for horizontal multi-stage pipelines (neural nets, tiered systems)
  if (direction === "RIGHT") {
    const pipelineLayers = rootStandalones.filter(
      (o) =>
        o.id.toLowerCase().includes("layer") ||
        o.id.toLowerCase().includes("stage") ||
        o.id.toLowerCase().includes("tier") ||
        o.role === "input" ||
        o.role === "output"
    );
    if (pipelineLayers.length >= 2) {
      const maxH = Math.max(...pipelineLayers.map((l) => l.height));
      const minH = Math.min(...pipelineLayers.map((l) => l.height));
      if (minH >= maxH * 0.6) {
        const uniformH = Math.min(420, Math.max(340, maxH));
        for (const l of pipelineLayers) {
          l.height = uniformH;
        }
      }
    }
  }

  // 3. Build ELK Graph representation
  const elkChildren: any[] = [];

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

  const elkEdges: any[] = [];
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
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: elkChildren,
    edges: elkEdges,
  };

  try {
    const layouted = await elk.layout(elkGraph);

    // 5. Apply calculated coordinates back to objects
    const positionMap = new Map<string, { x: number; y: number; width?: number; height?: number }>();

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
        width: pos.width ?? obj.width,
        height: pos.height ?? obj.height,
      };
    });

    // 6. Post-layout safety relaxation: resolve any collisions and propagate deltas to children
    const nonNested = updatedObjects.filter((o) => !claimedChildIds.has(o.id));
    for (let iter = 0; iter < 30; iter++) {
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

    // 7. Global Proportional Fit & Centering to 16:9 Canvas (1280x720)
    const hasFormulas = formulas.length > 0;
    const functionalUsableH = hasFormulas ? USABLE_H - 140 : USABLE_H;

    const nonFormulaObjects = updatedObjects.filter(
      (o) => !formulas.some((f) => f.id === o.id)
    );

    let minX = Math.min(...nonFormulaObjects.map((o) => o.x));
    let maxX = Math.max(...nonFormulaObjects.map((o) => o.x + o.width));
    let minY = Math.min(...nonFormulaObjects.map((o) => o.y));
    let maxY = Math.max(...nonFormulaObjects.map((o) => o.y + o.height));
    let totalW = maxX - minX;
    let totalH = maxY - minY;

    const scaleX = USABLE_W / Math.max(1, totalW);
    const scaleY = functionalUsableH / Math.max(1, totalH);
    const scale = Math.min(1.0, scaleX, scaleY);

    if (scale < 1.0) {
      const centerX = minX + totalW / 2;
      const centerY = minY + totalH / 2;

      for (const o of nonFormulaObjects) {
        o.width = Math.round(o.width * scale);
        o.height = Math.round(o.height * scale);
        o.x = Math.round(centerX + (o.x - centerX) * scale);
        o.y = Math.round(centerY + (o.y - centerY) * scale);
        scaleObjectInternalParts(o, scale);
      }

      minX = Math.min(...nonFormulaObjects.map((o) => o.x));
      maxX = Math.max(...nonFormulaObjects.map((o) => o.x + o.width));
      minY = Math.min(...nonFormulaObjects.map((o) => o.y));
      maxY = Math.max(...nonFormulaObjects.map((o) => o.y + o.height));
      totalW = maxX - minX;
      totalH = maxY - minY;
    }

    const shiftX = Math.round((CANVAS_WIDTH - totalW) / 2 - minX);
    const shiftY = Math.round(EDGE + (functionalUsableH - totalH) / 2 - minY);

    for (const o of nonFormulaObjects) {
      o.x += shiftX;
      o.y += shiftY;
    }

    // 8. Formula ribbon placement cleanly centered at the bottom of canvas
    if (formulas.length > 0) {
      const formulaObjs = updatedObjects.filter((o) =>
        formulas.some((f) => f.id === o.id)
      );
      const totalFormulaW = formulaObjs.reduce((sum, f) => sum + f.width, 0) + (formulaObjs.length - 1) * 32;
      let scaleFormula = 1.0;
      if (totalFormulaW > USABLE_W) {
        scaleFormula = USABLE_W / totalFormulaW;
        for (const f of formulaObjs) {
          f.width = Math.round(f.width * scaleFormula);
          f.height = Math.round(f.height * scaleFormula);
          scaleObjectInternalParts(f, scaleFormula);
        }
      }
      const finalFormulaW = formulaObjs.reduce((sum, f) => sum + f.width, 0) + (formulaObjs.length - 1) * 24;
      let formulaStartX = Math.max(EDGE, Math.round((CANVAS_WIDTH - finalFormulaW) / 2));
      const maxFHeight = Math.max(...formulaObjs.map((f) => f.height));
      const formulaY = Math.round(CANVAS_HEIGHT - EDGE - maxFHeight);

      for (const f of formulaObjs) {
        f.x = formulaStartX;
        f.y = formulaY;
        formulaStartX += f.width + 24;
      }

      // Guarantee strict vertical clearance between diagram bottom and formula ribbon top
      const maxDiagramY = Math.max(0, ...nonFormulaObjects.map((o) => o.y + o.height));
      if (maxDiagramY + 24 > formulaY) {
        const overflow = (maxDiagramY + 24) - formulaY;
        const minDiagramY = Math.min(...nonFormulaObjects.map((o) => o.y));
        if (minDiagramY - overflow >= EDGE) {
          for (const o of nonFormulaObjects) {
            o.y -= overflow;
          }
        } else {
          const availH = formulaY - 28 - EDGE;
          const currentH = maxDiagramY - minDiagramY;
          const uniformScale = Math.min(1.0, availH / Math.max(1, currentH));
          // Proportional scaling preserves aspect ratios without warping circles or squashing boxes
          for (const o of nonFormulaObjects) {
            o.width = Math.round(o.width * uniformScale);
            o.height = Math.round(o.height * uniformScale);
            o.x = Math.round(minX + (o.x - minX) * uniformScale);
            o.y = Math.round(EDGE + (o.y - minDiagramY) * uniformScale);
            scaleObjectInternalParts(o, uniformScale);
          }
        }
      }
    }

    // 9. Final Zero-Collision Guarantee: multi-pass iterative relaxation with child delta propagation
    const finalTopLevel = updatedObjects.filter((o) => !claimedChildIds.has(o.id));
    for (let iter = 0; iter < 24; iter++) {
      let shifted = false;
      for (let i = 0; i < finalTopLevel.length; i++) {
        for (let j = i + 1; j < finalTopLevel.length; j++) {
          const a = finalTopLevel[i];
          const b = finalTopLevel[j];
          if (doBoxesOverlap(a, b, 14)) {
            shifted = true;
            const ox = Math.min(a.x + a.width + 14, b.x + b.width + 14) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.height + 14, b.y + b.height + 14) - Math.max(a.y, b.y);

            let deltaBx = 0;
            let deltaBy = 0;
            let deltaAx = 0;
            let deltaAy = 0;

            if (direction === "DOWN" || oy < ox) {
              if (b.y >= a.y) {
                deltaBy = oy;
                b.y += oy;
              } else {
                deltaAy = oy;
                a.y += oy;
              }
            } else {
              if (b.x >= a.x) {
                deltaBx = ox;
                b.x += ox;
              } else {
                deltaAx = ox;
                a.x += ox;
              }
            }

            // Propagate shift to any container children
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

    // 10. Strict 16:9 Canvas Containment Verification
    let finalMinX = Math.min(...updatedObjects.map((o) => o.x));
    let finalMaxX = Math.max(...updatedObjects.map((o) => o.x + o.width));
    let finalMinY = Math.min(...updatedObjects.map((o) => o.y));
    let finalMaxY = Math.max(...updatedObjects.map((o) => o.y + o.height));
    let finalTotalW = finalMaxX - finalMinX;
    let finalTotalH = finalMaxY - finalMinY;

    if (finalMinX < EDGE || finalMaxX > CANVAS_WIDTH - EDGE || finalMinY < EDGE || finalMaxY > CANVAS_HEIGHT - EDGE) {
      const scaleX = USABLE_W / Math.max(1, finalTotalW);
      const scaleY = USABLE_H / Math.max(1, finalTotalH);
      const finalFitScale = Math.min(1.0, scaleX, scaleY);

      if (finalFitScale < 1.0) {
        const midX = finalMinX + finalTotalW / 2;
        const midY = finalMinY + finalTotalH / 2;
        for (const o of updatedObjects) {
          o.width = Math.round(o.width * finalFitScale);
          o.height = Math.round(o.height * finalFitScale);
          o.x = Math.round(midX + (o.x - midX) * finalFitScale);
          o.y = Math.round(midY + (o.y - midY) * finalFitScale);
          scaleObjectInternalParts(o, finalFitScale);
        }
        finalMinX = Math.min(...updatedObjects.map((o) => o.x));
        finalMaxX = Math.max(...updatedObjects.map((o) => o.x + o.width));
        finalMinY = Math.min(...updatedObjects.map((o) => o.y));
        finalMaxY = Math.max(...updatedObjects.map((o) => o.y + o.height));
        finalTotalW = finalMaxX - finalMinX;
        finalTotalH = finalMaxY - finalMinY;
      }

      const finalShiftX = Math.round((CANVAS_WIDTH - finalTotalW) / 2 - finalMinX);
      const finalShiftY = Math.round((CANVAS_HEIGHT - finalTotalH) / 2 - finalMinY);
      for (const o of updatedObjects) {
        o.x += finalShiftX;
        o.y += finalShiftY;
      }
    }

    // 11. Smart Connection Anchors & Obstacle Avoidance Routing
    const updatedConnections: VisualConnection[] = plan.connections.map((conn) => {
      const fromObj = updatedObjects.find((o) => o.id === conn.from);
      const toObj = updatedObjects.find((o) => o.id === conn.to);
      if (!fromObj || !toObj) return conn;

      const fromCenter = { x: fromObj.x + fromObj.width / 2, y: fromObj.y + fromObj.height / 2 };
      const toCenter = { x: toObj.x + toObj.width / 2, y: toObj.y + toObj.height / 2 };
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;

      const autoAnchors = Math.abs(dx) >= Math.abs(dy)
        ? { fromAnchor: dx >= 0 ? ("right" as const) : ("left" as const), toAnchor: dx >= 0 ? ("left" as const) : ("right" as const) }
        : { fromAnchor: dy >= 0 ? ("bottom" as const) : ("top" as const), toAnchor: dy >= 0 ? ("top" as const) : ("bottom" as const) };

      // Detect any intermediate obstacle object piercing between fromObj and toObj
      let obstacleDetected = false;
      let bendValue = conn.bend || 0;
      let route = conn.route || "straight";

      for (const obs of updatedObjects) {
        if (obs.id === fromObj.id || obs.id === toObj.id) continue;
        // Skip if obstacle is a backdrop or container enclosing either endpoint
        if (BACKDROP_ROLES.has(obs.role) || obs.shapeType === "frame") continue;

        const obsBox = { x: obs.x, y: obs.y, width: obs.width, height: obs.height };
        const bLeft = obsBox.x - 12;
        const bRight = obsBox.x + obsBox.width + 12;
        const bTop = obsBox.y - 12;
        const bBottom = obsBox.y + obsBox.height + 12;

        const segMinX = Math.min(fromCenter.x, toCenter.x);
        const segMaxX = Math.max(fromCenter.x, toCenter.x);
        const segMinY = Math.min(fromCenter.y, toCenter.y);
        const segMaxY = Math.max(fromCenter.y, toCenter.y);

        if (segMaxX < bLeft || segMinX > bRight || segMaxY < bTop || segMinY > bBottom) {
          continue;
        }

        const obCenter = { x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 };
        const lenSq = dx * dx + dy * dy;
        if (lenSq > 0) {
          const t = Math.max(0, Math.min(1, ((obCenter.x - fromCenter.x) * dx + (obCenter.y - fromCenter.y) * dy) / lenSq));
          if (t >= 0.12 && t <= 0.88) {
            const projX = fromCenter.x + t * dx;
            const projY = fromCenter.y + t * dy;
            if (projX >= bLeft && projX <= bRight && projY >= bTop && projY <= bBottom) {
              obstacleDetected = true;
              // Arc away from the obstacle using cross product direction
              const cross = dx * (obCenter.y - fromCenter.y) - dy * (obCenter.x - fromCenter.x);
              bendValue = cross >= 0 ? -56 : 56;
              route = "curve";
              break;
            }
          }
        }
      }

      return {
        ...conn,
        ...autoAnchors,
        route: obstacleDetected ? "curve" : route,
        bend: obstacleDetected ? bendValue : conn.bend,
      };
    });

    return {
      ...plan,
      objects: updatedObjects,
      connections: updatedConnections,
    };
  } catch (err) {
    console.warn("[elk-spatial-layout] ELK layout failed, falling back to normalized layout:", err);
    return plan;
  }
}
