"use client";

import React, { useId, useMemo } from "react";
import { computeCycleGeometry } from "../../lib/template-geometry";
import { getThemeColor } from "./theme";

export interface CycleStep {
  step?: number;
  label: string;
  detail?: string;
  badge?: string;
  color?: string;
}
export interface ProcessCycleData {
  title?: string;
  subtitle?: string;
  centerLabel?: string;
  centerDetail?: string;
  themeColor?: string;
  steps?: CycleStep[];
}
interface ProcessCycleProps {
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: ProcessCycleData;
}

export function ProcessCycleTemplate({ w, h, title: propTitle, subtitle: propSubtitle, themeColor: propThemeColor, data }: ProcessCycleProps) {
  const title = data?.title || propTitle || "Cyclical Process Model";
  const subtitle = data?.subtitle || propSubtitle || "Continuous Feedback & Loop Stages";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "cyan");
  const markerId = `cycle-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const steps = useMemo<CycleStep[]>(() => {
    const raw = Array.isArray(data?.steps) && data.steps.length ? data.steps : [
      { label: "Evaporation", detail: "Solar energy heats surface water into vapor." },
      { label: "Condensation", detail: "Vapor cools in upper atmosphere, forming clouds." },
      { label: "Precipitation", detail: "Water droplets coalesce and fall as rain or snow." },
      { label: "Collection", detail: "Runoff gathers in lakes, rivers, and oceans." },
    ];
    return raw.map((step, index) => ({ ...step, step: step.step || index + 1,
      label: step.label || `Stage ${index + 1}`, color: step.color || ["cyan", "blue", "violet", "emerald", "orange"][index % 5] }));
  }, [data?.steps]);
  const geometry = useMemo(() => computeCycleGeometry(steps.length, w, h), [steps.length, w, h]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md select-none dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100"
      style={{ width: w, height: h }}>
      <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm" style={{ backgroundColor: theme.primary }}>↻</span>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">{title}</h3>
            <p className="line-clamp-1 text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{steps.length} Sequential Phases</span>
      </div>

      <svg className="pointer-events-none absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={theme.primary} />
          </marker>
        </defs>
        {geometry.edges.map(arc => <path key={arc.id} d={arc.d} fill="none" stroke={theme.primary} strokeWidth="2" strokeDasharray="4 4" markerEnd={`url(#${markerId})`} opacity={0.7} />)}
      </svg>

      <div className="absolute z-10 flex flex-col items-center justify-center rounded-full border border-slate-200/90 bg-white/90 p-3 text-center shadow-md backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90"
        style={{ width: 120, height: 120, left: geometry.center.x - 60, top: geometry.center.y - 60 }}>
        <span className="mb-1 h-2 w-2 rounded-full" style={{ backgroundColor: theme.primary }} />
        <h5 className="text-xs font-bold tracking-tight text-slate-800 dark:text-slate-100">{data?.centerLabel || "Continuous Loop"}</h5>
        <p className="mt-1 line-clamp-3 text-[9px] text-slate-400">{data?.centerDetail || "The sequence repeats"}</p>
      </div>

      {steps.map((step, index) => {
        const pos = geometry.nodes[index], stepTheme = getThemeColor(step.color);
        return <div key={index} data-cycle-step={index} className="absolute z-10 flex flex-col justify-center rounded-xl border border-slate-200/80 bg-white/95 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/95"
          style={{ width: pos.width, height: pos.height, left: pos.x - pos.width / 2, top: pos.y - pos.height / 2, borderLeft: `3px solid ${stepTheme.primary}` }}>
          <div className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: stepTheme.primary }}>{step.step}</span>
            <span className="line-clamp-2 break-words text-[11px] font-semibold leading-tight text-slate-800 dark:text-slate-100">{step.label}</span>
          </div>
          {step.detail && <p className="mt-1 line-clamp-3 text-[10px] leading-tight text-slate-500 dark:text-slate-400">{step.detail}</p>}
        </div>;
      })}
    </div>
  );
}
