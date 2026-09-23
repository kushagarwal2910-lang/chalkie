"use client";

import React from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";

import { NetworkGraphTemplate } from "./network-graph";
import { HeroBreakdownTemplate } from "./hero-breakdown";
import { ProcessCycleTemplate } from "./process-cycle";
import { TimelineTemplate } from "./timeline";
import { ComparisonGridTemplate } from "./comparison-grid";
import { LayeredStackTemplate } from "./layered-stack";

export const CUSTOM_TEMPLATE_TYPE = "custom-template" as const;

export type TemplateType =
  | "network-graph"
  | "hero-breakdown"
  | "process-cycle"
  | "timeline"
  | "comparison-grid"
  | "layered-stack";

export interface CustomTemplateShapeProps {
  w: number;
  h: number;
  templateType: TemplateType;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: any;
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CUSTOM_TEMPLATE_TYPE]: CustomTemplateShapeProps;
  }
}

export type CustomTemplateShape = TLShape<typeof CUSTOM_TEMPLATE_TYPE>;

function TemplateComponent({ shape }: { shape: CustomTemplateShape }) {
  const { w, h, templateType, title, subtitle, themeColor, data } = shape.props;
  const safeData = typeof data === "object" && data !== null ? data : {};

  let content: React.ReactNode = null;

  switch (templateType) {
    case "network-graph":
      content = (
        <NetworkGraphTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;

    case "hero-breakdown":
      content = (
        <HeroBreakdownTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;

    case "process-cycle":
      content = (
        <ProcessCycleTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;

    case "timeline":
      content = (
        <TimelineTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;

    case "comparison-grid":
      content = (
        <ComparisonGridTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;

    case "layered-stack":
      content = (
        <LayeredStackTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;

    default:
      content = (
        <HeroBreakdownTemplate
          w={w}
          h={h}
          title={title}
          subtitle={subtitle}
          themeColor={themeColor}
          data={safeData}
        />
      );
      break;
  }

  return (
    <HTMLContainer
      style={{
        pointerEvents: "all",
        width: `${w}px`,
        height: `${h}px`,
      }}
    >
      {content}
    </HTMLContainer>
  );
}

export class TemplateShapeUtil extends BaseBoxShapeUtil<CustomTemplateShape> {
  static override type = CUSTOM_TEMPLATE_TYPE;

  static override props: RecordProps<CustomTemplateShape> = {
    w: T.number,
    h: T.number,
    templateType: T.literalEnum(
      "network-graph",
      "hero-breakdown",
      "process-cycle",
      "timeline",
      "comparison-grid",
      "layered-stack"
    ),
    title: T.optional(T.string),
    subtitle: T.optional(T.string),
    themeColor: T.optional(T.string),
    data: T.any,
  };

  override getDefaultProps(): CustomTemplateShape["props"] {
    return {
      w: 640,
      h: 420,
      templateType: "hero-breakdown",
      title: "Architecture Breakdown",
      subtitle: "System Subsystems & Flow",
      themeColor: "blue",
      data: {},
    };
  }

  override getGeometry(shape: CustomTemplateShape) {
    return new Rectangle2d({
      width: Math.max(80, shape.props.w),
      height: Math.max(80, shape.props.h),
      isFilled: true,
    });
  }

  override component(shape: CustomTemplateShape) {
    return <TemplateComponent shape={shape} />;
  }

  override getIndicatorPath(shape: CustomTemplateShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 16);
    return path;
  }
}

export * from "./network-graph";
export * from "./hero-breakdown";
export * from "./process-cycle";
export * from "./timeline";
export * from "./comparison-grid";
export * from "./layered-stack";
export * from "./theme";
