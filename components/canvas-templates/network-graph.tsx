"use client";

import React, { useId, useMemo } from "react";
import { computeNetworkGeometry } from "../../lib/template-geometry";
import { getThemeColor } from "./theme";

export interface NetworkGraphNode {
  id?: string;
  label: string;
  sublabel?: string;
  val?: string | number;
  active?: boolean;
}
export interface NetworkGraphGroup {
  id?: string;
  label: string;
  color?: string;
  nodes: (string | NetworkGraphNode)[];
}
export interface NetworkGraphConnection {
  from: string | number;
  to: string | number;
  label?: string;
  weight?: number | string;
  active?: boolean;
}
export interface NetworkGraphData {
  title?: string;
  subtitle?: string;
  groups?: NetworkGraphGroup[];
  connections?: "fully-connected" | "sequential" | NetworkGraphConnection[];
  edgeLabel?: string;
  direction?: "horizontal" | "vertical";
  themeColor?: string;
}
interface NetworkGraphProps {
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: NetworkGraphData;
}

export function NetworkGraphTemplate({ w, h, title: propTitle, subtitle: propSubtitle, themeColor: propThemeColor, data }: NetworkGraphProps) {
  const title = data?.title || propTitle || "Neural Network Architecture";
  const subtitle = data?.subtitle || propSubtitle || "Connected Layers";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "violet");
  const uniqueId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `network-glow-${uniqueId}`;
  const markerId = `network-arrow-${uniqueId}`;
  const geometry = useMemo(() => computeNetworkGeometry(data || {}, w, h), [data, w, h]);
  const connectionMode = data?.connections === "sequential" ? "Sequential" : Array.isArray(data?.connections) ? "Custom connections" : "Fully Connected";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md select-none dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100"
      style={{ width: w, height: h }}>
      <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm" style={{ backgroundColor: theme.primary }}>NN</span>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">{title}</h3>
            <p className="line-clamp-1 text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] font-medium">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{geometry.groups.length} Layers</span>
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">{connectionMode}</span>
        </div>
      </div>

      <svg className="pointer-events-none absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.primary} stopOpacity="0.55" />
            <stop offset="100%" stopColor={theme.secondary} stopOpacity="0.55" />
          </linearGradient>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={theme.primary} />
          </marker>
        </defs>
        {geometry.edges.map(edge => (
          <g key={edge.id}>
            <path d={edge.d} fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.5" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
            {edge.labelBox ? <g>
              <rect x={edge.labelBox.x} y={edge.labelBox.y} width={edge.labelBox.width} height={edge.labelBox.height} rx={5} className="fill-white/95 dark:fill-slate-900/95" />
              <text x={edge.labelPosition.x} y={edge.labelBox.y + 17} textAnchor="middle" fontSize="11" fill={theme.primary}>
                {edge.labelBox.lines.map((line, index) => <tspan key={index} x={edge.labelPosition.x} dy={index ? 17 : 0}>{line}</tspan>)}
              </text>
            </g> : edge.label && <text x={edge.labelPosition.x} y={edge.labelPosition.y - 5} textAnchor="middle" fontSize="10" fill={theme.primary}>{edge.label}</text>}
          </g>
        ))}
      </svg>

      {geometry.groups.map(group => {
        const groupTheme = getThemeColor(group.color);
        return <div key={group.id} className="absolute z-10 flex max-w-[140px] flex-col items-center text-center" style={{ left: group.x, top: group.y, transform: "translate(-50%, -50%)" }}>
          <div className="rounded-xl border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm"
            style={{ color: groupTheme.primary, backgroundColor: groupTheme.bgLight, borderColor: groupTheme.borderLight }}>{group.label}</div>
          {geometry.vertical && <span className="mt-1 text-[10px] text-slate-400">{group.nodes.length} nodes</span>}
        </div>;
      })}

      {geometry.nodes.map(node => {
        const nodeTheme = getThemeColor(node.color);
        return <div key={node.id} data-network-node={node.id} className="absolute z-10" style={{ left: node.x - node.width / 2, top: node.y - node.height / 2, width: node.width, height: node.height }}>
          <div className={`flex h-full w-full items-center justify-center border-2 bg-white px-1 text-center text-xs font-semibold shadow-md dark:bg-slate-900 ${node.width === node.height ? "rounded-full" : "rounded-xl"}`}
            style={{ borderColor: nodeTheme.primary, color: nodeTheme.primary, boxShadow: `0 0 12px ${nodeTheme.glow}` }}>
            <span className="line-clamp-3 break-words">{node.label}</span>
          </div>
          {(node.sublabel || node.val != null) && <span className="absolute left-1/2 top-full mt-1 w-32 -translate-x-1/2 text-center text-[9px] leading-tight text-slate-500 dark:text-slate-400">{node.sublabel || String(node.val)}</span>}
        </div>;
      })}

      <div className="absolute inset-x-4 bottom-3 z-10 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-slate-800">
        <span>{data?.edgeLabel || `${geometry.edges.length} connections`}</span>
        <span>{geometry.vertical ? "Flow ↓" : "Flow →"}</span>
      </div>
    </div>
  );
}
