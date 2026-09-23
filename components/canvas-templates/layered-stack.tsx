"use client";

import React, { useMemo } from "react";
import { getThemeColor } from "./theme";

export interface StackLayer {
  layerNumber?: number | string;
  label: string;
  detail?: string;
  protocols?: string[];
  color?: string;
}

export interface LayeredStackData {
  title?: string;
  subtitle?: string;
  themeColor?: string;
  direction?: "top-to-bottom" | "bottom-to-top";
  layers?: StackLayer[];
}

interface LayeredStackProps {
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  themeColor?: string;
  data: LayeredStackData;
}

export function LayeredStackTemplate({
  w,
  h,
  title: propTitle,
  subtitle: propSubtitle,
  themeColor: propThemeColor,
  data,
}: LayeredStackProps) {
  const title = data?.title || propTitle || "Layered Architecture Stack";
  const subtitle = data?.subtitle || propSubtitle || "Hierarchical Abstraction & Protocol Strata";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "violet");

  const layers = useMemo<StackLayer[]>(() => {
    const raw = Array.isArray(data?.layers) ? data.layers : [];
    if (raw.length === 0) {
      return [
        {
          layerNumber: 7,
          label: "Application Layer",
          detail: "Human-computer interaction & network services interface.",
          protocols: ["HTTP", "DNS", "SSH", "gRPC"],
          color: "violet",
        },
        {
          layerNumber: 4,
          label: "Transport Layer",
          detail: "End-to-end connections, segmentation, flow control, and reliability.",
          protocols: ["TCP", "UDP", "QUIC"],
          color: "blue",
        },
        {
          layerNumber: 3,
          label: "Network Layer",
          detail: "Logical addressing, routing across internetwork hops, and packetization.",
          protocols: ["IPv4", "IPv6", "BGP", "ICMP"],
          color: "cyan",
        },
        {
          layerNumber: 2,
          label: "Data Link Layer",
          detail: "Physical node-to-node frame transfer and MAC addressing.",
          protocols: ["Ethernet", "802.11 WiFi", "ARP"],
          color: "emerald",
        },
        {
          layerNumber: 1,
          label: "Physical Layer",
          detail: "Transmission of unstructured raw bit streams over physical medium.",
          protocols: ["Fiber Optics", "Copper CAT6", "Radio RF"],
          color: "slate",
        },
      ];
    }

    return raw.map((l, idx) => ({
      layerNumber: l.layerNumber ?? raw.length - idx,
      label: l.label || `Layer ${raw.length - idx}`,
      detail: l.detail || "",
      protocols: Array.isArray(l.protocols) ? l.protocols : [],
      color: l.color || ["violet", "blue", "cyan", "emerald", "orange", "slate"][idx % 6],
    }));
  }, [data?.layers]);

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
            ≡
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
            {layers.length} Stack Layers
          </span>
        </div>
      </div>

      {/* Stack Layers List */}
      <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {layers.map((layer, idx) => {
          const lTheme = getThemeColor(layer.color);
          return (
            <div
              key={idx}
              className="group relative flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/90 p-2.5 shadow-xs transition-all hover:scale-[1.01] hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80"
              style={{
                borderLeft: `4px solid ${lTheme.primary}`,
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg font-bold text-[11px]"
                  style={{
                    backgroundColor: lTheme.bgLight,
                    color: lTheme.primary,
                    border: `1px solid ${lTheme.borderLight}`,
                  }}
                >
                  {layer.layerNumber}
                </span>

                <div>
                  <h5 className="font-semibold text-slate-800 text-xs tracking-tight dark:text-slate-100">
                    {layer.label}
                  </h5>
                  {layer.detail && (
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                      {layer.detail}
                    </p>
                  )}
                </div>
              </div>

              {/* Protocols / Tags Chips */}
              {layer.protocols && layer.protocols.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-1 pl-2">
                  {layer.protocols.map((proto, pIdx) => (
                    <span
                      key={pIdx}
                      className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {proto}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
