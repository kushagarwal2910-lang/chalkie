"use client";

import React, { useMemo } from "react";
import { getThemeColor } from "./theme";

export interface TimelineEvent {
  date?: string;
  year?: string;
  label: string;
  detail?: string;
  tag?: string;
  color?: string;
}

export interface TimelineData {
  title?: string;
  subtitle?: string;
  themeColor?: string;
  orientation?: "horizontal" | "vertical";
  events?: TimelineEvent[];
}

interface TimelineProps {
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: TimelineData;
}

export function TimelineTemplate({
  w,
  h,
  title: propTitle,
  subtitle: propSubtitle,
  themeColor: propThemeColor,
  data,
}: TimelineProps) {
  const title = data?.title || propTitle || "Chronological Timeline";
  const subtitle = data?.subtitle || propSubtitle || "Key Milestones & Historical Evolution";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "orange");

  const events = useMemo<TimelineEvent[]>(() => {
    const raw = Array.isArray(data?.events) ? data.events : [];
    if (raw.length === 0) {
      return [
        {
          date: "1947",
          label: "Point-Contact Transistor",
          detail: "Bardeen, Brattain, and Shockley invent the solid-state amplifier at Bell Labs.",
          tag: "Invention",
          color: "orange",
        },
        {
          date: "1958",
          label: "Integrated Circuit",
          detail: "Jack Kilby and Robert Noyce place multiple transistors onto a single silicon chip.",
          tag: "Miniaturization",
          color: "blue",
        },
        {
          date: "1971",
          label: "Microprocessor 4004",
          detail: "Intel launches the first commercial single-chip central processing unit.",
          tag: "Computing",
          color: "violet",
        },
        {
          date: "2024",
          label: "Sub-2nm FinFET / GAA",
          detail: "Modern lithography packs tens of billions of nanosheet transistors per die.",
          tag: "Nanoscale",
          color: "emerald",
        },
      ];
    }
    return raw.map((e, idx) => ({
      date: e.date || e.year || `Phase 0${idx + 1}`,
      label: e.label || `Event ${idx + 1}`,
      detail: e.detail || "",
      tag: e.tag,
      color: e.color || ["orange", "blue", "violet", "emerald", "cyan"][idx % 5],
    }));
  }, [data?.events]);

  const numEvents = events.length;
  const paddingX = 40;
  const contentWidth = Math.max(160, w - paddingX * 2);
  const trackY = (h + 40) / 2;

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
            ⏱
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
            {numEvents} Milestones
          </span>
        </div>
      </div>

      {/* Timeline Visual Workspace */}
      <div className="relative flex-1 min-h-0 w-full">
        {/* Horizontal Track Bar */}
        <div
          className="absolute left-6 right-6 h-1 rounded-full bg-gradient-to-r from-orange-400 via-blue-500 to-emerald-400 opacity-60"
          style={{ top: `${trackY - 2}px` }}
        />

        {/* Milestones and Cards */}
        {events.map((evt, idx) => {
          const stepX = numEvents > 1 ? contentWidth / (numEvents - 1) : 0;
          const posX = numEvents > 1 ? paddingX + idx * stepX : w / 2;
          const isAbove = idx % 2 === 0;
          const evtTheme = getThemeColor(evt.color);
          const cardWidth = Math.min(160, (w - 60) / numEvents);

          return (
            <React.Fragment key={idx}>
              {/* Dot on timeline track */}
              <div
                className="absolute z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-transform hover:scale-125 dark:bg-slate-900"
                style={{
                  left: `${posX}px`,
                  top: `${trackY}px`,
                  borderColor: evtTheme.primary,
                  boxShadow: `0 0 10px ${evtTheme.glow}`,
                }}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: evtTheme.primary }}
                />
              </div>

              {/* Connecting vertical tick */}
              <div
                className="absolute z-10 w-0.5"
                style={{
                  left: `${posX}px`,
                  top: isAbove ? `${trackY - 24}px` : `${trackY}px`,
                  height: "24px",
                  backgroundColor: evtTheme.primary,
                  opacity: 0.4,
                }}
              />

              {/* Event Card */}
              <div
                className="absolute z-20 flex flex-col justify-center rounded-xl border border-slate-200/90 bg-white/95 p-2.5 shadow-sm transition-all hover:scale-105 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/95"
                style={{
                  width: `${cardWidth}px`,
                  left: `${posX - cardWidth / 2}px`,
                  top: isAbove ? `${trackY - 110}px` : `${trackY + 28}px`,
                  borderTop: isAbove ? `3px solid ${evtTheme.primary}` : undefined,
                  borderBottom: !isAbove ? `3px solid ${evtTheme.primary}` : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="rounded-md px-1.5 py-0.5 font-bold text-[10px]"
                    style={{
                      backgroundColor: evtTheme.bgLight,
                      color: evtTheme.primary,
                    }}
                  >
                    {evt.date}
                  </span>
                  {evt.tag && (
                    <span className="truncate text-[9px] font-medium text-slate-400">
                      {evt.tag}
                    </span>
                  )}
                </div>

                <h5 className="mt-1 font-semibold text-slate-800 text-[11px] leading-snug tracking-tight dark:text-slate-100">
                  {evt.label}
                </h5>

                {evt.detail && (
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                    {evt.detail}
                  </p>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
