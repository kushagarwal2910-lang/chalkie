"use client";

import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  type RecordProps,
  type TLShape,
} from "tldraw";
import type { VisualPart } from "@/lib/lesson-schema";

export const CHALK_VISUAL_TYPE = "chalk-visual" as const;

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CHALK_VISUAL_TYPE]: {
      w: number;
      h: number;
      label: string;
      labelPlacement: "inside" | "below" | "above" | "left" | "right" | "none";
      role: string;
      partsJson: string;
    };
  }
}

export type ChalkVisualShape = TLShape<typeof CHALK_VISUAL_TYPE>;

const palette: Record<string, string> = {
  ink: "#1e293b",
  slate: "#64748b",
  gray: "#64748b",
  grey: "#64748b",
  blue: "#2563eb",
  cyan: "#0284c7",
  violet: "#7c3aed",
  orange: "#ea580c",
  green: "#16a34a",
  red: "#dc2626",
  yellow: "#d97706",
  white: "#ffffff",
  none: "none",
};

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

function axisLabels(data: string) {
  const pieces = data.split("|");
  const x = pieces.find((piece) => /^\s*x\s*:/i.test(piece))?.replace(/^\s*x\s*:\s*/i, "").trim() || "Horizontal value";
  const y = pieces.find((piece) => /^\s*y\s*:/i.test(piece))?.replace(/^\s*y\s*:\s*/i, "").trim() || "Vertical value";
  return { x, y };
}

