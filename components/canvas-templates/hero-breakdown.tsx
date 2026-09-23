"use client";

import React, { useMemo } from "react";
import { getThemeColor } from "./theme";

export interface HeroSpec {
  label: string;
  value: string;
}

export interface HeroSubject {
  label: string;
  detail?: string;
  badge?: string;
  color?: string;
  specs?: HeroSpec[];
}

export interface BreakdownComponent {
  id?: string;
  label: string;
  detail: string;
  badge?: string;
  color?: string;
  icon?: string;
}

export interface HeroBreakdownData {
  title?: string;
  subtitle?: string;
  hero?: HeroSubject;
  components?: BreakdownComponent[];
  themeColor?: string;
  layout?: "side-by-side" | "stacked";
}

interface HeroBreakdownProps {
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: HeroBreakdownData;
}

export function HeroBreakdownTemplate({
  w,
  h,
  title: propTitle,
  subtitle: propSubtitle,
  themeColor: propThemeColor,
  data,
}: HeroBreakdownProps) {
  const title = data?.title || propTitle || "System Breakdown";
  const subtitle = data?.subtitle || propSubtitle || "Core Architecture & Subsystems";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "blue");

  const hero = useMemo<HeroSubject>(() => {
    if (data?.hero) {
      return {
        label: data.hero.label || "Primary Subject",
        detail: data.hero.detail || "Central mechanism and functional hub.",
        badge: data.hero.badge || "Core Unit",
        color: data.hero.color || "blue",
        specs: Array.isArray(data.hero.specs) ? data.hero.specs : [],
      };
    }
    return {
      label: "Central Processing Core",
      detail: "Executes micro-instructions and coordinates data flow across sub-buses.",
      badge: "Master Component",
      color: "blue",
      specs: [
        { label: "Operation", value: "Pipeline Execution" },
        { label: "Throughput", value: "High Bandwidth" },
      ],
    };
  }, [data?.hero]);

  const components = useMemo<BreakdownComponent[]>(() => {
    const raw = Array.isArray(data?.components) ? data.components : [];
    if (raw.length === 0) {
      return [
        {
          label: "Input Bus Interface",
          detail: "Receives raw electrical signals and synchronizes clock signals.",
          badge: "Interface",
          color: "cyan",
        },
        {
          label: "Logic & Register Matrix",
          detail: "Temporarily buffers operational state and executes bitwise transforms.",
          badge: "Execution",
          color: "violet",
        },
        {
          label: "Output Channel Driver",
          detail: "Amplifies output drive strength to transmit down the memory bus.",
          badge: "Output",
          color: "emerald",
        },
      ];
    }

    return raw.map((comp, idx) => ({
      id: comp.id || `comp-${idx}`,
      label: comp.label || `Component ${idx + 1}`,
      detail: comp.detail || "Subsystem function and mechanics.",
      badge: comp.badge || `Part 0${idx + 1}`,
      color: comp.color || (idx % 2 === 0 ? "cyan" : "violet"),
      icon: comp.icon,
    }));
  }, [data?.components]);

  const heroTheme = getThemeColor(hero.color);
  const isStacked = data?.layout === "stacked" || w < 480;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md select-none transition-all dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100"
      style={{ width: `${w}px`, height: `${h}px` }}
    >
      {/* Top Header */}
      <div className="z-10 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: theme.primary }}
          >
            ✦
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
            {components.length} Subsystems
          </span>
        </div>
      </div>

      {/* Main Body */}
      <div
        className={`relative mt-3 flex flex-1 min-h-0 gap-3 ${
          isStacked ? "flex-col overflow-y-auto" : "flex-row"
        }`}
      >
        {/* Left Hero Card */}
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm"
          style={{
            flex: isStacked ? "none" : "0 0 42%",
            backgroundColor: heroTheme.bgLight,
            borderColor: heroTheme.borderLight,
          }}
        >
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span
                className="rounded-full px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider shadow-xs"
                style={{
                  backgroundColor: heroTheme.primary,
                  color: "#ffffff",
                }}
              >
                {hero.badge || "Hero Subject"}
              </span>
              <span
                className="h-2 w-2 rounded-full animate-ping"
                style={{ backgroundColor: heroTheme.primary }}
              />
            </div>

            <h4
              className="font-bold text-base tracking-tight"
              style={{ color: heroTheme.primary }}
            >
              {hero.label}
            </h4>

            {hero.detail && (
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {hero.detail}
              </p>
            )}
          </div>

          {/* Animated Hero Emblem Centerpiece */}
          <div className="my-auto flex flex-col items-center justify-center py-2">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <svg className="absolute inset-0 h-full w-full animate-spin [animation-duration:24s]" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke={heroTheme.primary} strokeWidth="2.5" strokeDasharray="6 8" opacity="0.45" />
              </svg>
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-transform hover:scale-110"
                style={{
                  backgroundColor: heroTheme.primary,
                  boxShadow: `0 0 24px ${heroTheme.glow}`,
                }}
              >
                <span className="text-xl text-white font-bold">✦</span>
              </div>
            </div>
            <span className="mt-1.5 text-[10px] font-medium tracking-wider uppercase text-slate-400">
              Primary System
            </span>
          </div>

          {/* Specs / Properties List */}
          {hero.specs && hero.specs.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-slate-200/60 pt-2 dark:border-slate-800">
              {hero.specs.map((spec, sIdx) => (
                <div
                  key={sIdx}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-slate-500 dark:text-slate-400">
                    {spec.label}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Component Cards List / Grid */}
        <div
          className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1"
          style={{ flex: isStacked ? "none" : "1" }}
        >
          {components.map((comp, idx) => {
            const compTheme = getThemeColor(comp.color);
            return (
              <div
                key={comp.id || idx}
                className="group relative flex flex-col justify-center rounded-xl border border-slate-100 bg-white/90 p-3 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md hover:translate-x-1 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700"
                style={{
                  borderLeft: `4px solid ${compTheme.primary}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full font-bold text-[10px]"
                      style={{
                        backgroundColor: compTheme.bgLight,
                        color: compTheme.primary,
                        border: `1px solid ${compTheme.borderLight}`,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <h5 className="font-semibold text-slate-800 text-xs tracking-tight dark:text-slate-100">
                      {comp.label}
                    </h5>
                  </div>

                  {comp.badge && (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[9px] font-medium"
                      style={{
                        backgroundColor: compTheme.bgLight,
                        color: compTheme.primary,
                      }}
                    >
                      {comp.badge}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {comp.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
