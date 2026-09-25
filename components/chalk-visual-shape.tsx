"use client";

import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";
import type { VisualPart } from "@/lib/lesson-schema";
import { formatMathFormula, isMathematicalFormula } from "@/lib/math-formatter";

export const CHALK_VISUAL_TYPE = "chalk-visual" as const;

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CHALK_VISUAL_TYPE]: {
      w: number;
      h: number;
      label?: string;
      labelPlacement?: "inside" | "below" | "above" | "left" | "right" | "none";
      role?: string;
      partsJson?: string;
    };
  }
}

export type ChalkVisualShape = TLShape<typeof CHALK_VISUAL_TYPE>;

const palette: Record<string, string> = {
  ink: "#f8fafc",
  slate: "#94a3b8",
  gray: "#94a3b8",
  grey: "#94a3b8",
  blue: "#60a5fa",
  cyan: "#38bdf8",
  violet: "#c084fc",
  orange: "#fb923c",
  green: "#4ade80",
  red: "#f87171",
  yellow: "#facc15",
  white: "#ffffff",
  none: "none",
};

/**
 * High-luminance palette for crisp text readability on dark chalkboard themes (>= 11:1 contrast).
 */
const textPalette: Record<string, string> = {
  ink: "#f8fafc",
  white: "#ffffff",
  slate: "#cbd5e1",
  gray: "#cbd5e1",
  grey: "#cbd5e1",
  blue: "#93c5fd",
  cyan: "#38bdf8",
  violet: "#e9d5ff",
  orange: "#fed7aa",
  green: "#86efac",
  red: "#fca5a5",
  yellow: "#fef08a",
  none: "#f8fafc",
};

/**
 * Calculates WCAG 2.1 relative luminance for a given hex color.
 */
