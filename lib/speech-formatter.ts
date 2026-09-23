/**
 * Formats lesson narration text to optimize pronunciation, clarity,
 * and natural pause cadence for AI speech synthesis.
 */

// Common measurement units to expand for clear pronunciation
const UNIT_REPLACEMENTS: [RegExp, string][] = [
  // Speed & distance
  [/\b(\d+(?:\.\d+)?)\s*km\/h\b/gi, "$1 kilometers per hour"],
  [/\b(\d+(?:\.\d+)?)\s*mph\b/gi, "$1 miles per hour"],
  [/\b(\d+(?:\.\d+)?)\s*km\b/gi, "$1 kilometers"],
  [/\b(\d+(?:\.\d+)?)\s*m\b/gi, "$1 meters"],
  [/\b(\d+(?:\.\d+)?)\s*cm\b/gi, "$1 centimeters"],
  [/\b(\d+(?:\.\d+)?)\s*mm\b/gi, "$1 millimeters"],
  [/\b(\d+(?:\.\d+)?)\s*nm\b/gi, "$1 nanometers"],

  // Weight & mass
  [/\b(\d+(?:\.\d+)?)\s*kg\b/gi, "$1 kilograms"],
  [/\b(\d+(?:\.\d+)?)\s*mg\b/gi, "$1 milligrams"],
  [/\b(\d+(?:\.\d+)?)\s*t\b/gi, "$1 tons"],

  // Electrical & power
  [/\b(\d+(?:\.\d+)?)\s*kV\b/gi, "$1 kilovolts"],
  [/\b(\d+(?:\.\d+)?)\s*mV\b/gi, "$1 millivolts"],
  [/\b(\d+(?:\.\d+)?)\s*V\b/gi, "$1 volts"],
  [/\b(\d+(?:\.\d+)?)\s*kW\b/gi, "$1 kilowatts"],
  [/\b(\d+(?:\.\d+)?)\s*MW\b/gi, "$1 megawatts"],
  [/\b(\d+(?:\.\d+)?)\s*GW\b/gi, "$1 gigawatts"],
  [/\b(\d+(?:\.\d+)?)\s*W\b/gi, "$1 watts"],
  [/\b(\d+(?:\.\d+)?)\s*mA\b/gi, "$1 milliamps"],
  [/\b(\d+(?:\.\d+)?)\s*A\b/gi, "$1 amps"],
  [/\b(\d+(?:\.\d+)?)\s*hp\b/gi, "$1 horsepower"],
  [/\b(\d+(?:\.\d+)?)\s*rpm\b/gi, "$1 revolutions per minute"],

  // Frequencies
  [/\b(\d+(?:\.\d+)?)\s*GHz\b/gi, "$1 gigahertz"],
  [/\b(\d+(?:\.\d+)?)\s*MHz\b/gi, "$1 megahertz"],
  [/\b(\d+(?:\.\d+)?)\s*kHz\b/gi, "$1 kilohertz"],
  [/\b(\d+(?:\.\d+)?)\s*Hz\b/gi, "$1 hertz"],

  // Temperature & percentages
  [/\b(\d+(?:\.\d+)?)\s*°C\b/gi, "$1 degrees Celsius"],
  [/\b(\d+(?:\.\d+)?)\s*°F\b/gi, "$1 degrees Fahrenheit"],
  [/\b(\d+(?:\.\d+)?)\s*%\b/gi, "$1 percent"],
];

// Common abbreviations to expand into clear spoken English
const ABBREVIATION_REPLACEMENTS: [RegExp, string][] = [
  [/\be\.g\.,?\s*/gi, "for example, "],
  [/\bi\.e\.,?\s*/gi, "that is, "],
  [/\bvs\.?\s*/gi, "versus "],
  [/\bapprox\.?\s*/gi, "approximately "],
  [/\betc\.?\s*/gi, "and so on. "],
  [/\bmin\.?\s*/gi, "minutes "],
  [/\bsec\.?\s*/gi, "seconds "],
  [/\bdept\.?\s*/gi, "department "],
  [/\bno\.\s*(\d+)/gi, "number $1"],
];

