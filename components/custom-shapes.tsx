"use client";

import React, { useMemo } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ============================================================================
// 1. CUSTOM CHART SHAPE DEFINITIONS
// ============================================================================

export const CUSTOM_CHART_TYPE = "custom-chart" as const;

export interface ChartDataItem {
  name?: string;
  label?: string;
  value?: number;
  val?: number;
  color?: string;
  [key: string]: any;
}

export interface CustomChartShapeProps {
  w: number;
  h: number;
  title: string;
  chartType: "bar" | "line" | "pie" | "area";
  data: ChartDataItem[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  color?: string;
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CUSTOM_CHART_TYPE]: CustomChartShapeProps;
  }
}

export type CustomChartShape = TLShape<typeof CUSTOM_CHART_TYPE>;

const chartColorMap: Record<string, string> = {
  blue: "#2563eb",
  cyan: "#0284c7",
  violet: "#7c3aed",
  orange: "#ea580c",
  green: "#16a34a",
  red: "#dc2626",
  yellow: "#d97706",
  slate: "#64748b",
  ink: "#0f172a",
};

function ChartComponent({ shape }: { shape: CustomChartShape }) {
  const { w, h, title, chartType, data, xAxisLabel, yAxisLabel, color } = shape.props;
  const primaryColor = chartColorMap[color || "blue"] || "#2563eb";

  const safeData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [
        { name: "Group A", value: 45 },
        { name: "Group B", value: 78 },
        { name: "Group C", value: 62 },
      ];
    }
    return data.map((item: any, idx: number) => {
      const name = String(item?.name ?? item?.label ?? item?.category ?? item?.x ?? item?.title ?? `Point ${idx + 1}`);
      const rawVal = item?.value ?? item?.val ?? item?.y ?? item?.amount ?? item?.count ?? item?.number ?? item?.v;
      const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal ?? "").replace(/[^0-9.-]/g, ""));
      return {
        name,
        value: Number.isFinite(num) ? num : (idx + 1) * 10,
        color: item?.color ? chartColorMap[item.color] || item.color : primaryColor,
      };
    });
  }, [data, primaryColor]);

  const chartWidth = Math.max(120, w - 24);
  const chartHeight = Math.max(80, h - 68);

  return (
    <HTMLContainer
      style={{
        pointerEvents: "all",
        width: `${w}px`,
        height: `${h}px`,
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-[0_4px_24px_rgba(15,23,42,0.08)] backdrop-blur-md select-none transition-all dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100">
        {/* Card Header */}
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: primaryColor }}
            />
            <h4 className="font-semibold text-slate-800 text-sm tracking-tight dark:text-slate-100">
              {title || "Statistical Overview"}
            </h4>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800 dark:text-slate-400">
            {chartType}
          </span>
        </div>

        {/* Chart Visualization Area */}
        <div className="relative flex-1 min-h-0 w-full">
          {chartType === "line" ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={safeData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.92)",
                    borderRadius: "8px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={primaryColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: primaryColor, strokeWidth: 1, stroke: "#fff" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={safeData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.92)",
                    borderRadius: "8px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="value" fill={primaryColor} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Optional Axis Summary / Legend */}
        {(xAxisLabel || yAxisLabel) && (
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            {xAxisLabel ? <span>x: {xAxisLabel}</span> : <span />}
            {yAxisLabel ? <span>y: {yAxisLabel}</span> : <span />}
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}

export class ChartShapeUtil extends BaseBoxShapeUtil<CustomChartShape> {
  static override type = CUSTOM_CHART_TYPE;

  static override props: RecordProps<CustomChartShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    chartType: T.literalEnum("bar", "line", "pie", "area"),
    data: T.arrayOf(T.any),
    xAxisLabel: T.optional(T.string),
    yAxisLabel: T.optional(T.string),
    color: T.optional(T.string),
  };

  override getDefaultProps(): CustomChartShape["props"] {
    return {
      w: 420,
      h: 260,
      title: "Data Distribution",
      chartType: "bar",
      data: [
        { name: "Group A", value: 45 },
        { name: "Group B", value: 85 },
        { name: "Group C", value: 60 },
      ],
      xAxisLabel: "Category",
      yAxisLabel: "Value",
      color: "blue",
    };
  }

  override getGeometry(shape: CustomChartShape) {
    return new Rectangle2d({
      width: Math.max(20, shape.props.w),
      height: Math.max(20, shape.props.h),
      isFilled: true,
    });
  }

  override component(shape: CustomChartShape) {
    return <ChartComponent shape={shape} />;
  }

  override getIndicatorPath(shape: CustomChartShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 16);
    return path;
  }
}

// ============================================================================
// 2. CUSTOM SVG SHAPE DEFINITIONS
// ============================================================================

export const CUSTOM_SVG_TYPE = "custom-svg" as const;

export interface CustomSvgShapeProps {
  w: number;
  h: number;
  title?: string;
  caption?: string;
  svgString: string;
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CUSTOM_SVG_TYPE]: CustomSvgShapeProps;
  }
}

export type CustomSvgShape = TLShape<typeof CUSTOM_SVG_TYPE>;

