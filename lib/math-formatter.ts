/**
 * Universal Mathematical Formula Formatter for Chalkie
 *
 * Converts raw LaTeX expressions, escape sequences, TeX delimiters,
 * Greek symbols, accents, fractions, roots, superscripts, and subscripts
 * into clean, gorgeous, standards-compliant chalkboard Unicode math typography.
 */

// Mapping of Greek letter LaTeX macros to Unicode glyphs
const GREEK_MAP: Record<string, string> = {
  // Lowercase
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "π",
  rho: "ρ",
  varrho: "ρ",
  sigma: "σ",
  varsigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",

  // Uppercase
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

// Common operators and symbols
const SYMBOL_MAP: Record<string, string> = {
  pm: "±",
  mp: "∓",
  times: "×",
  cdot: "·",
  div: "÷",
  ast: "*",
  star: "★",
  circ: "∘",
  bullet: "•",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  sim: "~",
  simeq: "≃",
  cong: "≅",
  equiv: "≡",
  propto: "∝",
  ll: "≪",
  gg: "≫",
  to: "→",
  rightarrow: "→",
  longrightarrow: "→",
  leftarrow: "←",
  longleftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  implies: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  iff: "⇔",
  uparrow: "↑",
  downarrow: "↓",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  forall: "∀",
  exists: "∃",
  nexists: "∄",
  nabla: "∇",
  partial: "∂",
  infty: "∞",
  sum: "∑",
  prod: "∏",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  hbar: "ℏ",
  sqrt: "√",
  angle: "∠",
  perp: "⊥",
  mid: "|",
  Vert: "‖",
  vert: "|",
};

// Blackboard bold mapping
const BB_MAP: Record<string, string> = {
  R: "ℝ",
  N: "ℕ",
  Z: "ℤ",
  Q: "ℚ",
  C: "ℂ",
  P: "ℙ",
  E: "𝔼",
};

// Caligraphic mapping
const CAL_MAP: Record<string, string> = {
  N: "N",
  L: "L",
  O: "O",
  H: "H",
  F: "F",
  D: "D",
  M: "M",
};

// Comprehensive Superscript lookup
const SUPERSCRIPT_MAP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
  A: "ᴬ",
  B: "ᴮ",
  D: "ᴰ",
  E: "ᴱ",
  G: "ᴳ",
  H: "ᴴ",
  I: "ᴵ",
  J: "ᴶ",
  K: "ᴷ",
  L: "ᴸ",
  M: "ᴹ",
  N: "ᴺ",
  O: "ᴼ",
  P: "ᴾ",
  R: "ᴿ",
  T: "ᵀ",
  U: "ᵁ",
  W: "ᵂ",
  "*": "*",
  circ: "°",
  prime: "′",
};

// Comprehensive Subscript lookup
const SUBSCRIPT_MAP: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

/**
 * Extracts balanced { ... } content starting at index in str.
 */