function axisPlot(part: VisualPart) {
  return {
    left: part.x + 38,
    right: part.x + part.width - 14,
    top: part.y + 14,
    bottom: part.y + part.height - 34,
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

function renderObjectChassis(role: string, w: number, h: number, hasAxes: boolean, hasParts: boolean, uid: string) {
  if (hasAxes) return null;
  // If the object already has its own vector illustration parts, DO NOT draw a card box around it
  // unless it is explicitly an environment, container, or background layer!
  if (hasParts && !["container", "environment", "layer", "field"].includes(role)) {
    return null;
  }

  if (role === "container") {
    // Production-grade frosted-glass container with subtle gradient border
    return (
      <g>
        <defs>
          <linearGradient id={`${uid}-container-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#f1f5f9" stopOpacity={0.88} />
          </linearGradient>
          <linearGradient id={`${uid}-container-border`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        {/* Outer soft shadow layer */}
        <rect
          x={4}
          y={5}
          width={Math.max(0, w - 8)}
          height={Math.max(0, h - 8)}
          rx={16}
          fill="#0f172a"
          fillOpacity={0.06}
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
          fillOpacity={0.7}
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
          fill="#0f172a"
          fillOpacity={0.04}
        />
        <rect
          x={3}
          y={3}
          width={Math.max(0, w - 6)}
          height={Math.max(0, h - 6)}
          rx={20}
          fill="#f1f5f9"
          fillOpacity={0.72}
          stroke="#cbd5e1"
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
        fill="#f8fafc"
        fillOpacity={0.55}
        stroke="#e2e8f0"
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
        fill="#0f172a"
        fillOpacity={0.07}
      />
      <rect
        x={2}
        y={2}
        width={Math.max(0, w - 4)}
        height={Math.max(0, h - 4)}
        rx={12}
        fill="#ffffff"
        fillOpacity={0.95}
        stroke="#e2e8f0"
        strokeWidth={1.5}
      />
    </g>
  );
}

function VisualSvg({ shape }: { shape: ChalkVisualShape }) {
  const parts = safeParts(shape.props.partsJson);
  const uid = shape.id.replace(/[^a-z0-9]/gi, "");
  const markerId = `arrow-${uid}`;
  const objectClipId = `${markerId}-object-clip`;
  const plotClipId = `${markerId}-plot-clip`;
  const axesPart = parts.find((part) => part.type === "axes");
  const plot = axesPart ? axisPlot(axesPart) : null;
  const lines = labelLines(shape.props.label);
  const labelY = shape.props.labelPlacement === "above" ? 16 : shape.props.labelPlacement === "below" ? shape.props.h - 12 : shape.props.h / 2;
  const labelX = shape.props.labelPlacement === "left" ? Math.min(60, shape.props.w / 4) : shape.props.labelPlacement === "right" ? Math.max(shape.props.w - 60, (shape.props.w * 3) / 4) : shape.props.w / 2;

  return (
    <SVGContainer width={shape.props.w} height={shape.props.h} viewBox={`0 0 ${shape.props.w} ${shape.props.h}`} preserveAspectRatio="none">
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#334155" />
        </marker>
        <filter id={`${markerId}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
        <filter id={`${markerId}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Rich Architectural Gradients */}
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
          <rect x="0" y="0" width={Math.max(0, shape.props.w)} height={Math.max(0, shape.props.h)} rx="12" />
        </clipPath>
        {plot && <clipPath id={plotClipId}><rect x={plot.left} y={plot.top} width={Math.max(0, plot.right - plot.left)} height={Math.max(0, plot.bottom - plot.top)} /></clipPath>}

        {/* Dynamic Keyframe Animations for Physics & Data Flow */}
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
          @keyframes chalkieFlowDash { to { stroke-dashoffset: -28px; } }
          @keyframes chalkieParticleFloat { 0%, 100% { transform: translateY(0px); opacity: 0.85; } 50% { transform: translateY(-3px); opacity: 1; } }
          @keyframes chalkieSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes chalkiePulse { 0%, 100% { opacity: 0.75; transform: scale(1); } 50% { opacity: 1; transform: scale(1.02); } }
          .animated-wave { stroke-dasharray: 6 4; animation: chalkieFlowDash 1.2s linear infinite; }
          .animated-particle { animation: chalkieParticleFloat 2.4s ease-in-out infinite; }
          .animated-spin { transform-origin: center; animation: chalkieSpin 12s linear infinite; }
        `}</style>
      </defs>

      {renderObjectChassis(shape.props.role, shape.props.w, shape.props.h, Boolean(axesPart), parts.length > 0, uid)}

      <g filter={`url(#${markerId}-shadow)`} clipPath={`url(#${objectClipId})`}>
        {parts.map((part, index) => {
          let rawStroke = palette[part.stroke] ?? palette.ink;
          let rawFill = palette[part.fill] ?? palette.none;

          // Automatic gradient upgrades for physical realism
          if (part.fill === "yellow" && (shape.props.label.toLowerCase().includes("pin") || shape.props.label.toLowerCase().includes("gold"))) {
            rawFill = `url(#${markerId}-gold)`;
          } else if (part.fill === "slate" && (shape.props.label.toLowerCase().includes("chip") || shape.props.label.toLowerCase().includes("die") || shape.props.label.toLowerCase().includes("substrate"))) {
            rawFill = `url(#${markerId}-silicon)`;
          } else if (part.fill === "cyan" && (shape.props.label.toLowerCase().includes("electron") || shape.props.label.toLowerCase().includes("charge") || shape.props.label.toLowerCase().includes("tunnel"))) {
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
            clipPath: plot && part.type !== "axes" && part.type !== "text" ? `url(#${plotClipId})` : undefined,
          };
          const key = `${index}-${part.type}`;

          if (part.type === "ellipse") {
            const cx = Math.max(4, Math.min(shape.props.w - 4, part.x + part.width / 2));
            const cy = Math.max(4, Math.min(shape.props.h - 4, part.y + part.height / 2));
            const maxRx = Math.min(cx, shape.props.w - cx);
            const maxRy = Math.min(cy, shape.props.h - cy);
            const rx = Math.max(2, Math.min(maxRx, part.width / 2));
            const ry = Math.max(2, Math.min(maxRy, part.height / 2));
            // Keep circular proportions if aspect ratio is roughly square or marked as circle
            const isCircle = Math.abs(rx - ry) / Math.max(rx, ry) < 0.28 || part.data === "circle";
            const finalRx = isCircle ? Math.min(rx, ry) : rx;
            const finalRy = isCircle ? Math.min(rx, ry) : ry;
            return (
              <ellipse
                key={key}
                {...common}
                cx={cx}
                cy={cy}
                rx={finalRx}
                ry={finalRy}
              />
            );
          }

          if (part.type === "rect") {
            const rx = Math.max(0, Math.min(shape.props.w - 4, part.x));
            const ry = Math.max(0, Math.min(shape.props.h - 4, part.y));
            const rw = Math.max(4, Math.min(shape.props.w - rx, part.width));
            const rh = Math.max(4, Math.min(shape.props.h - ry, part.height));
            return (
              <rect
                key={key}
                {...common}
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                rx={Math.min(8, rw / 6, rh / 6)}
              />
            );
          }

          if (part.type === "line" || part.type === "arrow") {
            return (
              <line
                key={key}
                {...common}
                x1={part.x}
                y1={part.y}
                x2={part.x + part.width}
                y2={part.y + part.height}
                markerEnd={part.type === "arrow" ? `url(#${markerId})` : undefined}
              />
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
            const labels = axisLabels(part.data);
            const axisColor = palette[part.stroke] ?? palette.ink;
            const tickXs = [0.25, 0.5, 0.75].map((ratio) => bounds.left + (bounds.right - bounds.left) * ratio);
            const tickYs = [0.25, 0.5, 0.75].map((ratio) => bounds.bottom - (bounds.bottom - bounds.top) * ratio);
            return (
              <g key={key} {...common} fill="none">
                <line x1={bounds.left} y1={bounds.bottom} x2={bounds.right} y2={bounds.bottom} markerEnd={`url(#${markerId})`} />
                <line x1={bounds.left} y1={bounds.bottom} x2={bounds.left} y2={bounds.top} markerEnd={`url(#${markerId})`} />
                {tickXs.map((x) => <line key={`x-${x}`} x1={x} y1={bounds.bottom - 4} x2={x} y2={bounds.bottom + 4} opacity="0.45" />)}
                {tickYs.map((y) => <line key={`y-${y}`} x1={bounds.left - 4} y1={y} x2={bounds.left + 4} y2={y} opacity="0.45" />)}
                <text x={(bounds.left + bounds.right) / 2} y={part.y + part.height - 9} fill={axisColor} stroke="#fbfaf7" strokeWidth="4" paintOrder="stroke" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, ui-sans-serif, system-ui" fontSize="12" fontWeight="700">{labels.x}</text>
                <text x={part.x + 11} y={(bounds.top + bounds.bottom) / 2} fill={axisColor} stroke="#fbfaf7" strokeWidth="4" paintOrder="stroke" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, ui-sans-serif, system-ui" fontSize="12" fontWeight="700" transform={`rotate(-90 ${part.x + 11} ${(bounds.top + bounds.bottom) / 2})`}>{labels.y}</text>
              </g>
            );
          }

          if (part.type === "orbit") {
            const count = countFromData(part.data, 2, 1, 32);
            const cx = part.x + part.width / 2;
            const cy = part.y + part.height / 2;
            const radius = Math.max(10, Math.min(part.width, part.height) / 2);
            return (
              <g key={key}>
                {/* Clean circular orbit ring */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={common.stroke || palette.slate}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  opacity={0.7}
                />
                {/* Rotating electron particles on the orbit ring */}
                <g className="animated-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                  {Array.from({ length: count }, (_, i) => {
                    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
                    const ex = cx + radius * Math.cos(angle);
                    const ey = cy + radius * Math.sin(angle);
                    return (
                      <g key={i} transform={`translate(${ex}, ${ey})`}>
                        <circle r={5} fill="#06b6d4" stroke="#0284c7" strokeWidth={1.5} filter={`url(#${markerId}-glow)`} />
                        <text y={0.5} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="8" fontWeight="900">-</text>
                      </g>
                    );
                  })}
                </g>
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

          if (part.type === "polygon") return <polygon key={key} {...common} points={part.data} />;
          if (part.type === "polyline") return <polyline key={key} {...common} points={part.data} fill="none" />;
          if (part.type === "path") return <path key={key} {...common} d={part.data} />;

          return (
            <text
              key={key}
              {...common}
              x={part.x}
              y={part.y}
              fill={palette[part.fill] === "none" ? palette[part.stroke] : palette[part.fill]}
              stroke="none"
              fontFamily="Inter, ui-sans-serif, system-ui"
              fontSize={Math.max(10, Math.min(28, part.height || 14))}
              fontWeight="650"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {part.text}
            </text>
          );
        })}
      </g>

      {/* Production-Grade Label Badge */}
      {shape.props.labelPlacement !== "none" && shape.props.label && (() => {
        const isContainer = ["container", "environment", "layer", "field"].includes(shape.props.role);
        const fontSize = isContainer ? 13 : 11;
        const charWidth = fontSize * 0.58;
        const pillPadX = 14;
        const pillPadY = 5;
        const pillW = Math.min(shape.props.w - 8, shape.props.label.length * charWidth + pillPadX * 2);
        const pillH = lines.length > 1 ? fontSize * 2 + pillPadY * 2 + 2 : fontSize + pillPadY * 2;
        const pillX = Math.max(4, labelX - pillW / 2);
        const pillY = labelY - pillH / 2;
        const bgFill = isContainer ? "#1e293b" : "#ffffff";
        const bgOpacity = isContainer ? 0.88 : 0.94;
        const textFill = isContainer ? "#ffffff" : "#0f172a";
        const strokeColor = isContainer ? "none" : "#e2e8f0";
        return (
          <g>
            <rect
              x={pillX}
              y={pillY}
              width={pillW}
              height={pillH}
              rx={pillH / 2}
              fill={bgFill}
              fillOpacity={bgOpacity}
              stroke={strokeColor}
              strokeWidth={strokeColor === "none" ? 0 : 1}
              filter={`url(#${markerId}-shadow)`}
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={textFill}
              fontFamily="Inter, ui-sans-serif, system-ui"
              fontSize={fontSize}
              fontWeight="700"
              letterSpacing="-0.01em"
            >
              {lines.map((line, index) => (
                <tspan key={line} x={labelX} dy={index === 0 ? (lines.length > 1 ? -(fontSize * 0.45) : 0) : fontSize + 2}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })()}
    </SVGContainer>
  );
}

export class ChalkVisualShapeUtil extends BaseBoxShapeUtil<ChalkVisualShape> {
  static override type = CHALK_VISUAL_TYPE;
  static override props: RecordProps<ChalkVisualShape> = {
    w: T.number,
    h: T.number,
    label: T.string,
    labelPlacement: T.literalEnum("inside", "below", "above", "left", "right", "none"),
    role: T.string,
    partsJson: T.string,
  };

  getDefaultProps(): ChalkVisualShape["props"] {
    return { w: 180, h: 120, label: "", labelPlacement: "below", role: "component", partsJson: "[]" };
  }

  component(shape: ChalkVisualShape) {
    return <VisualSvg shape={shape} />;
  }

  getIndicatorPath(shape: ChalkVisualShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12);
    return path;
  }
}

export const chalkShapeUtils = [ChalkVisualShapeUtil];
