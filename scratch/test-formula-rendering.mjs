import { formatMathFormula, isMathematicalFormula } from "../lib/math-formatter.ts";

console.log("=== COMPREHENSIVE MATH FORMULA VALIDATION ===");

const testSuite = [
  // 1. User's exact screenshot failure:
  {
    topic: "Central Limit Theorem (Exact User Screenshot)",
    input: "\\(\\bar{X}\\) ~ N\\(\\mu, \\sigma^2/n\\)",
    expected: "X̄ ~ N(μ, σ²/n)",
  },
  {
    topic: "Central Limit Theorem (LaTeX with \\mathcal and \\frac)",
    input: "\\bar{X} \\sim \\mathcal{N}\\left(\\mu, \\frac{\\sigma^2}{n}\\right)",
    expected: "X̄ ~ N(μ, σ²/n)",
  },
  // 2. Machine Learning / Deep Learning:
  {
    topic: "Mean Squared Error Loss",
    input: "L = \\frac{1}{2}(y - \\hat{y})^2",
    expected: "L = ½(y - ŷ)²",
  },
  {
    topic: "Gradient Descent Weight Update",
    input: "\\Delta W = -\\eta \\cdot \\frac{\\partial L}{\\partial W}",
    expected: "ΔW = -η · ∂L/∂W",
  },
  {
    topic: "Softmax Activation Function",
    input: "\\sigma(z)_i = \\frac{e^{z_i}}{\\sum_{j} e^{z_j}}",
    expected: "σ(z)ᵢ = e^(zᵢ)/(∑ⱼ e^(zⱼ))",
  },
  // 3. Physics & Mechanics:
  {
    topic: "Newton's Law of Universal Gravitation",
    input: "F = G \\frac{m_1 m_2}{r^2}",
    expected: "F = G (m₁ m₂)/r²",
  },
  {
    topic: "Einstein's Mass-Energy Equivalence",
    input: "E = mc^2",
    expected: "E = mc²",
  },
  {
    topic: "Schrodinger Wave Equation",
    input: "i\\hbar \\frac{\\partial \\psi}{\\partial t} = \\hat{H}\\psi",
    expected: "iℏ ∂ψ/∂t = Ĥψ",
  },
  {
    topic: "Kinematics Position Equation",
    input: "x = x_0 + v_0 t + \\frac{1}{2} a t^2",
    expected: "x = x₀ + v₀ t + ½ a t²",
  },
  // 4. Statistics & Calculus:
  {
    topic: "Gaussian / Normal Distribution PDF",
    input: "f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}",
    expected: "f(x) = 1/(σ √(2π)) e^(-((x-μ)²)/2σ²)",
  },
  {
    topic: "Quadratic Formula",
    input: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    expected: "x = (-b ± √(b² - 4ac))/2a",
  },
  {
    topic: "Definite Integral",
    input: "\\int_{a}^{b} f(x) dx = F(b) - F(a)",
    expected: "∫ₐᵇ f(x) dx = F(b) - F(a)",
  },
  // 5. Chemistry & Biology:
  {
    topic: "Photosynthesis Reaction",
    input: "6CO_2 + 6H_2O \\to C_6H_{12}O_6 + 6O_2",
    expected: "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂",
  },
  {
    topic: "Arrhenius Reaction Rate",
    input: "k = A e^{-\\frac{E_a}{RT}}",
    expected: "k = A e^(-Eₐ/RT)",
  },
];

let failed = 0;
for (const test of testSuite) {
  const result = formatMathFormula(test.input);
  const isMath = isMathematicalFormula(test.input);
  const matches = result === test.expected;

  console.log(`\n• [${test.topic}]`);
  console.log(`  Raw Input : ${test.input}`);
  console.log(`  Formatted : ${result}`);
  console.log(`  Expected  : ${test.expected}`);
  console.log(`  Status    : ${matches ? "✓ PASS" : "✗ MISMATCH"}`);

  if (!matches) {
    failed++;
  }

  // Ensure no raw backslash artifacts remain
  if (result.includes("\\(") || result.includes("\\[") || result.includes("\\frac") || result.includes("\\bar") || result.includes("\\mu") || result.includes("\\sigma")) {
    console.error(`  ERROR: Raw LaTeX delimiter/macro leaked into result: "${result}"`);
    failed++;
  }
}

console.log("\n==========================================");
if (failed === 0) {
  console.log("✓ ALL 14 DOMAIN MATH FORMULA TESTS PASSED!");
} else {
  console.error(`✗ ${failed} tests failed!`);
  process.exit(1);
}