function extractBracedGroup(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (str[startIndex] !== "{") return null;
  let depth = 0;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) {
        return { content: str.slice(startIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

function toSuperscript(str: string): string {
  const trimmed = str.trim();
  let result = "";
  for (const ch of trimmed) {
    if (SUPERSCRIPT_MAP[ch]) {
      result += SUPERSCRIPT_MAP[ch];
    } else {
      return `^(${trimmed})`;
    }
  }
  return result || `^(${trimmed})`;
}

function toSubscript(str: string): string {
  const trimmed = str.trim();
  if (trimmed === "max") return "ₘₐₓ";
  if (trimmed === "min") return "ₘᵢₙ";
  let result = "";
  for (const ch of trimmed) {
    if (SUBSCRIPT_MAP[ch]) {
      result += SUBSCRIPT_MAP[ch];
    } else {
      return `_${trimmed}`;
    }
  }
  return result || `_${trimmed}`;
}

/**
 * Replaces \frac{num}{den} with balanced brace parsing.
 */
function replaceFractions(str: string): string {
  let s = str;
  let fracIdx = s.indexOf("\\frac");
  let safety = 0;

  while (fracIdx !== -1 && safety++ < 20) {
    let cursor = fracIdx + 5;
    while (cursor < s.length && /\s/.test(s[cursor])) cursor++;

    const numGroup = extractBracedGroup(s, cursor);
    if (!numGroup) {
      s = s.slice(0, fracIdx) + s.slice(fracIdx + 5);
      fracIdx = s.indexOf("\\frac");
      continue;
    }

    cursor = numGroup.endIndex + 1;
    while (cursor < s.length && /\s/.test(s[cursor])) cursor++;

    const denGroup = extractBracedGroup(s, cursor);
    if (!denGroup) {
      s = s.slice(0, fracIdx) + numGroup.content + s.slice(numGroup.endIndex + 1);
      fracIdx = s.indexOf("\\frac");
      continue;
    }

    let num = formatMathFormula(numGroup.content).trim();
    let den = formatMathFormula(denGroup.content).trim();
    num = num.replace(/([∂∇Δ])\s*([A-Za-z0-9\u0370-\u03ff])/g, "$1$2");
    den = den.replace(/([∂∇Δ])\s*([A-Za-z0-9\u0370-\u03ff])/g, "$1$2");

    let replacement = "";
    if (num === "1" && den === "2") replacement = "½";
    else if (num === "1" && den === "3") replacement = "⅓";
    else if (num === "2" && den === "3") replacement = "⅔";
    else if (num === "1" && den === "4") replacement = "¼";
    else if (num === "3" && den === "4") replacement = "¾";
    else if (num === "1" && den === "8") replacement = "⅛";
    else {
      const isSimpleNum = !/[\s+\-=]/.test(num) || /^[\w\d^²³_\u0370-\u03ff∂∇Δ]+$/.test(num);
      const isSimpleDen = !/[\s+\-=]/.test(den) || /^[\w\d^²³_\u0370-\u03ff∂∇Δ]+$/.test(den);
      const numStr = isSimpleNum ? num : `(${num})`;
      const denStr = isSimpleDen ? den : `(${den})`;
      replacement = `${numStr}/${denStr}`;
    }

    s = s.slice(0, fracIdx) + replacement + s.slice(denGroup.endIndex + 1);
    fracIdx = s.indexOf("\\frac");
  }

  return s;
}

/**
 * Replaces \sqrt[n]{x} or \sqrt{x} with balanced brace parsing.
 */
function replaceRoots(str: string): string {
  let s = str;
  let rootIdx = s.indexOf("\\sqrt");
  let safety = 0;

  while (rootIdx !== -1 && safety++ < 20) {
    let cursor = rootIdx + 5;
    while (cursor < s.length && /\s/.test(s[cursor])) cursor++;

    let degree = "";
    if (s[cursor] === "[") {
      const closeBracket = s.indexOf("]", cursor);
      if (closeBracket !== -1) {
        degree = toSuperscript(s.slice(cursor + 1, closeBracket).trim());
        cursor = closeBracket + 1;
        while (cursor < s.length && /\s/.test(s[cursor])) cursor++;
      }
    }

    const argGroup = extractBracedGroup(s, cursor);
    if (!argGroup) {
      s = s.slice(0, rootIdx) + "√" + s.slice(cursor);
      rootIdx = s.indexOf("\\sqrt");
      continue;
    }

    const radicand = formatMathFormula(argGroup.content).trim();
    const formattedRoot = radicand.length === 1 && !degree ? `√${radicand}` : `${degree}√(${radicand})`;

    s = s.slice(0, rootIdx) + formattedRoot + s.slice(argGroup.endIndex + 1);
    rootIdx = s.indexOf("\\sqrt");
  }

  return s;
}

/**
 * Universal mathematical formula formatter.
 * Converts LaTeX strings or escaped formulas into clear, beautiful Unicode chalkboard math.
 */
export function formatMathFormula(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let s = raw.trim();

  // 1. Function application argument lists: e.g. N\(\mu, \sigma^2/n\) -> N(\mu, \sigma^2/n)
  s = s.replace(/([a-zA-Z0-9_]+)\\\((.*?)\\\)/g, "$1($2)");

  // 2. Strip outer LaTeX display / inline delimiters: \( \), \[ \], $$, $
  s = s.replace(/^\\\[\s*/, "").replace(/\s*\\\]$/, "");
  s = s.replace(/\\\((.*?)\\\)/g, "$1");
  s = s.replace(/\\\[(.*?)\\\]/g, "$1");
  s = s.replace(/\$\$(.*?)\$\$/g, "$1");
  s = s.replace(/\$(.*?)\$/g, "$1");

  // Strip LaTeX environments: \begin{equation} ... \end{equation}, \begin{align} ...
  s = s.replace(/\\begin\{[a-zA-Z*]+\}/g, "");
  s = s.replace(/\\end\{[a-zA-Z*]+\}/g, "");

  // 3. Bracket sizing operators: \left(, \right), \Big(, etc.
  s = s.replace(/\\left\s*([(\[{|])/g, "$1");
  s = s.replace(/\\right\s*([)\]}|])/g, "$1");
  s = s.replace(/\\left\s*\\\./g, "");
  s = s.replace(/\\right\s*\\\./g, "");
  s = s.replace(/\\(?:big|Big|bigg|Bigg)[lr]?\s*([()\[\]{}|])/g, "$1");

  // 4. LaTeX text wrappers: \text{...}, \mathrm{...}, \mathbf{...}, \operatorname{...}
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|operatorname)\{([^{}]+)\}/g, "$1");

  // Blackboard bold & Calligraphic: \mathbb{R} -> ℝ, \mathcal{N} -> N
  s = s.replace(/\\mathbb\{([A-Z])\}/g, (_, ch) => BB_MAP[ch] || ch);
  s = s.replace(/\\mathcal\{([A-Z])\}/g, (_, ch) => CAL_MAP[ch] || ch);

  // 5. Balanced Fractions & Roots (handles arbitrary nested braces)
  s = replaceFractions(s);
  s = replaceRoots(s);

  // 6. Accents: \bar, \hat, \vec, \tilde, \dot, \ddot
  // Single char in braces: \bar{X} -> X̄ (U+0304)
  s = s.replace(/\\bar\{([A-Za-z0-9])\}/g, "$1\u0304");
  s = s.replace(/\\bar\s+([A-Za-z0-9])/g, "$1\u0304");
  // \hat{y} -> ŷ or ŷ (U+0302)
  s = s.replace(/\\hat\{y\}/g, "ŷ");
  s = s.replace(/\\hat\{Y\}/g, "Ŷ");
  s = s.replace(/\\hat\{([A-Za-z0-9])\}/g, "$1\u0302");
  s = s.replace(/\\hat\s+([A-Za-z0-9])/g, "$1\u0302");
  // \vec{v} -> v⃗ (U+20D7)
  s = s.replace(/\\vec\{([A-Za-z0-9])\}/g, "$1\u20D7");
  s = s.replace(/\\vec\s+([A-Za-z0-9])/g, "$1\u20D7");
  // \tilde{x} -> x̃ (U+0303)
  s = s.replace(/\\tilde\{([A-Za-z0-9])\}/g, "$1\u0303");
  // \dot, \ddot
  s = s.replace(/\\dot\{([A-Za-z0-9])\}/g, "$1\u0307");
  s = s.replace(/\\ddot\{([A-Za-z0-9])\}/g, "$1\u0308");

  // 7. Greek letters & symbols: \mu, \sigma, \alpha, \Delta, \partial, etc.
  s = s.replace(/\\([A-Za-z]+)/g, (match, name) => {
    if (GREEK_MAP[name]) return GREEK_MAP[name];
    if (SYMBOL_MAP[name]) return SYMBOL_MAP[name];
    return match;
  });

  // 8. Clean derivative / operator spacing: e.g. "∂ L" -> "∂L", "Δ W" -> "ΔW", "∂ ψ" -> "∂ψ"
  s = s.replace(/([∂∇Δ])\s*([A-Za-z0-9\u0370-\u03ff])/g, "$1$2");

  // 9. Superscripts: ^{...} or ^x
  s = s.replace(/\^\{([^{}]+)\}/g, (_, exp) => toSuperscript(exp));
  s = s.replace(/\^([0-9a-zA-Z*+-])/g, (_, exp) => toSuperscript(exp));

  // 10. Subscripts: _{...} or _x
  s = s.replace(/_\{([^{}]+)\}/g, (_, sub) => toSubscript(sub));
  s = s.replace(/_([0-9a-zA-Z+-])/g, (_, sub) => toSubscript(sub));

  // 11. LaTeX spacing & formatting artifacts:
  s = s.replace(/\\(?:quad|qquad|,|;|:|!)/g, " ");
  s = s.replace(/\\\{/g, "{");
  s = s.replace(/\\\}/g, "}");
  s = s.replace(/\\\\/g, " | ");

  // Strip remaining loose backslashes before plain words
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  s = s.replace(/\\/g, "");

  // 12. Clean operator spacing: e.g. "·" or "±"
  s = s.replace(/\s*·\s*/g, " · ");
  s = s.replace(/\s*±\s*/g, " ± ");
  s = s.replace(/\s*=\s*/g, " = ");
  s = s.replace(/\s*~\s*/g, " ~ ");
  s = s.replace(/\s*→\s*/g, " → ");

  // 13. Normalize whitespace & punctuation
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Checks if a string contains mathematical formulas or equations.
 */
export function isMathematicalFormula(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (/\\[a-zA-Z]+/.test(text)) return true;
  if (/\\\(|\\\[|\$\$/.test(text)) return true;
  if (/[=~≈≠≤≥±·×÷√∫∑∏∂∇→⇒⇔]/.test(text)) return true;
  if (/[\^²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣⁱᵀ*]/.test(text)) return true;
  if (/_[0-9a-zA-Z]/.test(text)) return true;
  if (/\b[NnPpEe]\s*\([^\)]+,\s*[^\)]+\)/.test(text)) return true;
  return false;
}
