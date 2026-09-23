/**
 * Manages Web Speech API voice discovery, ranking, and preferences.
 * Prioritizes modern studio-grade Natural/Neural voices over legacy robotic synths.
 */

export interface VoiceOption {
  name: string;
  lang: string;
  uri: string;
  isNatural: boolean;
  label: string;
}

// Preferred high-clarity voice name substrings
const NATURAL_PATTERN = /natural|neural|online \(natural\)|studio|premium/i;
const PREFERRED_NAMES = [
  "jenny",
  "guy",
  "aria",
  "google us english",
  "google uk english female",
  "google uk english male",
  "samantha",
  "daniel",
  "karen",
  "moira",
  "alex",
  "ava",
  "oliver",
  "serena",
];

// Robotic legacy desktop synthesizers to avoid if natural voices are present
const ROBOTIC_LEGACY_PATTERN = /desktop|david|zira|mark|hazel|george|susan/i;

/**
 * Rates voice quality (higher score = better clarity & naturalness)
 */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const nameLower = voice.name.toLowerCase();
  const langLower = voice.lang.toLowerCase();

  // English priority for primary instruction
  if (langLower.startsWith("en-us")) score += 40;
  else if (langLower.startsWith("en")) score += 30;
  else score -= 50;

  // Modern Neural / Natural voices are ranked highest
  if (NATURAL_PATTERN.test(nameLower)) {
    score += 100;
  }

  // Highly rated individual voices
  for (let i = 0; i < PREFERRED_NAMES.length; i++) {
    if (nameLower.includes(PREFERRED_NAMES[i])) {
      score += 50 - i * 2;
      break;
    }
  }

  // Heavily penalize old legacy Windows desktop voices (e.g. Microsoft David Desktop)
  if (ROBOTIC_LEGACY_PATTERN.test(nameLower) && !NATURAL_PATTERN.test(nameLower)) {
    score -= 80;
  }

  return score;
}

/**
 * Returns ranked list of English voices available in the browser.
 */
export function getRankedVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const sorted = [...englishVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return sorted.length ? sorted : voices;
}

/**
 * Automatically selects the best available natural voice based on user preference or high-clarity ranking.
 */
export function getBestAvailableVoice(
  voices: SpeechSynthesisVoice[],
  preferredUri?: string | null
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  // 1. If user previously chose a specific voice URI, try to match it
  if (preferredUri) {
    const matched = voices.find((v) => v.voiceURI === preferredUri || v.name === preferredUri);
    if (matched) return matched;
  }

  // 2. Otherwise pick the highest-ranked natural voice
  const ranked = getRankedVoices(voices);
  return ranked[0] || null;
}

/**
 * Formats a clean human-friendly voice name for the UI selector
 */
export function formatVoiceLabel(voice: SpeechSynthesisVoice): string {
  let clean = voice.name;
  clean = clean.replace(/Microsoft\s+/g, "");
  clean = clean.replace(/Online\s+\(Natural\)\s+-\s+English\s+\([^)]+\)/gi, "(Natural)");
  clean = clean.replace(/Desktop\s+-\s+English\s+\([^)]+\)/gi, "(Classic)");
  clean = clean.replace(/-\s+English\s+\([^)]+\)/gi, "");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

export const SPEECH_RATE_KEY = "chalkie:speech-speed";
export const PREFERRED_VOICE_KEY = "chalkie:preferred-voice";

export const DEFAULT_SPEECH_RATE = 0.92; // Optimal clarity & natural cadence
export const DEFAULT_SPEECH_PITCH = 1.0; // Natural resonant pitch
