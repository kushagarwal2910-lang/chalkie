"use client";

import React, { useMemo } from "react";
import { getThemeColor } from "./theme";

export interface ComparisonRow {
  feature: string;
  values: string[];
  highlight?: boolean;
}

export interface ComparisonGridData {
  title?: string;
  subtitle?: string;
  themeColor?: string;
  headers?: string[];
  rows?: (string[] | ComparisonRow)[];
  summary?: string;
}

interface ComparisonGridProps {
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: ComparisonGridData;
}

export function ComparisonGridTemplate({
  w,
  h,
  title: propTitle,
  subtitle: propSubtitle,
  themeColor: propThemeColor,
  data,
}: ComparisonGridProps) {
  const title = data?.title || propTitle || "Side-by-Side Comparison";
  const subtitle = data?.subtitle || propSubtitle || "Structural & Functional Distinctions";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "blue");

  const headers = useMemo<string[]>(() => {
    if (Array.isArray(data?.headers) && data.headers.length > 0) {
      return data.headers;
    }
    return ["Dimension", "DNA", "RNA"];
  }, [data?.headers]);

  const rows = useMemo<ComparisonRow[]>(() => {
    const raw = Array.isArray(data?.rows) ? data.rows : [];
    if (raw.length === 0) {
      return [
        { feature: "Strand Structure", values: ["Double helix (duplex)", "Single stranded"] },
        { feature: "Pentose Sugar", values: ["2-Deoxyribose", "Ribose"] },
        { feature: "Nitrogenous Bases", values: ["Adenine, Thymine, Guanine, Cytosine", "Adenine, Uracil, Guanine, Cytosine"] },
        { feature: "Primary Role", values: ["Long-term genetic blueprint storage", "Protein synthesis & translation (mRNA/tRNA)"] },
        { feature: "Cellular Location", values: ["Nucleus, mitochondria, chloroplasts", "Nucleus, cytoplasm, ribosomes"] },
      ];
    }

    return raw.map((r) => {
      if (Array.isArray(r)) {
        return {
          feature: r[0] || "",
          values: r.slice(1),
        };
      }
      return {
        feature: r.feature || "",
        values: Array.isArray(r.values) ? r.values : [],
        highlight: r.highlight,
      };
    });
  }, [data?.rows]);

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
            ⚖
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
            {headers.length - 1} Entities • {rows.length} Criteria
          </span>
        </div>
      </div>

      {/* Comparison Grid Table */}
      <div className="mt-3 flex flex-1 flex-col overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 shadow-inner dark:border-slate-800 dark:bg-slate-950/40">
        {/* Table Header Row */}
        <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-100/90 py-2.5 font-semibold text-xs tracking-tight text-slate-700 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200">
          {headers.map((h, i) => (
            <div
              key={i}
              className={`px-3 ${
                i === 0 ? "flex-1 font-bold text-slate-600 dark:text-slate-400" : "flex-1 font-bold text-center"
              }`}
              style={{
                color: i > 0 ? (i === 1 ? "#2563eb" : "#7c3aed") : undefined,
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Table Content Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {rows.map((row, rIdx) => {
            const isEven = rIdx % 2 === 0;
            return (
              <div
                key={rIdx}
                className={`flex items-center py-2 text-xs transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20 ${
                  isEven ? "bg-white/60 dark:bg-slate-900/40" : "bg-transparent"
                } ${row.highlight ? "font-semibold bg-amber-50/60 dark:bg-amber-950/30" : ""}`}
              >
                {/* Feature Column */}
                <div className="flex-1 px-3 font-medium text-slate-600 dark:text-slate-300">
                  {row.feature}
                </div>

                {/* Compared Value Columns */}
                {row.values.map((val, cIdx) => (
                  <div
                    key={cIdx}
                    className="flex-1 px-3 text-center text-slate-700 dark:text-slate-200"
                  >
                    {val}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
