// WCAG 2.1 Contrast Ratio Verification
function getLuminance(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrast(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const darkChalkboard = "#090d16";

const nodeFills = {
  blue: "#60a5fa",
  violet: "#c084fc",
  green: "#4ade80",
  cyan: "#38bdf8",
  yellow: "#facc15",
  orange: "#fb923c",
  white: "#ffffff",
};

console.log("=== Node Text Contrast Verification ===");
for (const [name, hex] of Object.entries(nodeFills)) {
  const lum = getLuminance(hex);
  const textColor = lum > 0.28 ? "#090d16" : "#f8fafc";
  const ratio = getContrast(hex, textColor);
  const passAA = ratio >= 4.5;
  const passAAA = ratio >= 7.0;
  console.log(`Node ${name.padEnd(7)} (${hex}): text=${textColor}, contrast=${ratio.toFixed(2)}:1 [AA: ${passAA}, AAA: ${passAAA}]`);
  if (!passAA) throw new Error(`Node ${name} failed WCAG AA!`);
}

const textColorsOnChalkboard = {
  white: "#ffffff",
  ink: "#f8fafc",
  cyan: "#38bdf8",
  yellow: "#fef08a",
  green: "#86efac",
  blue: "#93c5fd",
  violet: "#e9d5ff",
  slate: "#cbd5e1",
};

console.log("\n=== Text on Chalkboard Contrast Verification ===");
for (const [name, hex] of Object.entries(textColorsOnChalkboard)) {
  const ratio = getContrast(hex, darkChalkboard);
  const passAA = ratio >= 4.5;
  const passAAA = ratio >= 7.0;
  console.log(`Text ${name.padEnd(7)} (${hex}) on dark: contrast=${ratio.toFixed(2)}:1 [AA: ${passAA}, AAA: ${passAAA}]`);
  if (!passAA) throw new Error(`Text ${name} failed WCAG AA on dark background!`);
}

console.log("\n✓ All color combinations exceed WCAG standards (mostly AAA >= 7:1)!");
