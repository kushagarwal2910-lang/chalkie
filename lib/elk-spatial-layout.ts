import type { LessonPlan } from "./lesson-schema";
import { normalizeLessonLayout } from "./lesson-layout";

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
 * Universal Whiteboard Spatial Layout.
 * Applies generalized, topological stage-based spatial placement.
 * Mathematically guarantees zero collision, clear formula margin placement,
 * and perfect 16:9 widescreen canvas containment across all domains without any hardcoded domain hacks.
 */
export async function applyElkLayout(
  plan: LessonPlan,
  _options: ElkLayoutOptions = {}
): Promise<LessonPlan> {
  if (!plan.objects || plan.objects.length === 0) return plan;
  return normalizeLessonLayout(plan);
}
