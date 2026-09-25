import { applyElkLayout, doBoxesOverlap } from "../lib/elk-spatial-layout.ts";

const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);


// -------------------------------------------------------------
// VERIFICATION HARNESS FOR 60 DIVERSE SCENARIOS
// -------------------------------------------------------------
export async function testScene(index, name, plan) {
  const result = await applyElkLayout(plan);

  // 1. Collision Check
  const topLevel = result.objects.filter((o) => !BACKDROP_ROLES.has(o.role));
  const collisionErrors = [];
  for (let i = 0; i < topLevel.length; i++) {
    for (let j = i + 1; j < topLevel.length; j++) {
      const a = topLevel[i];
      const b = topLevel[j];
      // Skip if one is child of the other
      if (doBoxesOverlap(a, b, 8)) {
        collisionErrors.push(`Collision between [${a.id}] (${a.x},${a.y}) and [${b.id}] (${b.x},${b.y})`);
      }
    }
  }

  // 2. 16:9 Canvas Containment Check (strictly within 20..1260 and 20..700)
  const minX = Math.min(...result.objects.map((o) => o.x));
  const maxX = Math.max(...result.objects.map((o) => o.x + o.width));
  const minY = Math.min(...result.objects.map((o) => o.y));
  const maxY = Math.max(...result.objects.map((o) => o.y + o.height));

  const boundsErrors = [];
  if (minX < 20 || maxX > 1260 || minY < 20 || maxY > 700) {
    boundsErrors.push(`Out of 16:9 bounds: X=[${minX}, ${maxX}], Y=[${minY}, ${maxY}]`);
  }

  // 3. Formula Clearance Check
  const formulaObjs = result.objects.filter((o) => o.role === "formula");
  const nonFormulaObjs = result.objects.filter((o) => o.role !== "formula" && !BACKDROP_ROLES.has(o.role));
  const formulaErrors = [];
  if (formulaObjs.length > 0 && nonFormulaObjs.length > 0) {
    const minFormulaY = Math.min(...formulaObjs.map((f) => f.y));
    const maxDiagY = Math.max(...nonFormulaObjs.map((d) => d.y + d.height));
    if (maxDiagY > minFormulaY - 14) {
      formulaErrors.push(`Formula overlap: Diagram maxY=${maxDiagY} exceeds formula minY=${minFormulaY}`);
    }
  }

  // 4. Connection Anchors & Routing Integrity
  const connErrors = [];
  for (const conn of result.connections || []) {
    const from = result.objects.find((o) => o.id === conn.from);
    const to = result.objects.find((o) => o.id === conn.to);
    if (!from || !to) {
      connErrors.push(`Connection [${conn.id}] has missing endpoint: from=${conn.from}, to=${conn.to}`);
    }
  }

  // Summary
  const passed = collisionErrors.length === 0 && boundsErrors.length === 0 && formulaErrors.length === 0 && connErrors.length === 0;

  if (!passed) {
    console.error(`❌ Case #${index}: "${name}" FAILED:`);
    if (collisionErrors.length) console.error("  " + collisionErrors.join("; "));
    if (boundsErrors.length) console.error("  " + boundsErrors.join("; "));
    if (formulaErrors.length) console.error("  " + formulaErrors.join("; "));
    if (connErrors.length) console.error("  " + connErrors.join("; "));
    throw new Error(`Verification failed on case #${index}: ${name}`);
  }

  return {
    index,
    name,
    objectCount: result.objects.length,
    connectionCount: (result.connections || []).length,
    bounds: { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY },
  };
}
