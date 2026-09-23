"use client";

import React, { useMemo } from "react";
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

export function ProcessCycleTemplate({
  w,
  h,
  title: propTitle,
  subtitle: propSubtitle,
  themeColor: propThemeColor,
  data,
}: ProcessCycleProps) {
  const title = data?.title || propTitle || "Cyclical Process Model";
  const subtitle = data?.subtitle || propSubtitle || "Continuous Feedback & Loop Stages";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "cyan");
  const centerLabel = data?.centerLabel || "Continuous Loop";
  const centerDetail = data?.centerDetail || "Iterative sequence repeats infinitely";

  const steps = useMemo<CycleStep[]>(() => {
    const raw = Array.isArray(data?.steps) ? data.steps : [];
    if (raw.length === 0) {
      return [
        { label: "Evaporation", detail: "Solar energy heats surface water into vapor.", color: "cyan" },
        { label: "Condensation", detail: "Vapor cools in upper atmosphere, forming clouds.", color: "blue" },
        { label: "Precipitation", detail: "Water droplets coalesce and fall as rain or snow.", color: "violet" },
        { label: "Collection", detail: "Runoff gathers in lakes, rivers, and oceans.", color: "emerald" },
      ];
    }
    return raw.map((s, idx) => ({
      step: s.step || idx + 1,
      label: s.label || `Stage ${idx + 1}`,
      detail: s.detail || "",
      badge: s.badge,
      color: s.color || ["cyan", "blue", "violet", "emerald", "orange"][idx % 5],
    }));
  }, [data?.steps]);

  const numSteps = steps.length;
  const cx = w / 2;
  const cy = (h + 50) / 2;
  const rx = Math.max(90, Math.min(w / 2 - 110, 220));
  const ry = Math.max(70, Math.min((h - 80) / 2 - 50, 150));

  // Compute node coordinates
  const stepPositions = useMemo(() => {
    return steps.map((_, i) => {
      // Start at top (-PI/2) and rotate clockwise
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / numSteps;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      return { x, y, angle };
    });
  }, [steps, numSteps, cx, cy, rx, ry]);

  // Generate curved connecting arcs between steps
  const connectingArcs = useMemo(() => {
    return stepPositions.map((pos, i) => {
      const nextPos = stepPositions[(i + 1) % numSteps];
      // Arc curve control point slightly further out
      const midAngle = (pos.angle + nextPos.angle) / 2 + (nextPos.angle < pos.angle ? Math.PI : 0);
      const controlR = 1.15;
      const qx = cx + rx * controlR * Math.cos(midAngle);
      const qy = cy + ry * controlR * Math.sin(midAngle);

      return {
        id: `arc-${i}`,
        d: `M ${pos.x} ${pos.y} Q ${qx} ${qy} ${nextPos.x} ${nextPos.y}`,
        color: steps[i].color,
      };
    });
  }, [stepPositions, numSteps, cx, cy, rx, ry, steps]);

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md select-none transition-all dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100"
      style={{ width: `${w}px`, height: `${h}px` }}
    >
      {/* Top Header Card */}
      <div className="z-10 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: theme.primary }}
          >
            ↻
          </span>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm tracking-tight dark:text-slate-100">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-slate-400 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {numSteps} Sequential Phases
          </span>
        </div>
      </div>

      {/* SVG Arc Layer */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: 2 }}
      >
        <defs>
          <marker
            id="cycleArrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={theme.primary} />
          </marker>
        </defs>
        {connectingArcs.map((arc) => (
          <path
            key={arc.id}
            d={arc.d}
            fill="none"
            stroke={theme.primary}
            strokeWidth="2"
            strokeDasharray="4 4"
            markerEnd="url(#cycleArrow)"
            opacity={0.6}
          />
        ))}
      </svg>

      {/* Center Hub Card */}
      <div
        className="absolute z-10 flex flex-col items-center justify-center rounded-full border border-slate-200/90 bg-white/90 p-3 text-center shadow-md backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90"
        style={{
          width: "120px",
          height: "120px",
          left: `${cx - 60}px`,
          top: `${cy - 60}px`,
        }}
      >
        <span
          className="h-2 w-2 rounded-full animate-ping mb-1"
          style={{ backgroundColor: theme.primary }}
        />
        <h5 className="font-bold text-xs tracking-tight text-slate-800 dark:text-slate-100">
          {centerLabel}
        </h5>
        {centerDetail && (
          <p className="mt-1 line-clamp-2 text-[9px] text-slate-400">
            {centerDetail}
          </p>
        )}
      </div>

      {/* Radial Steps Cards */}
      <div className="relative z-10 flex-1 min-h-0">
        {steps.map((step, idx) => {
          const pos = stepPositions[idx];
          const stepTheme = getThemeColor(step.color);
          const cardWidth = 130;
          const cardHeight = 72;

          return (
            <div
              key={idx}
              className="absolute flex flex-col justify-center rounded-xl border border-slate-200/80 bg-white/95 p-2 shadow-sm transition-all hover:scale-105 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/95"
              style={{
                width: `${cardWidth}px`,
                height: `${cardHeight}px`,
                left: `${pos.x - cardWidth / 2}px`,
                top: `${pos.y - cardHeight / 2}px`,
                borderLeft: `3px solid ${stepTheme.primary}`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full font-bold text-[9px] text-white"
                  style={{ backgroundColor: stepTheme.primary }}
                >
                  {step.step || idx + 1}
                </span>
                <span className="truncate font-semibold text-slate-800 text-[11px] dark:text-slate-100">
                  {step.label}
                </span>
              </div>
              {step.detail && (
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  {step.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