// Technical shorthand and symbols
const SYMBOL_REPLACEMENTS: [RegExp, string][] = [
  [/-->|->|→/g, ", which leads to, "],
  [/==>|=>|⇒/g, ", producing, "],
  [/<--|<-|←/g, ", derived from, "],
  [/\s*\+\s*/g, " plus "],
  [/\s*=\s*/g, " equals "],
  [/\s*&\s*/g, " and "],
  [/(\w+)\/(\w+)/g, "$1 or $2"], // e.g. input/output -> input or output
  // Mathematical and ML symbols
  [/x₁/g, "x 1"],
  [/x₂/g, "x 2"],
  [/x₃/g, "x 3"],
  [/h₁/g, "h 1"],
  [/h₂/g, "h 2"],
  [/h₃/g, "h 3"],
  [/h₄/g, "h 4"],
  [/ŷ/g, "y-hat"],
  [/W₁/g, "W 1"],
  [/W₂/g, "W 2"],
  [/ΔW|Δw/g, "delta W"],
  [/\bσ\b|σ/g, "sigma"],
  [/\bη\b|η/g, "eta"],
  [/½/g, "one-half"],
  [/∂L\s*\/\s*∂W/gi, "the gradient of loss with respect to W"],
];

/**
 * Formats a raw narration string with natural breath pauses,
 * expanded abbreviations, and phonetic spacing.
 */
export function formatNarrationForSpeech(text: string): string {
  if (!text) return "";

  let formatted = text;

  // 1. Expand technical units
  for (const [pattern, replacement] of UNIT_REPLACEMENTS) {
    formatted = formatted.replace(pattern, replacement);
  }

  // 2. Expand common Latin and written abbreviations
  for (const [pattern, replacement] of ABBREVIATION_REPLACEMENTS) {
    formatted = formatted.replace(pattern, replacement);
  }

  // 3. Expand symbols
  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) {
    formatted = formatted.replace(pattern, replacement);
  }

  // 4. Space out hyphenated alphanumeric model/part numbers (e.g. WAG-12B -> WAG 12 B)
  // so TTS engines pronounce each code character clearly rather than trying to read it as a single mangled word.
  formatted = formatted.replace(/\b([A-Z]{2,})-([0-9]+)([A-Z]?)\b/g, "$1 $2 $3");

  // 5. Punctuation and Natural Cadence Pauses:
  // Colons and semicolons should introduce a distinct natural breath pause
  formatted = formatted.replace(/;\s*/g, ", ");
  formatted = formatted.replace(/:\s*/g, ", ");

  // Em dashes and double dashes -> clean comma pause
  formatted = formatted.replace(/\s*—\s*/g, ", ");
  formatted = formatted.replace(/\s*--\s*/g, ", ");

  // Clean up parentheticals so they flow like spoken side-notes
  formatted = formatted.replace(/\s*\(([^)]+)\)/g, ", $1, ");

  // Break up long clauses at key transition words with a slight comma pause if not already punctuated
  formatted = formatted.replace(/([^\s,;:.!?])\s+(which|whereas|causing|allowing|thereby)\s+/gi, "$1, $2 ");

  // Deduplicate redundant commas and clean up spacing
  formatted = formatted.replace(/\s+,/g, ",");
  formatted = formatted.replace(/,\s*,+/g, ", ");
  formatted = formatted.replace(/,\s*([.!?])/g, "$1");
  formatted = formatted.replace(/\s{2,}/g, " ").trim();

  // Ensure clean terminal punctuation so the voice doesn't clip the final syllable
  if (!/[.!?]$/.test(formatted)) {
    formatted += ".";
  }

  return formatted;
}
