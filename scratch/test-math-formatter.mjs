import { formatMathFormula, isMathematicalFormula } from "../lib/math-formatter.ts";

const testCases = [
  // User's exact failure case:
  {
    name: "Central Limit Theorem (User screenshot)",
    input: "\\(\\bar{X}\\) ~ N\\(\\mu, \\sigma^2/n\\)",
  },
  {
    name: "Central Limit Theorem with \\sim and \\frac",
    input: "\\bar{X} \\sim \\mathcal{N}\\left(\\mu, \\frac{\\sigma^2}{n}\\right)",
  },
  {
    name: "Neural Network MSE Loss",
    input: "L = \\frac{1}{2}(y - \\hat{y})^2",
  },
  {
    name: "Gradient Descent Weight Update",
    input: "\\Delta W = -\\eta \\cdot \\frac{\\partial L}{\\partial W}",
  },
  {
    name: "Newton's Law of Universal Gravitation",
    input: "F = G \\frac{m_1 m_2}{r^2}",
  },
  {
    name: "Einstein's Mass-Energy Equivalence",
    input: "E = mc^2",
  },
  {
    name: "Normal / Gaussian PDF",
    input: "f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}",
  },
  {
    name: "Quadratic Formula",
    input: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  },
  {
    name: "Photosynthesis Chemistry",
    input: "6CO_2 + 6H_2O \\to C_6H_{12}O_6 + 6O_2",
  },
  {
    name: "Euler's Identity",
    input: "e^{i\\pi} + 1 = 0",
  },
  {
    name: "Definite Integral",
    input: "\\int_{a}^{b} f(x) dx = F(b) - F(a)",
  },
  {
    name: "Schrodinger Equation",
    input: "i\\hbar \\frac{\\partial \\psi}{\\partial t} = \\hat{H}\\psi",
  },
];

console.log("=== TESTING UNIVERSAL MATH FORMATTER ===");
for (const tc of testCases) {
  const output = formatMathFormula(tc.input);
  const isMath = isMathematicalFormula(tc.input);
  console.log(`\nTest: ${tc.name}`);
  console.log(`  Raw Input : ${tc.input}`);
  console.log(`  Formatted : ${output}`);
  console.log(`  Is Math?  : ${isMath}`);
}
