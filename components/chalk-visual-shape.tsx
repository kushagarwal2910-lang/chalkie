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

function renderObjectChassis(role: string, w: number, h: number, hasAxes: boolean, hasParts: boolean) {
  if (hasAxes) return null;
  // If the object already has its own vector illustration parts, DO NOT draw a card box around it
  // unless it is explicitly an environment, container, or background layer!
  if (hasParts && !["container", "environment", "layer", "field"].includes(role)) {
    return null;
  }

  if (role === "container") {
    return (
      <g>
        <rect
          x={2}
          y={2}
          width={Math.max(0, w - 4)}
          height={Math.max(0, h - 4)}
          rx={14}
          fill="#f8fafc"
          fillOpacity={0.85}
          stroke="#475569"
          strokeWidth={2.5}
          strokeDasharray="6 3"
        />
        {/* Subtle technical corner accents */}
        <path d={`M 14 2 L 2 2 L 2 14`} fill="none" stroke="#2563eb" strokeWidth={3} />
        <path d={`M ${w - 14} 2 L ${w - 2} 2 L ${w - 2} 14`} fill="none" stroke="#2563eb" strokeWidth={3} />
        <path d={`M 2 ${h - 14} L 2 ${h - 2} L 14 ${h - 2}`} fill="none" stroke="#2563eb" strokeWidth={3} />
        <path d={`M ${w - 14} ${h - 2} L ${w - 2} ${h - 2} L ${w - 2} ${h - 14}`} fill="none" stroke="#2563eb" strokeWidth={3} />
      </g>
    );
  }

  if (role === "environment") {
    return (
      <rect
        x={2}
        y={2}
        width={Math.max(0, w - 4)}
        height={Math.max(0, h - 4)}
        rx={16}
        fill="#f1f5f9"
        fillOpacity={0.65}
        stroke="#94a3b8"
        strokeWidth={2}
        strokeDasharray="8 5"
      />
    );
  }

  if (role === "layer" || role === "field") {
    return (
      <rect
        x={2}
        y={2}
        width={Math.max(0, w - 4)}
        height={Math.max(0, h - 4)}
        rx={10}
        fill="#f8fafc"
        fillOpacity={0.5}
        stroke="#cbd5e1"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
    );
  }

  // Only reached if hasParts is false (fallback placeholder)
  return (
    <rect
      x={2}
      y={2}
      width={Math.max(0, w - 4)}
      height={Math.max(0, h - 4)}
      rx={10}
      fill="#ffffff"
      fillOpacity={0.92}
      stroke="#64748b"
      strokeWidth={2}
      strokeLinejoin="round"
    />
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

      {renderObjectChassis(shape.props.role, shape.props.w, shape.props.h, Boolean(axesPart), parts.length > 0)}

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
            return (
              <ellipse
                key={key}
                {...common}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
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

      {/* Technical Callout Badge for Object Label */}
      {shape.props.labelPlacement !== "none" && shape.props.label && (
        <g>
          {/* Subtle translucent pill backing so label is always crisp and readable */}
          <rect
            x={Math.max(4, labelX - (shape.props.label.length * 4.2 + 14))}
            y={labelY - 11}
            width={Math.min(shape.props.w - 8, shape.props.label.length * 8.4 + 28)}
            height={22}
            rx={11}
            fill="#ffffff"
            fillOpacity={0.92}
            stroke="#e2e8f0"
            strokeWidth={1}
            filter={`url(#${markerId}-shadow)`}
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#0f172a"
            fontFamily="Inter, ui-sans-serif, system-ui"
            fontSize="12"
            fontWeight="700"
            letterSpacing="-0.01em"
          >
            {lines.map((line, index) => (
              <tspan key={line} x={labelX} dy={index === 0 ? (lines.length > 1 ? -5 : 0) : 13}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
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
