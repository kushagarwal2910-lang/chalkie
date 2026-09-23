export interface ThemeColorToken {
  primary: string;
  secondary: string;
  bgLight: string;
  bgDark: string;
  borderLight: string;
  borderDark: string;
  glow: string;
}

export const templateColors: Record<string, ThemeColorToken> = {
  blue: {
    primary: "#2563eb",
    secondary: "#60a5fa",
    bgLight: "rgba(37, 99, 235, 0.08)",
    bgDark: "rgba(37, 99, 235, 0.18)",
    borderLight: "rgba(37, 99, 235, 0.25)",
    borderDark: "rgba(96, 165, 250, 0.35)",
    glow: "rgba(37, 99, 235, 0.3)",
  },
  cyan: {
    primary: "#0284c7",
    secondary: "#38bdf8",
    bgLight: "rgba(2, 132, 199, 0.08)",
    bgDark: "rgba(2, 132, 199, 0.18)",
    borderLight: "rgba(2, 132, 199, 0.25)",
    borderDark: "rgba(56, 189, 248, 0.35)",
    glow: "rgba(2, 132, 199, 0.3)",
  },
  violet: {
    primary: "#7c3aed",
    secondary: "#a78bfa",
    bgLight: "rgba(124, 58, 237, 0.08)",
    bgDark: "rgba(124, 58, 237, 0.18)",
    borderLight: "rgba(124, 58, 237, 0.25)",
    borderDark: "rgba(167, 139, 250, 0.35)",
    glow: "rgba(124, 58, 237, 0.3)",
  },
  emerald: {
    primary: "#059669",
    secondary: "#34d399",
    bgLight: "rgba(5, 150, 105, 0.08)",
    bgDark: "rgba(5, 150, 105, 0.18)",
    borderLight: "rgba(5, 150, 105, 0.25)",
    borderDark: "rgba(52, 211, 153, 0.35)",
    glow: "rgba(5, 150, 105, 0.3)",
  },
  green: {
    primary: "#16a34a",
    secondary: "#4ade80",
    bgLight: "rgba(22, 163, 74, 0.08)",
    bgDark: "rgba(22, 163, 74, 0.18)",
    borderLight: "rgba(22, 163, 74, 0.25)",
    borderDark: "rgba(74, 222, 128, 0.35)",
    glow: "rgba(22, 163, 74, 0.3)",
  },
  orange: {
    primary: "#ea580c",
    secondary: "#fb923c",
    bgLight: "rgba(234, 88, 12, 0.08)",
    bgDark: "rgba(234, 88, 12, 0.18)",
    borderLight: "rgba(234, 88, 12, 0.25)",
    borderDark: "rgba(251, 146, 60, 0.35)",
    glow: "rgba(234, 88, 12, 0.3)",
  },
  red: {
    primary: "#dc2626",
    secondary: "#f87171",
    bgLight: "rgba(220, 38, 38, 0.08)",
    bgDark: "rgba(220, 38, 38, 0.18)",
    borderLight: "rgba(220, 38, 38, 0.25)",
    borderDark: "rgba(248, 113, 113, 0.35)",
    glow: "rgba(220, 38, 38, 0.3)",
  },
  yellow: {
    primary: "#d97706",
    secondary: "#fbbf24",
    bgLight: "rgba(217, 119, 6, 0.08)",
    bgDark: "rgba(217, 119, 6, 0.18)",
    borderLight: "rgba(217, 119, 6, 0.25)",
    borderDark: "rgba(251, 191, 36, 0.35)",
    glow: "rgba(217, 119, 6, 0.3)",
  },
  slate: {
    primary: "#475569",
    secondary: "#94a3b8",
    bgLight: "rgba(71, 85, 105, 0.08)",
    bgDark: "rgba(71, 85, 105, 0.2)",
    borderLight: "rgba(71, 85, 105, 0.25)",
    borderDark: "rgba(148, 163, 184, 0.35)",
    glow: "rgba(71, 85, 105, 0.25)",
  },
  ink: {
    primary: "#0f172a",
    secondary: "#334155",
    bgLight: "rgba(15, 23, 42, 0.06)",
    bgDark: "rgba(15, 23, 42, 0.3)",
    borderLight: "rgba(15, 23, 42, 0.2)",
    borderDark: "rgba(51, 65, 85, 0.4)",
    glow: "rgba(15, 23, 42, 0.25)",
  },
};

export function getThemeColor(color?: string): ThemeColorToken {
  if (!color) return templateColors.blue;
  const key = color.toLowerCase().trim();
  return templateColors[key] || templateColors.blue;
}
