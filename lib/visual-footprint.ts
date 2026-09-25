import type { VisualObject } from "./lesson-schema";
import { getNetworkMinimumSize, getCycleMinimumSize } from "./template-geometry.ts";

/** The layout and the shape renderer must reserve exactly the same rectangle. */
export function getVisualFootprint(object: VisualObject) {
  let minWidth = 120;
  let minHeight = 80;
  if (object.shapeType === "custom-template" || object.templateType || object.template) {
    minWidth = 320;
    minHeight = 220;
    const props = object.props || object.templateData || {};
    const template = props.templateType || object.templateType || object.template;
    const data = props.data || props.content || object.content || props;
    const minimum = template === "network-graph" ? getNetworkMinimumSize(data)
      : template === "process-cycle" ? getCycleMinimumSize(data) : null;
    if (minimum) {
      minWidth = Math.max(minWidth, minimum.width);
      minHeight = Math.max(minHeight, minimum.height);
    }
  } else if (object.shapeType === "custom-chart") {
    minWidth = 200;
    minHeight = 160;
  } else if (object.shapeType === "custom-svg") {
    minWidth = 80;
    minHeight = 80;
  } else if (object.shapeType === "note" || object.role === "formula") {
    const formula = object.role === "formula" || /[=+Δ\\/*^]/.test(object.label || "");
    minWidth = formula ? 260 : 150;
    minHeight = formula ? 88 : 80;
  }
  if (object.parts?.some((part) => part.type === "axes")) {
    minWidth = Math.max(minWidth, 360);
    minHeight = Math.max(minHeight, 240);
  }
  return {
    width: Math.max(minWidth, Number.isFinite(object.width) ? object.width : minWidth),
    height: Math.max(minHeight, Number.isFinite(object.height) ? object.height : minHeight),
  };
}