/**
 * Sanitizes and normalizes raw SVG markup to guarantee:
 * 1. Safe execution (stripping script tags and event handler attributes).
 * 2. Responsive scaling (ensuring viewBox and 100% width/height).
 */
function sanitizeSvg(rawSvg: string, defaultW: number, defaultH: number): string {
  if (!rawSvg || typeof rawSvg !== "string") {
    return `<svg viewBox="0 0 ${defaultW} ${defaultH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f1f5f9" rx="8"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-size="12">No vector illustration provided</text></svg>`;
  }

  let cleaned = rawSvg.trim();

  // Strip Markdown code fences if the LLM outputted ```xml or ```svg
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:xml|svg)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }

  // Remove <script> tags
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove inline on* handlers (onclick, onload, onerror, etc.)
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // Remove javascript: pseudo-protocols
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*")/gi, "");

  // Ensure svg opening tag has responsive attributes
  const svgMatch = cleaned.match(/<svg([^>]*)>/i);
  if (svgMatch) {
    let attrs = svgMatch[1];
    const hasViewBox = /viewBox\s*=/i.test(attrs);

    if (!hasViewBox) {
      // Synthesize viewBox from width/height if present, or fallback to defaultW/defaultH
      const wMatch = attrs.match(/width\s*=\s*["']?(\d+)/i);
      const hMatch = attrs.match(/height\s*=\s*["']?(\d+)/i);
      const vbW = wMatch ? wMatch[1] : defaultW;
      const vbH = hMatch ? hMatch[1] : defaultH;
      attrs += ` viewBox="0 0 ${vbW} ${vbH}"`;
    }

    // Force 100% width, height, and meet preserveAspectRatio for seamless canvas scaling
    attrs = attrs.replace(/\bwidth\s*=\s*["'][^"']*["']/gi, 'width="100%"');
    attrs = attrs.replace(/\bheight\s*=\s*["'][^"']*["']/gi, 'height="100%"');
    if (!/preserveAspectRatio\s*=/i.test(attrs)) {
      attrs += ' preserveAspectRatio="xMidYMid meet"';
    }

    cleaned = cleaned.replace(/<svg[^>]*>/i, `<svg${attrs}>`);
  }

  return cleaned;
}

function SvgComponent({ shape }: { shape: CustomSvgShape }) {
  const { w, h, title, caption, svgString } = shape.props;

  const sanitizedSvg = useMemo(() => {
    return sanitizeSvg(svgString, w, h);
  }, [svgString, w, h]);

  const hasHeader = Boolean(title);
  const hasFooter = Boolean(caption);

  return (
    <HTMLContainer
      style={{
        pointerEvents: "all",
        width: `${w}px`,
        height: `${h}px`,
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-md select-none dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100">
        {hasHeader && (
          <div className="mb-1.5 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 text-xs tracking-tight dark:text-slate-100">
              {title}
            </h4>
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-medium text-[10px] text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              vector
            </span>
          </div>
        )}

        <div
          className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden"
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />

        {hasFooter && (
          <div className="mt-1 border-t border-slate-100 pt-1 text-center font-medium text-[11px] text-slate-400 dark:border-slate-800">
            {caption}
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}

export class SvgShapeUtil extends BaseBoxShapeUtil<CustomSvgShape> {
  static override type = CUSTOM_SVG_TYPE;

  static override props: RecordProps<CustomSvgShape> = {
    w: T.number,
    h: T.number,
    title: T.optional(T.string),
    caption: T.optional(T.string),
    svgString: T.string,
  };

  override getDefaultProps(): CustomSvgShape["props"] {
    return {
      w: 360,
      h: 260,
      title: "Illustration",
      caption: "",
      svgString: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
  </defs>
  <rect x="20" y="20" width="160" height="160" rx="20" fill="url(#grad)" opacity="0.85" />
  <circle cx="100" cy="100" r="45" fill="#ffffff" opacity="0.9" />
  <path d="M 85 100 L 95 115 L 120 85" fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
</svg>`,
    };
  }

  override getGeometry(shape: CustomSvgShape) {
    return new Rectangle2d({
      width: Math.max(20, shape.props.w),
      height: Math.max(20, shape.props.h),
      isFilled: true,
    });
  }

  override component(shape: CustomSvgShape) {
    return <SvgComponent shape={shape} />;
  }

  override getIndicatorPath(shape: CustomSvgShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 16);
    return path;
  }
}

// ============================================================================
// 3. EXPORT CUSTOM SHAPES LIST FOR TLDRAW REGISTRATION
// ============================================================================

import {
  TemplateShapeUtil,
  CUSTOM_TEMPLATE_TYPE,
  type CustomTemplateShape,
  type CustomTemplateShapeProps,
} from "@/components/canvas-templates";

export {
  TemplateShapeUtil,
  CUSTOM_TEMPLATE_TYPE,
  type CustomTemplateShape,
  type CustomTemplateShapeProps,
};

export const customShapeUtils = [ChartShapeUtil, SvgShapeUtil, TemplateShapeUtil];

