"use client";

import React, { useMemo } from "react";
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

export function NetworkGraphTemplate({
  w,
  h,
  title: propTitle,
  subtitle: propSubtitle,
  themeColor: propThemeColor,
  data,
}: NetworkGraphProps) {
  const title = data?.title || propTitle || "Neural Network Architecture";
  const subtitle = data?.subtitle || propSubtitle || "Multilayer Perceptron / Connected Layers";
  const theme = getThemeColor(data?.themeColor || propThemeColor || "violet");

interface NormalizedNode {
  id: string;
  label: string;
  sublabel?: string;
  val?: string | number;
  active?: boolean;
}

interface NormalizedGroup {
  id: string;
  label: string;
  color: string;
  nodes: NormalizedNode[];
}

  // Normalize groups
  const normalizedGroups = useMemo<NormalizedGroup[]>(() => {
    const rawGroups = Array.isArray(data?.groups) ? data.groups : [];
    if (rawGroups.length === 0) {
      return [
        {
          id: "g0",
          label: "Input Layer",
          color: "blue",
          nodes: [
            { id: "g0-n0", label: "x₁" },
            { id: "g0-n1", label: "x₂" },
            { id: "g0-n2", label: "x₃" },
          ],
        },
        {
          id: "g1",
          label: "Hidden Layer",
          color: "violet",
          nodes: [
            { id: "g1-n0", label: "h₁" },
            { id: "g1-n1", label: "h₂" },
            { id: "g1-n2", label: "h₃" },
            { id: "g1-n3", label: "h₄" },
          ],
        },
        {
          id: "g2",
          label: "Output Layer",
          color: "emerald",
          nodes: [{ id: "g2-n0", label: "ŷ" }],
        },
      ];
    }

    return rawGroups.map((group, gIdx) => {
      const gColor = group.color || (gIdx === 0 ? "blue" : gIdx === rawGroups.length - 1 ? "emerald" : "violet");
      const nodes: NormalizedNode[] = Array.isArray(group.nodes)
        ? group.nodes.map((node, nIdx) => {
            if (typeof node === "string") {
              return { id: `g${gIdx}-n${nIdx}`, label: node };
            }
            return {
              id: node?.id || `g${gIdx}-n${nIdx}`,
              label: node?.label || `N${nIdx + 1}`,
              sublabel: node?.sublabel,
              val: node?.val,
              active: node?.active,
            };
          })
        : [{ id: `g${gIdx}-n0`, label: `Node 1` }];

      return {
        id: group.id || `group-${gIdx}`,
        label: group.label || `Layer ${gIdx + 1}`,
        color: gColor,
        nodes,
      };
    });
  }, [data?.groups]);


  // Compute layout coordinates for SVG connections
  const numGroups = normalizedGroups.length;
  const paddingX = 40;
  const headerHeight = 70;
  const footerHeight = 24;
  const contentHeight = Math.max(120, h - headerHeight - footerHeight);
  const contentWidth = Math.max(200, w - paddingX * 2);

  const groupCenters = useMemo(() => {
    if (numGroups <= 1) return [w / 2];
    const step = contentWidth / (numGroups - 1);
    return normalizedGroups.map((_, i) => paddingX + i * step);
  }, [numGroups, contentWidth, w, normalizedGroups]);

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; color: string }>();

    normalizedGroups.forEach((group, gIdx) => {
      const gx = groupCenters[gIdx];
      const count = group.nodes.length;
      const stepY = count > 1 ? (contentHeight - 60) / (count - 1) : 0;
      const startY = count > 1 ? headerHeight + 30 : headerHeight + contentHeight / 2;

      group.nodes.forEach((node, nIdx) => {
        const ny = count > 1 ? startY + nIdx * stepY : startY;
        map.set(node.id, { x: gx, y: ny, color: group.color });
      });
    });

    return map;
  }, [normalizedGroups, groupCenters, headerHeight, contentHeight]);

  // Generate connection paths
  const connections = useMemo(() => {
    const rawConns = data?.connections ?? "fully-connected";
    const edges: {
      id: string;
      d: string;
      color: string;
      label?: string;
    }[] = [];

    if (rawConns === "fully-connected" || typeof rawConns === "string") {
      // Connect each group i to group i + 1
      for (let g = 0; g < normalizedGroups.length - 1; g++) {
        const fromGroup = normalizedGroups[g];
        const toGroup = normalizedGroups[g + 1];

        for (const fromNode of fromGroup.nodes) {
          const p1 = nodePositions.get(fromNode.id);
          if (!p1) continue;

          for (const toNode of toGroup.nodes) {
            const p2 = nodePositions.get(toNode.id);
            if (!p2) continue;

            const dx = (p2.x - p1.x) * 0.45;
            const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
            edges.push({
              id: `${fromNode.id}->${toNode.id}`,
              d,
              color: fromGroup.color,
            });
          }
        }
      }
    } else if (Array.isArray(rawConns)) {
      rawConns.forEach((conn, idx) => {
        const fromNodeId = String(conn.from);
        const toNodeId = String(conn.to);
        const p1 = nodePositions.get(fromNodeId);
        const p2 = nodePositions.get(toNodeId);
        if (p1 && p2) {
          const dx = (p2.x - p1.x) * 0.45;
          const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
          edges.push({
            id: `conn-${idx}`,
            d,
            color: p1.color,
            label: conn.label || (conn.weight != null ? String(conn.weight) : undefined),
          });
        }
      });
    }

    return edges;
  }, [data?.connections, normalizedGroups, nodePositions]);

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
            NN
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
            {normalizedGroups.length} Layers
          </span>
          <span className="rounded-full bg-purple-50 px-2 py-0.5 font-medium text-[10px] text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            Fully Connected
          </span>
        </div>
      </div>

      {/* SVG Connection Layer */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: 1 }}
      >
        <defs>
          <linearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={theme.primary} stopOpacity="0.4" />
            <stop offset="100%" stopColor={theme.secondary} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {connections.map((edge) => (
          <path
            key={edge.id}
            d={edge.d}
            fill="none"
            stroke="url(#edgeGlow)"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="transition-all duration-300 hover:stroke-purple-500 hover:opacity-100"
          />
        ))}
      </svg>

      {/* Layers Columns Container */}
      <div className="relative z-10 flex flex-1 items-stretch justify-between px-2 pt-2">
        {normalizedGroups.map((group, gIdx) => {
          const groupTheme = getThemeColor(group.color);
          return (
            <div
              key={group.id}
              className="flex flex-col items-center justify-between"
              style={{
                width: `${Math.min(140, contentWidth / numGroups)}px`,
              }}
            >
              {/* Group Header Badge */}
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-center font-semibold text-[11px] shadow-sm backdrop-blur-sm"
                style={{
                  backgroundColor: groupTheme.bgLight,
                  color: groupTheme.primary,
                  border: `1px solid ${groupTheme.borderLight}`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: groupTheme.primary }}
                />
                <span>{group.label}</span>
              </div>

              {/* Group Nodes Stack */}
              <div className="my-auto flex flex-col items-center justify-center gap-3 py-2">
                {group.nodes.map((node) => {
                  return (
                    <div
                      key={node.id}
                      className="group relative flex items-center justify-center"
                    >
                      {/* Outer Glow Ring */}
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white text-center font-semibold text-xs shadow-md transition-transform duration-200 group-hover:scale-110 dark:bg-slate-900"
                        style={{
                          borderColor: groupTheme.primary,
                          boxShadow: `0 0 12px ${groupTheme.glow}`,
                          color: groupTheme.primary,
                        }}
                      >
                        {node.label}
                      </div>

                      {/* Optional Sublabel or Value Tooltip */}
                      {node.sublabel && (
                        <span className="absolute -bottom-4 whitespace-nowrap rounded px-1 text-[9px] font-medium text-slate-500 dark:text-slate-400">
                          {node.sublabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Node count pill */}
              <div className="text-[10px] text-slate-400">
                {group.nodes.length} {group.nodes.length === 1 ? "neuron" : "neurons"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Edge Label or Flow Indicator */}
      <div className="z-10 mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-400 dark:border-slate-800">
        <span>◀ Forward Propagation</span>
        <span>Weights & Biases (W, b)</span>
        <span>Activation ▶</span>
      </div>
    </div>
  );
}
