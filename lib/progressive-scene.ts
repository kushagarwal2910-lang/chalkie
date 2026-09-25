import type { LessonPlan, VisualObject } from "./lesson-schema";

const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

export function getProgressiveVisibleObjects(
  lesson: LessonPlan,
  activeStep: number,
  isPresenting: boolean
): VisualObject[] {
  // The completed/static board is explicit; pausing must not reveal future steps.
  if (!isPresenting) {
    return lesson.objects;
  }
  if (activeStep < 0) return [];

  // Accumulate all targets introduced from Step 0 up through the current activeStep
  const cumulativeTargets = new Set<string>();
  for (let i = 0; i <= activeStep && i < lesson.segments.length; i++) {
    const seg = lesson.segments[i];
    if (seg && Array.isArray(seg.targetIds)) {
      seg.targetIds.forEach((t) => {
        cumulativeTargets.add(t);
        if (t.includes("#")) cumulativeTargets.add(t.split("#")[0]);
      });
    }
  }

  // A teaching step can target a connection itself. Its two endpoints must be
  // present too, otherwise a valid narrated link disappears from the scene.
  for (const connection of lesson.connections) {
    if (cumulativeTargets.has(connection.id)) {
      cumulativeTargets.add(connection.from);
      cumulativeTargets.add(connection.to);
    }
  }

  const visible = lesson.objects.filter((obj) => {
    // Structural backdrops or frame containers remain visible
    if (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame") return true;

    if (cumulativeTargets.has(obj.id)) return true;

    const objIdLower = obj.id.toLowerCase();
    const objLabelLower = (obj.label || "").toLowerCase();
    for (const target of cumulativeTargets) {
      const tLower = target.toLowerCase();
      if (
        objIdLower.includes(tLower) ||
        tLower.includes(objIdLower) ||
        (objLabelLower.length > 0 && (objLabelLower.includes(tLower) || tLower.includes(objLabelLower)))
      ) {
        return true;
      }
    }
    return false;
  });

  // Safety fallback: ensure at least proportional objects are visible so canvas is never blank
  if (visible.length === 0 && lesson.objects.length > 0) {
    const fraction = Math.min(1, (activeStep + 1) / Math.max(1, lesson.segments.length));
    const count = Math.max(1, Math.ceil(fraction * lesson.objects.length));
    return lesson.objects.slice(0, count);
  }

  return visible;
}
