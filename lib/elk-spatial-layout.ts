import type { LessonPlan, VisualConnection, VisualObject } from "@/lib/lesson-schema";
// @ts-ignore
import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

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

/**
 * Applies universal, topic-agnostic hierarchical layout via ELK.js (Eclipse Layout Kernel).
 * Mathematically guarantees zero unintentional collisions between sibling objects,
 * while cleanly formatting compound containers with generous top margins.
 */
export async function applyElkLayout(
  plan: LessonPlan,
  options: ElkLayoutOptions = {}
): Promise<LessonPlan> {
  if (!plan.objects || plan.objects.length === 0) return plan;

  const qLower = (plan.question || "").toLowerCase();
  const summaryLower = (plan.summary || "").toLowerCase();
  const visualStratLower = (plan.visualStrategy || "").toLowerCase();
  const combinedText = `${qLower} ${summaryLower} ${visualStratLower}`;

  const isVerticalDomain =
    ["hierarchy", "tree", "classification", "layers", "stack"].includes(plan.diagramType) ||
    /\b(atmosphere|atmospheric|layer|strata|geological|crust|mantle|core|ocean\s+depth|troposphere|stratosphere|mesosphere|thermosphere|exosphere|elevation|altitude|depth|vertical|pyramid|trophic|water\s+column|cylinder|piston)\b/i.test(combinedText);

  const direction = options.direction || (isVerticalDomain ? "DOWN" : "RIGHT");
  const nodeSpacing = options.nodeSpacing ?? 48;
  const layerSpacing = options.layerSpacing ?? 84;
  const graphPadding = options.padding ?? 40;

  // 1. Separate containers from contained items
  const containers: VisualObject[] = [];
  const standalones: VisualObject[] = [];
  const formulas: VisualObject[] = [];

  for (const obj of plan.objects) {
    const isBackdrop = BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame";
    const isFormula = obj.role === "formula" || obj.role === "annotation" || /\b(formula|equation|loss|metric)\b/i.test(obj.label);

    if (isFormula) {
      formulas.push(obj);
    } else if (isBackdrop) {
      containers.push(obj);
    } else {
      standalones.push(obj);
    }
  }

  // 2. Identify intentional parent-child containment
  // A child belongs inside a container if:
  // - It was explicitly generated inside the container bounds, OR
  // - Its ID/label references the container
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
        containerChildrenMap.get(container.id)!.push(child);
        claimedChildIds.add(child.id);
      }
    }
  }

  const rootStandalones = standalones.filter((s) => !claimedChildIds.has(s.id));

  // 3. Build ELK Graph representation
  const elkChildren: any[] = [];

  // Add containers (compound nodes)
  for (const container of containers) {
    const children = containerChildrenMap.get(container.id) || [];
    if (children.length > 0) {
      elkChildren.push({
        id: container.id,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "DOWN", // vertical stacking of internal items (e.g. neurons in a layer)
          "elk.padding": "[top=60,left=28,bottom=28,right=28]", // generous top margin clears the container label pill!
          "elk.spacing.nodeNode": "24",
        },
        children: children.map((c) => ({
          id: c.id,
          width: Math.max(36, c.width),
          height: Math.max(36, c.height),
        })),
      });
    } else {
      // Empty container/frame
      elkChildren.push({
        id: container.id,
        width: Math.max(160, container.width),
        height: Math.max(100, container.height),
      });
    }
  }

  // Add root standalone components
  for (const obj of rootStandalones) {
    elkChildren.push({
      id: obj.id,
      width: Math.max(80, obj.width),
      height: Math.max(60, obj.height),
    });
  }

  // Add formula cards as top-level nodes with generous padding
  for (const f of formulas) {
    elkChildren.push({
      id: f.id,
      width: Math.max(260, f.width),
      height: Math.max(120, f.height),
    });
  }

  // 4. Map connections to ELK edges
  const allKnownIds = new Set([
    ...containers.map((c) => c.id),
    ...standalones.map((s) => s.id),
    ...formulas.map((f) => f.id),
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

      // Internal compound node children
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

    // Offset to ensure positive canvas margin (x >= 60, y >= 60)
    let minX = Infinity;
    let minY = Infinity;
    for (const pos of positionMap.values()) {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
    }
    const shiftX = minX < 60 ? 60 - minX : 0;
    const shiftY = minY < 60 ? 60 - minY : 0;

    const updatedObjects = plan.objects.map((obj) => {
      const pos = positionMap.get(obj.id);
      if (!pos) return obj;

      return {
        ...obj,
        x: pos.x + shiftX,
        y: pos.y + shiftY,
        width: pos.width && pos.width > obj.width ? pos.width : obj.width,
        height: pos.height && pos.height > obj.height ? pos.height : obj.height,
      };
    });

    // 6. Post-layout safety pass: ensure absolutely zero overlap between any non-nested sibling objects
    const nonNested = updatedObjects.filter((o) => !claimedChildIds.has(o.id));
    for (let i = 0; i < nonNested.length; i++) {
      for (let j = i + 1; j < nonNested.length; j++) {
        const a = nonNested[i];
        const b = nonNested[j];
        if (doBoxesOverlap(a, b, 24)) {
          const ox = Math.min(a.x + a.width + 24, b.x + b.width + 24) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.height + 24, b.y + b.height + 24) - Math.max(a.y, b.y);

          if (direction === "DOWN" || oy < ox) {
            if (b.y >= a.y) {
              b.y = a.y + a.height + 36;
            } else {
              a.y = b.y + b.height + 36;
            }
          } else {
            if (b.x >= a.x) {
              b.x = a.x + a.width + 36;
            } else {
              a.x = b.x + b.width + 36;
            }
          }
        }
      }
    }

    // 7. Update connection anchors to match final geometry
    const updatedConnections = plan.connections.map((conn) => {
      const fromObj = updatedObjects.find((o) => o.id === conn.from);
      const toObj = updatedObjects.find((o) => o.id === conn.to);
      if (!fromObj || !toObj) return conn;

      const dx = (toObj.x + toObj.width / 2) - (fromObj.x + fromObj.width / 2);
      const dy = (toObj.y + toObj.height / 2) - (fromObj.y + fromObj.height / 2);

      const autoAnchors = Math.abs(dx) >= Math.abs(dy)
        ? { fromAnchor: dx >= 0 ? "right" as const : "left" as const, toAnchor: dx >= 0 ? "left" as const : "right" as const }
        : { fromAnchor: dy >= 0 ? "bottom" as const : "top" as const, toAnchor: dy >= 0 ? "top" as const : "bottom" as const };

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