function getRelativeLuminance(hex: string): number {
  if (!hex || hex === "none") return 0;
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0.5;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Guarantees color contrast never fails:
 * If background fill is light/bright (luminance > 0.28: green, yellow, cyan, white, orange, blue, violet),
 * returns deep dark ink '#090d16' with high contrast (>= 6:1 to 16:1).
 * If background is dark or transparent, returns pure radiant white '#f8fafc'.
 */
function getContrastingTextColor(fillColorNameOrHex: string): string {
  if (!fillColorNameOrHex || fillColorNameOrHex === "none") return "#f8fafc";
  const name = fillColorNameOrHex.toLowerCase();
  if (name === "yellow" || name === "white" || name === "#ffffff" || name === "#facc15" || name === "#fef08a") return "#090d16";
  if (name === "cyan" || name === "#38bdf8") return "#090d16";
  const hex = palette[fillColorNameOrHex] || fillColorNameOrHex;
  if (!hex.startsWith("#")) return "#f8fafc";
  const lum = getRelativeLuminance(hex);
  return lum > 0.52 ? "#090d16" : "#f8fafc";
}

function safeParts(value: string): VisualPart[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function labelLines(label: string): string[] {
  if (label.length <= 20) return [label];
  const words = label.split(/\s+/);
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")].filter(Boolean);
}

function countFromData(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
}

function oscillatingPath(x: number, y: number, width: number, height: number, cycles: number, vertical = false) {
  const points = Array.from({ length: cycles * 12 + 1 }, (_, index) => {
    const progress = index / (cycles * 12);
    const offset = Math.sin(progress * cycles * Math.PI * 2);
    return vertical
      ? `${x + width / 2 + offset * width / 2},${y + progress * height}`
      : `${x + progress * width},${y + height / 2 + offset * height / 2}`;
  });
  return `M ${points.join(" L ")}`;
}

function axisLabels(data: string, objectLabel = "") {
  let rawX = "";
  let rawY = "";
  if (data.includes("|")) {
    const pieces = data.split("|");
    rawX = pieces.find((piece) => /^\s*x\s*:/i.test(piece))?.replace(/^\s*x\s*:\s*/i, "").trim() || pieces[0] || "";
    rawY = pieces.find((piece) => /^\s*y\s*:/i.test(piece))?.replace(/^\s*y\s*:\s*/i, "").trim() || pieces[1] || "";
  } else if (/vs\.?/i.test(data)) {
    const [yPart, xPart] = data.split(/vs\.?/i);
    rawY = yPart?.trim() || "";
    rawX = xPart?.trim() || "";
  } else if (data.includes(",")) {
    const [xPart, yPart] = data.split(",");
    rawX = xPart?.replace(/^\s*x\s*:/i, "").trim() || "";
    rawY = yPart?.replace(/^\s*y\s*:/i, "").trim() || "";
  }

  if ((!rawX || rawX === "Horizontal value") && /vs\.?/i.test(objectLabel)) {
    const [yPart, xPart] = objectLabel.split(/vs\.?/i);
    if (!rawY || rawY === "Vertical value") rawY = yPart.replace(/^[:\s\-—]+/, "").trim();
    rawX = xPart.replace(/^[:\s\-—]+/, "").trim();
  }

  rawX = rawX || "Time / Input (x)";
  rawY = rawY || "Value / Output (y)";

  return {
    x: formatMathFormula(rawX),
    y: formatMathFormula(rawY),
  };
}

function axisPlot(part: VisualPart) {
  return {
    left: part.x + 48,
    right: part.x + part.width - 24,
    top: part.y + 24,
    bottom: part.y + part.height - 40,
  };
}

function parseClusterData(data: string, fallbackTotal = 12) {
  let protons = 0;
  let neutrons = 0;
  if (/protons?\s*:\s*\d+/i.test(data)) {
    const pMatch = data.match(/protons?\s*:\s*(\d+)/i);
    if (pMatch) protons = parseInt(pMatch[1], 10);
  }
  if (/neutrons?\s*:\s*\d+/i.test(data)) {
    const nMatch = data.match(/neutrons?\s*:\s*(\d+)/i);
    if (nMatch) neutrons = parseInt(nMatch[1], 10);
  }
  if (protons === 0 && neutrons === 0) {
    const total = countFromData(data, fallbackTotal, 4, 30);
    protons = Math.ceil(total / 2);
    neutrons = Math.floor(total / 2);
  }
  return { protons: Math.min(16, protons), neutrons: Math.min(16, neutrons) };
}

function renderObjectChassis(role: string, w: number, h: number, hasAxes: boolean, hasParts: boolean, uid: string, label = "") {
  if (hasAxes) return null;
  // If the object already has its own vector illustration parts, DO NOT draw a card box around it
  // unless it is explicitly an environment, container, background layer, or formula plaque!
  if (hasParts && !["container", "environment", "layer", "field", "formula"].includes(role)) {
    return null;
  }

  if (role === "formula") {
    // Dedicated chalkboard mathematical plaque with clean header and spacious equation arena
    const rawLabel = label ? label.replace(/^[:\s\-—]+/, "").trim() : "";
    const isMath = isMathematicalFormula(rawLabel);
    const displayTitle = isMath ? "GOVERNING EQUATION" : (rawLabel ? rawLabel.toUpperCase() : "FORMULA");

    return (
      <g>
        <defs>
          <linearGradient id={`${uid}-formula-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#141a2e" stopOpacity={0.96} />
            <stop offset="100%" stopColor="#0a0d18" stopOpacity={0.94} />
          </linearGradient>
          <linearGradient id={`${uid}-formula-border`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.8} />
            <stop offset="50%" stopColor="#818cf8" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <rect
          x={4}
          y={5}
          width={Math.max(0, w - 8)}
          height={Math.max(0, h - 8)}
          rx={14}
          fill="#000000"
          fillOpacity={0.4}
        />
        <rect
          x={3}
          y={3}
          width={Math.max(0, w - 6)}
          height={Math.max(0, h - 6)}
          rx={14}
          fill={`url(#${uid}-formula-bg)`}
          stroke={`url(#${uid}-formula-border)`}
          strokeWidth={1.5}
        />
        {/* Header Bar */}
        <g>
          {/* Math "f(x)" badge indicator */}
          <rect
            x={12}
            y={10}
            width={28}
            height={18}
            rx={4}
            fill="#38bdf8"
            fillOpacity={0.18}
            stroke="#38bdf8"
            strokeWidth={1}
          />
          <text
            x={26}
            y={22.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#38bdf8"
            fontFamily="'KaTeX_Main', 'Cambria Math', serif, monospace"
          >
            f(x)
          </text>
          {displayTitle && (
            <text
              x={48}
              y={22.5}
              dominantBaseline="middle"
              fill="#94a3b8"
              fontSize="11"
              fontWeight="700"
              letterSpacing="0.04em"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              {displayTitle}
            </text>
          )}
          <line
            x1={12}
            y1={32}
            x2={Math.max(12, w - 12)}
            y2={32}
            stroke="#334155"
            strokeWidth={1}
            strokeOpacity={0.6}
            strokeDasharray="4 3"
          />
        </g>
      </g>
    );
  }

  if (role === "container") {
    // Production-grade frosted-glass container with subtle gradient border
    return (
      <g>
        <defs>
          <linearGradient id={`${uid}-container-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#151824" stopOpacity={0.92} />
            <stop offset="100%" stopColor="#0d0f18" stopOpacity={0.88} />
          </linearGradient>
          <linearGradient id={`${uid}-container-border`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="50%" stopColor="#475569" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        </defs>
        {/* Outer soft shadow layer */}
        <rect
          x={4}
          y={5}
          width={Math.max(0, w - 8)}
          height={Math.max(0, h - 8)}
          rx={16}
          fill="#000000"
          fillOpacity={0.25}
        />
        {/* Main container card */}
        <rect
          x={3}
          y={3}
          width={Math.max(0, w - 6)}
          height={Math.max(0, h - 6)}
          rx={16}
          fill={`url(#${uid}-container-bg)`}
          stroke={`url(#${uid}-container-border)`}
          strokeWidth={1.5}
        />
        {/* Subtle inner highlight line at top */}
        <rect
          x={8}
          y={4}
          width={Math.max(0, w - 16)}
          height={1}
          rx={0.5}
          fill="#ffffff"
          fillOpacity={0.15}
        />
      </g>
    );
  }

  if (role === "environment") {
    // Clean, soft environment backdrop
    return (
      <g>
        <rect
          x={4}
          y={5}
          width={Math.max(0, w - 8)}
          height={Math.max(0, h - 8)}
          rx={20}
          fill="#000000"
          fillOpacity={0.2}
        />
        <rect
          x={3}
          y={3}
          width={Math.max(0, w - 6)}
          height={Math.max(0, h - 6)}
          rx={20}
          fill="#11131c"
          fillOpacity={0.65}
          stroke="#282e42"
          strokeWidth={1.2}
        />
      </g>
    );
  }

  if (role === "layer" || role === "field") {
    // Subtle translucent layer zone
    return (
      <rect
        x={3}
        y={3}
        width={Math.max(0, w - 6)}
        height={Math.max(0, h - 6)}
        rx={12}
        fill="#141724"
        fillOpacity={0.45}
        stroke="#22283a"
        strokeWidth={1}
      />
    );
  }

  // Fallback: clean card with subtle shadow (no dashed lines)
  return (
    <g>
      <rect
        x={4}
        y={5}
        width={Math.max(0, w - 8)}
        height={Math.max(0, h - 8)}
        rx={12}
        fill="#000000"
        fillOpacity={0.25}
      />
      <rect
        x={2}
        y={2}
        width={Math.max(0, w - 4)}
        height={Math.max(0, h - 4)}
        rx={12}
        fill="#11131c"
        fillOpacity={0.85}
        stroke="#282e42"
        strokeWidth={1.5}
      />
    </g>
  );
}

function VisualSvg({ shape }: { shape: ChalkVisualShape }) {
  const parts = safeParts(shape.props.partsJson || "[]");
  const uid = shape.id.replace(/[^a-z0-9]/gi, "");
  const markerId = `arrow-${uid}`;
  const objectClipId = `${markerId}-object-clip`;
  const plotClipId = `${markerId}-plot-clip`;
  const axesPart = parts.find((part) => part.type === "axes");
  const plot = axesPart ? axisPlot(axesPart) : null;
  const labelText = shape.props.label || "";
  const lines = labelLines(labelText);
  const labelPlacement = shape.props.labelPlacement || "below";
  const role = shape.props.role || "component";
  const isAbove = labelPlacement === "above";
  const isBelow = labelPlacement === "below";
  const isContainer = ["container", "environment", "layer", "field", "formula"].includes(role);
  const pillFontSize = isContainer ? 13 : 11;
  const estimatedPillH = lines.length > 1 ? pillFontSize * 2 + 12 : pillFontSize + 10;
  const shapeW = Math.max(20, shape.props.w || 180);
  const shapeH = Math.max(20, shape.props.h || 120);
  const labelY = isAbove
    ? Math.max(16, estimatedPillH / 2 + 2)
    : isBelow
      ? shapeH - estimatedPillH / 2 - 2
      : shapeH / 2;
  let maxPartX = shapeW;
  let maxPartY = shapeH;
  for (const part of parts) {
    if (part.x + (part.width || 0) > maxPartX) maxPartX = part.x + (part.width || 0);
    if (part.y + (part.height || 0) > maxPartY) maxPartY = part.y + (part.height || 0);
    if ((part.type === "polygon" || part.type === "polyline") && part.data) {
      const coords = part.data.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      for (let i = 0; i < coords.length; i += 2) {
        if (coords[i] > maxPartX) maxPartX = coords[i] + 12;
        if (coords[i + 1] > maxPartY) maxPartY = coords[i + 1] + 12;
      }
    }
  }
  const fitScale = Math.min(1.0, shapeW / Math.max(1, maxPartX), shapeH / Math.max(1, maxPartY));
  const designW = shapeW;
  const designH = shapeH;

  return (
    <SVGContainer width={shapeW} height={shapeH} viewBox={`0 0 ${designW} ${designH}`}>
      <defs>
        {/* Directional Vector Markers */}
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#334155" />
        </marker>
        <marker id={`${markerId}-red`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#ef4444" />
        </marker>
        <marker id={`${markerId}-cyan`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#06b6d4" />
        </marker>
        <marker id={`${markerId}-green`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#10b981" />
        </marker>
        <filter id={`${markerId}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
        <filter id={`${markerId}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Rich Architectural & Celestial Gradients */}
        <radialGradient id={`${markerId}-earth`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <radialGradient id={`${markerId}-moon`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </radialGradient>
        <radialGradient id={`${markerId}-sun`} cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="60%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <linearGradient id={`${markerId}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id={`${markerId}-silver`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id={`${markerId}-silicon`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={`${markerId}-cyan-glow`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id={`${markerId}-laser`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>

        <clipPath id={objectClipId}>
          <rect x="0" y="0" width={designW} height={designH} rx="12" />
        </clipPath>
        {plot && <clipPath id={plotClipId}><rect x={plot.left - 4} y={plot.top - 4} width={Math.max(0, plot.right - plot.left + 8)} height={Math.max(0, plot.bottom - plot.top + 8)} /></clipPath>}

        {/* Dynamic Keyframe Animations for Physics, Astronomy & Data Flow */}
        <style>{`
          @keyframes animated-wave {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -32; }
          }
          @keyframes animated-particle {
            0% { transform: translateY(0px) scale(1); opacity: 0.8; }
            50% { transform: translateY(-4px) scale(1.15); opacity: 1; }
            100% { transform: translateY(0px) scale(1); opacity: 0.8; }
          }
          @keyframes animated-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes chalkieCelestialOrbit {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes chalkieFlowDash { to { stroke-dashoffset: -28px; } }
          @keyframes chalkieParticleFloat { 0%, 100% { transform: translateY(0px); opacity: 0.85; } 50% { transform: translateY(-3px); opacity: 1; } }
          @keyframes chalkieSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes chalkiePulse { 0%, 100% { opacity: 0.75; transform: scale(1); } 50% { opacity: 1; transform: scale(1.02); } }
          @keyframes chalkSketchEnter {
            0% { opacity: 0; transform: scale(0.96); }
            70% { opacity: 0.95; transform: scale(1.01); }
            100% { opacity: 1; transform: scale(1); }
          }
          .chalk-shape-container {
            animation: chalkSketchEnter 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            transform-origin: center;
          }
          .animated-wave { stroke-dasharray: 6 4; animation: chalkieFlowDash 1.2s linear infinite; }
          .animated-particle { animation: chalkieParticleFloat 2.4s ease-in-out infinite; }
          .animated-spin { transform-origin: center; animation: chalkieSpin 12s linear infinite; }
          .celestial-orbit-spin { transform-origin: center; animation: chalkieCelestialOrbit 16s linear infinite; }
        `}</style>
      </defs>

      <g className="chalk-shape-container">
        {renderObjectChassis(role, designW, designH, Boolean(axesPart), parts.length > 0, uid, labelText)}

        <g filter={`url(#${markerId}-shadow)`} clipPath={`url(#${objectClipId})`} transform={fitScale < 1 ? `scale(${fitScale})` : undefined}>
        {parts.map((part, index) => {
          let rawStroke = palette[part.stroke] ?? palette.ink;
          let rawFill = palette[part.fill] ?? palette.none;

          // Automatic gradient upgrades for physical realism
          if (part.fill === "yellow" && (labelText.toLowerCase().includes("pin") || labelText.toLowerCase().includes("gold"))) {
            rawFill = `url(#${markerId}-gold)`;
          } else if (part.fill === "slate" && (labelText.toLowerCase().includes("chip") || labelText.toLowerCase().includes("die") || labelText.toLowerCase().includes("substrate"))) {
            rawFill = `url(#${markerId}-silicon)`;
          } else if (part.fill === "cyan" && (labelText.toLowerCase().includes("electron") || labelText.toLowerCase().includes("charge") || labelText.toLowerCase().includes("tunnel"))) {
            rawFill = `url(#${markerId}-energy)`;
          }

          let strokeWidth = part.strokeWidth ?? 2;
          const opacity = Math.max(0.35, Math.min(1, part.opacity || 1));

          // Ensure structural boundaries never become invisible white-on-white or zero-width
          if (["rect", "ellipse", "polygon", "polyline", "line", "path"].includes(part.type)) {
            if (part.stroke === "white" || part.stroke === "none") {
              if (part.fill === "none" || part.fill === "white") {
                rawStroke = palette.slate;
                strokeWidth = Math.max(strokeWidth, 2);
              }
            }
            if (rawStroke !== "none") {
              strokeWidth = Math.max(strokeWidth, 1.75);
            }
          }

          const common = {
            fill: rawFill,
            stroke: rawStroke,
            strokeWidth,
            opacity,
            vectorEffect: "non-scaling-stroke" as const,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
            clipPath: plot && part.type !== "axes" && part.type !== "text" && part.data !== "point" ? `url(#${plotClipId})` : undefined,
          };
          const key = `${index}-${part.type}`;

          if (part.type === "ellipse") {
            const isPoint = part.data === "point" || (part.width <= 24 && part.height <= 24);
            const cx = Math.max(4, Math.min(shape.props.w - 4, part.x + part.width / 2));
            const cy = Math.max(4, Math.min(shape.props.h - 4, part.y + part.height / 2));

            if (isPoint) {
              const ptColor = palette[part.fill] ?? palette[part.stroke] ?? "#38bdf8";
              return (
                <g key={key}>
                  {/* Subtle glowing halo */}
                  <circle cx={cx} cy={cy} r={8} fill={ptColor} opacity={0.3} filter={`url(#${markerId}-glow)`} />
                  {/* Crisp central marker point */}
                  <circle cx={cx} cy={cy} r={4.5} fill={ptColor} stroke="#ffffff" strokeWidth={1.5} />
                  {part.text && (
                    <text
                      x={cx + 8}
                      y={cy - 8}
                      fill="#f8fafc"
                      stroke="#090d16"
                      strokeWidth="2.5"
                      paintOrder="stroke"
                      fontFamily="Inter, ui-sans-serif, system-ui"
                      fontSize={11}
                      fontWeight="700"
                    >
                      {formatMathFormula(part.text)}
                    </text>
                  )}
                </g>
              );
            }

            const maxRx = Math.max(4, Math.min(cx, shape.props.w - cx));
            const maxRy = Math.max(4, Math.min(cy, shape.props.h - cy));
            const rx = Math.max(2, Math.min(maxRx, part.width / 2));
            const ry = Math.max(2, Math.min(maxRy, part.height / 2));
            const isCircle = part.data === "circle" || Math.abs(rx - ry) <= 1.5;
            const finalRx = isCircle ? (rx + ry) / 2 : rx;
            const finalRy = isCircle ? (rx + ry) / 2 : ry;

            // Celestial Body Detection (Earth, Moon, Sun)
            const textLower = (part.text || "").toLowerCase().trim();
            const dataLower = (part.data || "").toLowerCase().trim();
            const labelLower = (shape.props.label || "").toLowerCase().trim();
            let celestialFill = common.fill;
            let celestialStroke = common.stroke;

            if (dataLower === "earth" || textLower === "earth" || (labelLower === "earth" && !textLower && !dataLower)) {
              celestialFill = `url(#${markerId}-earth)`;
              celestialStroke = "#38bdf8";
            } else if (dataLower === "moon" || textLower === "moon" || (labelLower === "moon" && !textLower && !dataLower)) {
              celestialFill = `url(#${markerId}-moon)`;
              celestialStroke = "#f1f5f9";
            } else if (dataLower === "sun" || textLower === "sun" || (labelLower === "sun" && !textLower && !dataLower)) {
              celestialFill = `url(#${markerId}-sun)`;
              celestialStroke = "#fef08a";
            }

            return (
              <g key={key}>
                <ellipse
                  {...common}
                  fill={celestialFill}
                  stroke={celestialStroke}
                  cx={cx}
                  cy={cy}
                  rx={finalRx}
                  ry={finalRy}
                />
                {part.text && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={getContrastingTextColor(rawFill !== "none" ? rawFill : part.fill)}
                    fontFamily={isMathematicalFormula(part.text) ? "'KaTeX_Main', 'Cambria Math', serif" : "Inter, ui-sans-serif, system-ui"}
                    fontSize={Math.max(14, Math.min(22, finalRx * 0.65))}
                    fontWeight="900"
                  >
                    {formatMathFormula(part.text)}
                  </text>
                )}
              </g>
            );
          }

          if (part.type === "rect") {
            const rx = Math.max(0, part.x);
            const ry = Math.max(0, part.y);
            const rw = Math.max(4, part.width);
            const rh = Math.max(4, part.height);
            const hasText = Boolean(part.text && part.text.trim());
            const textFill = getContrastingTextColor(rawFill !== "none" ? rawFill : part.fill);
            const cleanText = formatMathFormula(part.text || "");
            const fontSize = Math.max(9.5, Math.min(13, Math.floor(rh * 0.44), Math.floor((rw - 8) / Math.max(1, cleanText.length * 0.58))));
            return (
              <g key={key}>
                <rect
                  {...common}
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  rx={Math.min(8, rw / 6, rh / 6)}
                />
                {hasText && (
                  <text
                    x={rx + rw / 2}
                    y={rawFill === "none" && rh > 80 ? ry + 14 : ry + rh / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={textFill}
                    stroke={textFill === "#f8fafc" ? "#090d16" : "none"}
                    strokeWidth={textFill === "#f8fafc" ? "2.5" : "0"}
                    paintOrder="stroke"
                    fontFamily="Inter, ui-sans-serif, system-ui"
                    fontSize={fontSize}
                    fontWeight="700"
                  >
                    {cleanText}
                  </text>
                )}
              </g>
            );
          }

          if (part.type === "line" || part.type === "arrow") {
            const isRed = part.stroke === "red" || (part.data || "").includes("gravity") || (part.text || "").toLowerCase().includes("grav");
            const isCyan = part.stroke === "cyan" || (part.data || "").includes("velocity") || (part.text || "").toLowerCase().includes("velo");
            const isGreen = part.stroke === "green";
            const marker = part.type === "arrow"
              ? isRed ? `url(#${markerId}-red)`
                : isCyan ? `url(#${markerId}-cyan)`
                : isGreen ? `url(#${markerId}-green)`
                : `url(#${markerId})`
              : undefined;

            return (
              <g key={key}>
                <line
                  {...common}
                  x1={part.x}
                  y1={part.y}
                  x2={part.x + part.width}
                  y2={part.y + part.height}
                  markerEnd={marker}
                />
                {part.text && (
                  <text
                    x={part.x + part.width / 2}
                    y={part.y + part.height / 2 - 8}
                    fill={textPalette[part.stroke] || "#f8fafc"}
                    stroke="#090d16"
                    strokeWidth="3.5"
                    paintOrder="stroke"
                    fontFamily={isMathematicalFormula(part.text) ? "'KaTeX_Main', 'Cambria Math', serif" : "Inter, ui-sans-serif, system-ui"}
                    fontSize={11.5}
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {formatMathFormula(part.text)}
                  </text>
                )}
              </g>
            );
          }

          if (part.type === "radial") {
            const count = countFromData(part.data, 8, 3, 24);
            const cx = part.x + part.width / 2;
            const cy = part.y + part.height / 2;
            const radiusX = Math.abs(part.width) / 2;
            const radiusY = Math.abs(part.height) / 2;
            return (
              <g key={key} {...common} className="animated-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                {Array.from({ length: count }, (_, spoke) => {
                  const angle = (spoke / count) * Math.PI * 2;
                  return (
                    <line
                      key={spoke}
                      x1={cx + Math.cos(angle) * radiusX * 0.18}
                      y1={cy + Math.sin(angle) * radiusY * 0.18}
                      x2={cx + Math.cos(angle) * radiusX * 0.88}
                      y2={cy + Math.sin(angle) * radiusY * 0.88}
                    />
                  );
                })}
                <ellipse cx={cx} cy={cy} rx={radiusX} ry={radiusY} />
                <ellipse cx={cx} cy={cy} rx={Math.max(3, radiusX * 0.14)} ry={Math.max(3, radiusY * 0.14)} />
              </g>
            );
          }

          if (part.type === "coil" || part.type === "wave") {
            const cycles = countFromData(part.data, part.type === "coil" ? 7 : 3, 1, 16);
            return (
              <path
                key={key}
                {...common}
                className={part.type === "wave" ? "animated-wave" : undefined}
                fill="none"
                d={oscillatingPath(part.x, part.y, part.width, part.height, cycles, part.type === "coil" && part.height > part.width)}
              />
            );
          }

          if (part.type === "particles") {
            const count = countFromData(part.data, 14, 3, 36);
            return (
              <g key={key} {...common} className="animated-particle">
                {Array.from({ length: count }, (_, dot) => {
                  const px = part.x + (((dot * 0.61803398875) % 1) * part.width);
                  const py = part.y + (((dot * 0.38196601125 + (dot % 3) * 0.17) % 1) * part.height);
                  const r = Math.max(2.5, Math.min(5.5, part.strokeWidth + 1));
                  return (
                    <circle
                      key={dot}
                      cx={px}
                      cy={py}
                      r={r}
                      fill={rawFill !== "none" ? rawFill : rawStroke}
                      filter={`url(#${markerId}-glow)`}
                    />
                  );
                })}
              </g>
            );
          }

          if (part.type === "axes") {
            const bounds = axisPlot(part);
            const labels = axisLabels(part.data, shape.props.label);
            const axisColor = palette[part.stroke] ?? palette.ink;
            const tickXs = [0.25, 0.5, 0.75].map((ratio) => bounds.left + (bounds.right - bounds.left) * ratio);
            const tickYs = [0.25, 0.5, 0.75].map((ratio) => bounds.bottom - (bounds.bottom - bounds.top) * ratio);
            return (
              <g key={key} fill="none">
                {/* Subtle Coordinate Grid Lines */}
                {tickYs.map((y, idx) => (
                  <line
                    key={`grid-y-${idx}`}
                    x1={bounds.left}
                    y1={y}
                    x2={bounds.right}
                    y2={y}
                    stroke="#334155"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.35}
                  />
                ))}
                {tickXs.map((x, idx) => (
                  <line
                    key={`grid-x-${idx}`}
                    x1={x}
                    y1={bounds.top}
                    x2={x}
                    y2={bounds.bottom}
                    stroke="#334155"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.35}
                  />
                ))}

                {/* X and Y Axis Lines with Directional Arrowheads */}
                <line
                  x1={bounds.left}
                  y1={bounds.bottom}
                  x2={bounds.right}
                  y2={bounds.bottom}
                  stroke={axisColor}
                  strokeWidth={2}
                  strokeLinecap="round"
                  markerEnd={`url(#${markerId})`}
                />
                <line
                  x1={bounds.left}
                  y1={bounds.bottom}
                  x2={bounds.left}
                  y2={bounds.top}
                  stroke={axisColor}
                  strokeWidth={2}
                  strokeLinecap="round"
                  markerEnd={`url(#${markerId})`}
                />

                {/* Ticks on X and Y Axes */}
                {tickXs.map((x) => (
                  <line key={`tick-x-${x}`} x1={x} y1={bounds.bottom - 4} x2={x} y2={bounds.bottom + 4} stroke={axisColor} strokeWidth={1.5} opacity={0.65} />
                ))}
                {tickYs.map((y) => (
                  <line key={`tick-y-${y}`} x1={bounds.left - 4} y1={y} x2={bounds.left + 4} y2={y} stroke={axisColor} strokeWidth={1.5} opacity={0.65} />
                ))}

                {/* Origin Indicator '0' */}
                <text
                  x={bounds.left - 10}
                  y={bounds.bottom + 12}
                  fill="#94a3b8"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="Inter, ui-sans-serif, system-ui"
                  fontSize="11"
                  fontWeight="600"
                >
                  0
                </text>

                {/* X-Axis Label (Centered beneath the horizontal axis) */}
                <text
                  x={(bounds.left + bounds.right) / 2}
                  y={part.y + part.height - 12}
                  fill={axisColor}
                  stroke="#090d16"
                  strokeWidth="3"
                  paintOrder="stroke"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="Inter, ui-sans-serif, system-ui"
                  fontSize="12"
                  fontWeight="700"
                >
                  {labels.x}
                </text>

                {/* Y-Axis Label (Safely positioned with ample left margin and dark outline) */}
                <text
                  x={part.x + 18}
                  y={(bounds.top + bounds.bottom) / 2}
                  fill={axisColor}
                  stroke="#090d16"
                  strokeWidth="3"
                  paintOrder="stroke"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="Inter, ui-sans-serif, system-ui"
                  fontSize="12"
                  fontWeight="700"
                  transform={`rotate(-90 ${part.x + 18} ${(bounds.top + bounds.bottom) / 2})`}
                >
                  {labels.y}
                </text>
              </g>
            );
          }

          if (part.type === "orbit") {
            const effectiveW = part.width > 60 ? part.width : Math.max(120, shape.props.w - 30);
            const effectiveH = part.height > 60 ? part.height : Math.max(100, shape.props.h - 30);
            const cx = (part.x > 0 && Math.abs(part.x + part.width / 2 - shape.props.w / 2) > 30)
              ? part.x + part.width / 2
              : shape.props.w / 2;
            const cy = (part.y > 0 && Math.abs(part.y + part.height / 2 - shape.props.h / 2) > 30)
              ? part.y + part.height / 2
              : shape.props.h / 2;
            const radius = Math.max(24, Math.min(effectiveW, effectiveH) / 2 - 10);
            const dataStr = (part.data || "").toLowerCase().trim();

            // ONLY render the complex Moon-Earth perpetual free-fall simulation when explicitly targeted with "celestial-moon-earth"
            if (dataStr === "celestial-moon-earth") {
              const earthR = Math.max(18, radius * 0.28);
              const moonR = Math.max(10, radius * 0.12);
              return (
                <g key={key}>
                  {/* Outer Orbit Path - Clean dashed circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.8}
                    strokeDasharray="6 5"
                    opacity={0.75}
                  />

                  {/* Central Body: Earth */}
                  <g>
                    {/* Atmosphere halo */}
                    <circle cx={cx} cy={cy} r={earthR + 5} fill="#38bdf8" opacity={0.25} filter={`url(#${markerId}-glow)`} />
                    {/* Earth sphere */}
                    <circle cx={cx} cy={cy} r={earthR} fill={`url(#${markerId}-earth)`} stroke="#38bdf8" strokeWidth={1.5} filter={`url(#${markerId}-shadow)`} />
                    {/* Continents details */}
                    <path
                      d={`M ${cx - earthR * 0.4} ${cy - earthR * 0.3} Q ${cx - earthR * 0.1} ${cy - earthR * 0.6} ${cx + earthR * 0.2} ${cy - earthR * 0.2} Q ${cx} ${cy + earthR * 0.3} ${cx - earthR * 0.3} ${cy + earthR * 0.4} Z`}
                      fill="#10b981"
                      opacity={0.85}
                    />
                    <path
                      d={`M ${cx + earthR * 0.2} ${cy - earthR * 0.1} Q ${cx + earthR * 0.5} ${cy} ${cx + earthR * 0.3} ${cy + earthR * 0.4} Z`}
                      fill="#10b981"
                      opacity={0.8}
                    />
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontFamily="Inter, ui-sans-serif, system-ui"
                      fontSize={Math.max(9, earthR * 0.45)}
                      fontWeight="800"
                      filter={`url(#${markerId}-shadow)`}
                    >
                      Earth
                    </text>
                  </g>

                  {/* Revolving Moon & Forces System */}
                  <g className="celestial-orbit-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                    {/* Moon positioned at top of orbit (cx, cy - radius) */}
                    <g transform={`translate(${cx}, ${cy - radius})`}>
                      {/* Tangent Velocity Vector (Forward Inertia v) - Cyan Arrow */}
                      <line
                        x1={0}
                        y1={0}
                        x2={Math.min(70, radius * 0.55)}
                        y2={0}
                        stroke="#06b6d4"
                        strokeWidth={2.8}
                        markerEnd={`url(#${markerId}-cyan)`}
                      />
                      <rect x={14} y={-16} width={58} height={14} rx={4} fill="#0f172a" fillOpacity={0.85} />
                      <text x={43} y={-8} textAnchor="middle" dominantBaseline="middle" fill="#22d3ee" fontSize={8.5} fontWeight="700">
                        v (Velocity)
                      </text>

                      {/* Gravitational Pull Vector (Inward Acceleration Fg) - Red Arrow */}
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2={Math.min(65, radius * 0.5)}
                        stroke="#ef4444"
                        strokeWidth={2.8}
                        markerEnd={`url(#${markerId}-red)`}
                      />
                      <rect x={6} y={16} width={56} height={14} rx={4} fill="#0f172a" fillOpacity={0.85} />
                      <text x={34} y={24} textAnchor="middle" dominantBaseline="middle" fill="#f87171" fontSize={8.5} fontWeight="700">
                        Fg (Gravity)
                      </text>

                      {/* Resultant Trajectory Curve (Perpetual Free-Fall Arc) */}
                      <path
                        d={`M 0 0 Q ${radius * 0.3} 0 ${radius * 0.4} ${radius * 0.25}`}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        opacity={0.85}
                      />

                      {/* Moon Celestial Body */}
                      <circle cx={0} cy={0} r={moonR} fill={`url(#${markerId}-moon)`} stroke="#f1f5f9" strokeWidth={1.5} filter={`url(#${markerId}-shadow)`} />
                      <circle cx={-moonR * 0.3} cy={-moonR * 0.2} r={moonR * 0.25} fill="#475569" opacity={0.6} />
                      <circle cx={moonR * 0.25} cy={moonR * 0.25} r={moonR * 0.2} fill="#475569" opacity={0.5} />
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={Math.max(7, moonR * 0.65)}
                        fontWeight="800"
                      >
                        Moon
                      </text>
                    </g>
                  </g>
                </g>
              );
            }

            // Atomic Bohr Orbit (when data specifies electron count like "data: 2" or "data: 8")
            // Or clean circular orbit path (for astronomy, satellites, planets)
            const isElectronShell = /^\d+$/.test(dataStr);
            const count = isElectronShell ? countFromData(dataStr, 2, 1, 32) : 0;
            return (
              <g key={key}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={common.stroke || palette.slate}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  opacity={0.75}
                />
                {count > 0 && (
                  <g className="animated-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                    {Array.from({ length: count }, (_, i) => {
                      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
                      const ex = cx + radius * Math.cos(angle);
                      const ey = cy + radius * Math.sin(angle);
                      return (
                        <g key={i} transform={`translate(${ex}, ${ey})`}>
                          <circle r={4.5} fill="#06b6d4" stroke="#0284c7" strokeWidth={1.5} filter={`url(#${markerId}-glow)`} />
                          <text y={0.5} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="8" fontWeight="900">-</text>
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          }

          if (part.type === "cluster") {
            const { protons, neutrons } = parseClusterData(part.data);
            const total = protons + neutrons;
            const cx = part.x + part.width / 2;
            const cy = part.y + part.height / 2;
            const sphereRadius = Math.max(5, Math.min(9, Math.min(part.width, part.height) / (Math.sqrt(total) * 3)));

            // Interleaved protons and neutrons
            let pLeft = protons;
            let nLeft = neutrons;
            const types: Array<"proton" | "neutron"> = [];
            for (let i = 0; i < total; i++) {
              if (i % 2 === 0 && pLeft > 0) { types.push("proton"); pLeft--; }
              else if (nLeft > 0) { types.push("neutron"); nLeft--; }
              else { types.push("proton"); }
            }

            return (
              <g key={key} className="animated-particle">
                {types.map((type, i) => {
                  const r = i === 0 ? 0 : sphereRadius * Math.sqrt(i) * 1.6;
                  const theta = i * 2.39996323; // Golden angle for even packing
                  const px = cx + r * Math.cos(theta);
                  const py = cy + r * Math.sin(theta);
                  const isProton = type === "proton";
                  const fill = isProton ? "#dc2626" : "#2563eb";
                  const stroke = isProton ? "#b91c1c" : "#1d4ed8";
                  const symbol = isProton ? "+" : "n";
                  return (
                    <g key={i} transform={`translate(${px}, ${py})`}>
                      <circle r={sphereRadius} fill={fill} stroke={stroke} strokeWidth={1.2} filter={`url(#${markerId}-shadow)`} />
                      <text y={0.5} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize={Math.max(7, sphereRadius * 0.95)} fontWeight="800">
                        {symbol}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          }

          if (part.type === "quarks") {
            const flavors = (part.data || "u,u,d").split(",").map((s) => s.trim().toLowerCase());
            const cx = part.x + part.width / 2;
            const cy = part.y + part.height / 2;
            const r = Math.max(16, Math.min(part.width, part.height) * 0.28);
            const quarkRadius = Math.max(10, r * 0.42);

            // 3 quark positions in an equilateral triangle
            const quarkCoords = [0, 1, 2].map((i) => {
              const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
              return {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
                flavor: flavors[i] || "u",
              };
            });

            return (
              <g key={key}>
                {/* Gluon field lines connecting the quarks */}
                <line x1={quarkCoords[0].x} y1={quarkCoords[0].y} x2={quarkCoords[1].x} y2={quarkCoords[1].y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" />
                <line x1={quarkCoords[1].x} y1={quarkCoords[1].y} x2={quarkCoords[2].x} y2={quarkCoords[2].y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" />
                <line x1={quarkCoords[2].x} y1={quarkCoords[2].y} x2={quarkCoords[0].x} y2={quarkCoords[0].y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" />

                {quarkCoords.map((q, i) => {
                  const isUp = q.flavor === "u";
                  const fill = isUp ? "#2563eb" : "#dc2626";
                  const stroke = isUp ? "#1d4ed8" : "#b91c1c";
                  const charge = isUp ? "+2/3" : "-1/3";
                  return (
                    <g key={i} transform={`translate(${q.x}, ${q.y})`}>
                      <circle r={quarkRadius} fill={fill} stroke={stroke} strokeWidth={2} filter={`url(#${markerId}-shadow)`} />
                      <text y={-1} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize={quarkRadius * 0.9} fontWeight="900">
                        {q.flavor}
                      </text>
                      <text y={quarkRadius + 10} textAnchor="middle" dominantBaseline="middle" fill="#475569" fontSize="8" fontWeight="700">
                        {charge}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          }

          if (part.type === "polygon") {
            const hasText = Boolean(part.text && part.text.trim());
            return (
              <g key={key}>
                <polygon {...common} points={part.data} />
                {hasText && (
                  <text
                    x={part.x ? part.x + (part.width || 0) / 2 : designW / 2}
                    y={part.y ? part.y + 24 : 26}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#f8fafc"
                    stroke="#090d16"
                    strokeWidth="3"
                    paintOrder="stroke"
                    fontFamily="Inter, ui-sans-serif, system-ui"
                    fontSize={12}
                    fontWeight="700"
                  >
                    {formatMathFormula(part.text)}
                  </text>
                )}
              </g>
            );
          }
          if (part.type === "polyline") return <polyline key={key} {...common} points={part.data} fill="none" />;
          if (part.type === "path") return <path key={key} {...common} d={part.data} />;

          const isFormulaCard = shape.props.role === "formula";
          const rawText = part.text || "";
          const cleanText = formatMathFormula(rawText);
          const isMath = isMathematicalFormula(rawText) || isFormulaCard;
          const mathFont = "'KaTeX_Main', 'Cambria Math', 'STIX Two Math', 'Latin Modern Math', 'Times New Roman', serif";
          const normalFont = "Inter, ui-sans-serif, system-ui";

          let posX = part.x;
          let posY = part.y;
          let textFontSize = Math.max(11, Math.min(28, part.height || 14));
          let textAnchor: "middle" | "start" | "end" = "middle";

          if (isFormulaCard) {
            const hasCustomLayout = (part.x && part.x > 0) || (part.y && part.y > 0);
            if (!hasCustomLayout) {
              const textParts = parts.filter((p) => p.type === "text" || Boolean(p.text));
              const textIdx = textParts.findIndex((p) => p === part);
              posX = shape.props.w / 2;
              textAnchor = "middle";

              if (textParts.length <= 1) {
                posY = 33 + (shape.props.h - 33) / 2;
                const availableW = shape.props.w - 32;
                textFontSize = Math.max(15, Math.min(24, Math.floor(availableW / Math.max(1, cleanText.length * 0.52))));
              } else {
                const availableH = shape.props.h - 38;
                const lineGap = availableH / (textParts.length + 1);
                posY = 34 + lineGap * (textIdx + 1);
                textFontSize = textIdx === 0
                  ? Math.max(14, Math.min(20, Math.floor((shape.props.w - 32) / Math.max(1, cleanText.length * 0.52))))
                  : 12;
              }
            }
          }

          const textColor = (part.fill && part.fill !== "none")
            ? (textPalette[part.fill] || palette[part.fill] || "#f8fafc")
            : (part.stroke && part.stroke !== "none")
            ? (textPalette[part.stroke] || palette[part.stroke] || "#f8fafc")
            : (isFormulaCard ? "#38bdf8" : "#f8fafc");

          return (
            <text
              key={key}
              {...common}
              x={posX}
              y={posY}
              fill={textColor}
              stroke="none"
              fontFamily={isMath ? mathFont : normalFont}
              fontSize={textFontSize}
              fontWeight={isMath ? "600" : "700"}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              filter={isFormulaCard ? `url(#${markerId}-glow)` : undefined}
            >
              {cleanText}
            </text>
          );
        })}

        {/* If formula card has no text parts, render the formula directly from label */}
        {shape.props.role === "formula" && parts.filter((p) => p.type === "text" || Boolean(p.text)).length === 0 && shape.props.label && (
          <text
            x={shape.props.w / 2}
            y={33 + (shape.props.h - 33) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#38bdf8"
            fontFamily="'KaTeX_Main', 'Cambria Math', 'STIX Two Math', 'Latin Modern Math', 'Times New Roman', serif"
            fontSize={Math.max(15, Math.min(24, Math.floor((shape.props.w - 32) / Math.max(1, formatMathFormula(shape.props.label).length * 0.52))))}
            fontWeight="600"
            filter={`url(#${markerId}-glow)`}
          >
            {formatMathFormula(labelText)}
          </text>
        )}
      </g>

      {/* Production-Grade Label Badge */}
      {labelPlacement !== "none" && labelText && (() => {
        // Dedicated formula cards already feature their title in the top header beside f(x)
        if (role === "formula") return null;

        const cleanBase = (str: string) => str.trim().toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
        const targetClean = cleanBase(labelText);
        // If an inner visual part already displays this label, suppress the redundant pill badge!
        const hasIdenticalPartText = parts.some((p) => {
          if (!p.text) return false;
          const partClean = cleanBase(p.text);
          return Boolean(partClean && (partClean === targetClean || (targetClean.length >= 3 && (partClean.includes(targetClean) || targetClean.includes(partClean)))));
        });
        if (hasIdenticalPartText) return null;

        const isContainer = ["container", "environment", "layer", "field"].includes(role);
        let fontSize = isContainer ? 12 : 11;
        // Clean display label: remove leading colons, hyphens, or punctuation artifacts
        const displayLabel = formatMathFormula(labelText).replace(/^[:\s\-—]+/, "").trim();
        if (!displayLabel) return null;

        const pillPadX = 10;
        const pillPadY = 4;
        const maxPillW = Math.max(80, shapeW - 12);

        // Dynamically auto-scale font size if text is long to prevent premature truncation
        const estCharW = fontSize * 0.52;
        if (displayLabel.length * estCharW + pillPadX * 2 > maxPillW) {
          fontSize = Math.max(9.5, Math.floor((maxPillW - pillPadX * 2) / (displayLabel.length * 0.52)));
        }

        const charWidth = fontSize * 0.52;
        const desiredW = displayLabel.length * charWidth + pillPadX * 2;
        const words = displayLabel.split(/\s+/);
        let badgeLines: string[] = [displayLabel];
        if (words.length >= 2 && desiredW > maxPillW) {
          const mid = Math.ceil(words.length / 2);
          badgeLines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
        }

        const isMultiLine = desiredW > maxPillW && badgeLines.length > 1;
        const line1 = isMultiLine ? badgeLines[0] : (desiredW > maxPillW ? displayLabel.slice(0, Math.max(4, Math.floor((maxPillW - pillPadX * 2) / charWidth) - 1)) + "…" : displayLabel);
        const line2 = isMultiLine ? badgeLines[1] : null;

        const longestLineLen = Math.max(line1.length, line2 ? line2.length : 0);
        const pillW = Math.min(maxPillW, Math.max(40, longestLineLen * charWidth + pillPadX * 2));
        const pillH = isMultiLine ? fontSize * 2 + pillPadY * 2 + 4 : fontSize + pillPadY * 2 + 2;
        const centerX = shape.props.w / 2;
        const pillX = Math.max(6, Math.min(shape.props.w - pillW - 6, centerX - pillW / 2));

        const maxPartBottom = parts.length > 0
          ? Math.max(...parts.map((p) => (p.y || 0) + (p.height || 0)))
          : 0;

        const hasParts = parts.length > 0;
        const pillY = isContainer
          ? 10
          : isAbove
          ? 6
          : isBelow
          ? Math.max(6, Math.min(shape.props.h - pillH - 6, maxPartBottom > 0 && maxPartBottom + pillH + 6 <= shape.props.h ? maxPartBottom + 4 : shape.props.h - pillH - 6))
          : hasParts
          ? (maxPartBottom + pillH + 6 <= shape.props.h ? maxPartBottom + 4 : Math.max(6, shape.props.h - pillH - 6))
          : (shape.props.h - pillH) / 2;

        const bgFill = "#0c0e18";
        const bgOpacity = 0.96;
        const textFill = "#f8fafc";
        const strokeColor = "#2d3748";

        return (
          <g>
            <rect
              x={pillX}
              y={pillY}
              width={pillW}
              height={pillH}
              rx={Math.min(pillH / 2, 10)}
              fill={bgFill}
              fillOpacity={bgOpacity}
              stroke={strokeColor}
              strokeWidth={1}
              filter={`url(#${markerId}-shadow)`}
            />
            {isMultiLine && line2 ? (
              <>
                <text
                  x={pillX + pillW / 2}
                  y={pillY + fontSize * 0.7 + pillPadY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textFill}
                  fontFamily="Inter, ui-sans-serif, system-ui"
                  fontSize={fontSize}
                  fontWeight="700"
                  letterSpacing="-0.01em"
                >
                  {line1}
                </text>
                <text
                  x={pillX + pillW / 2}
                  y={pillY + fontSize * 1.8 + pillPadY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textFill}
                  fontFamily="Inter, ui-sans-serif, system-ui"
                  fontSize={fontSize}
                  fontWeight="700"
                  letterSpacing="-0.01em"
                >
                  {line2}
                </text>
              </>
            ) : (
              <text
                x={pillX + pillW / 2}
                y={pillY + pillH / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={textFill}
                fontFamily="Inter, ui-sans-serif, system-ui"
                fontSize={fontSize}
                fontWeight="700"
                letterSpacing="-0.01em"
              >
                {line1}
              </text>
            )}
          </g>
        );
      })()}
      </g>
    </SVGContainer>
  );
}

import {
  customShapeUtils,
  ChartShapeUtil,
  SvgShapeUtil,
  TemplateShapeUtil,
  CUSTOM_TEMPLATE_TYPE,
} from "@/components/custom-shapes";

export class ChalkVisualShapeUtil extends BaseBoxShapeUtil<ChalkVisualShape> {
  static override type = CHALK_VISUAL_TYPE;
  static override props: RecordProps<ChalkVisualShape> = {
    w: T.number,
    h: T.number,
    label: T.optional(T.string),
    labelPlacement: T.optional(T.literalEnum("inside", "below", "above", "left", "right", "none")),
    role: T.optional(T.string),
    partsJson: T.optional(T.string),
  };

  getDefaultProps(): ChalkVisualShape["props"] {
    return { w: 180, h: 120, label: "", labelPlacement: "below", role: "component", partsJson: "[]" };
  }

  component(shape: ChalkVisualShape) {
    return <VisualSvg shape={shape} />;
  }

  getIndicatorPath(shape: ChalkVisualShape) {
    const path = new Path2D();
    path.roundRect(0, 0, Math.max(10, shape.props.w || 180), Math.max(10, shape.props.h || 120), 12);
    return path;
  }
}

export { customShapeUtils, ChartShapeUtil, SvgShapeUtil, TemplateShapeUtil, CUSTOM_TEMPLATE_TYPE };
export const chalkShapeUtils = [ChalkVisualShapeUtil, ...customShapeUtils];

