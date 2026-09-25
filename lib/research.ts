import crypto from "node:crypto";
import type { ResearchSource } from "@/lib/lesson-schema";
import type { GroqCallOptions } from "@/lib/groq-pool";
import { resolveProviderCredentials } from "@/lib/provider-credentials";

type TavilyResult = { title?: string; url?: string; content?: string; raw_content?: string; score?: number };
type ResearchChunk = { id: string; sourceId: string; title: string; url: string; text: string; lexical: number; semantic: number; score: number };
type ResearchIndex = { question: string; sources: ResearchSource[]; chunks: ResearchChunk[]; indexedAt: number };

declare global {
  var chalkieResearchIndexes: Map<string, ResearchIndex> | undefined;
}

const researchIndexes = globalThis.chalkieResearchIndexes ?? new Map<string, ResearchIndex>();
globalThis.chalkieResearchIndexes = researchIndexes;

const stopWords = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "how", "what", "why"]);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]{2,}/g)?.filter((token) => !stopWords.has(token)) ?? [];
}

function chunkText(text: string, maxChars = 1800): string[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 28000);
  if (!clean) return [];
  const chunks: string[] = [];
  for (let cursor = 0; cursor < clean.length; cursor += maxChars - 250) {
    chunks.push(clean.slice(cursor, cursor + maxChars));
    if (chunks.length >= 12) break;
  }
  return chunks;
}

function lexicalScore(query: string, text: string): number {
  const queryTokens = tokens(query);
  const documentTokens = tokens(text);
  if (!queryTokens.length || !documentTokens.length) return 0;
  const frequencies = new Map<string, number>();
  for (const token of documentTokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const score = queryTokens.reduce((total, token) => total + Math.log1p(frequencies.get(token) ?? 0), 0);
  return Math.min(1, score / Math.max(2, queryTokens.length * 0.8));
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, left = 0, right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; left += a[index] ** 2; right += b[index] ** 2;
  }
  return dot / (Math.sqrt(left) * Math.sqrt(right) || 1);
}

async function embeddings(input: string[], signal?: AbortSignal): Promise<number[][] | null> {
  signal?.throwIfAborted();
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.map((item) => item.embedding) ?? null;
  } catch {
    signal?.throwIfAborted();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function indexKey(sessionId: string) {
  return `chalkie:index:${crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 24)}`;
}

async function rankChunks(question: string, chunks: ResearchChunk[], groqOptions: GroqCallOptions = {}): Promise<ResearchChunk[]> {
  groqOptions.signal?.throwIfAborted();
  const rescored = chunks.map((chunk) => ({ ...chunk, lexical: lexicalScore(question, chunk.text), semantic: 0, score: 0 }));
  const candidatePool = rescored.sort((a, b) => b.lexical - a.lexical).slice(0, 30);
  const vectors = await embeddings([question, ...candidatePool.map((chunk) => chunk.text)], groqOptions.signal);
  if (vectors?.length === candidatePool.length + 1) {
    const queryVector = vectors[0];
    candidatePool.forEach((chunk, index) => { chunk.semantic = Math.max(0, cosine(queryVector, vectors[index + 1])); });
  }
  candidatePool.forEach((chunk) => { chunk.score = vectors ? (chunk.semantic * 0.62 + chunk.lexical * 0.38) : chunk.lexical; });
  // Indexing must NOT burn the user's Groq teaching quota. The hybrid lexical/semantic
  // ranking provides high-quality retrieval without consuming Groq tokens.
  return candidatePool.sort((a, b) => b.score - a.score).slice(0, 6);
}

function contextFromChunks(chunks: ResearchChunk[]) {
  return chunks.map((chunk, index) => `[${index + 1}] ${chunk.title}\nURL: ${chunk.url}\n${chunk.text.slice(0, 550)}`).join("\n\n");
}

async function saveIndex(sessionId: string, index: ResearchIndex) {
  researchIndexes.set(indexKey(sessionId), index);
}

async function loadIndex(sessionId: string): Promise<ResearchIndex | null> {
  const key = indexKey(sessionId);
  return researchIndexes.get(key) ?? null;
}

export async function retrieveSessionContext(question: string, sessionId: string, fallbackSources: ResearchSource[] = [], groqOptions: GroqCallOptions = {}): Promise<{ sources: ResearchSource[]; context: string; indexed: boolean }> {
  groqOptions.signal?.throwIfAborted();
  const stored = await loadIndex(sessionId);
  const fallbackChunks: ResearchChunk[] = fallbackSources.map((source, index) => ({
    id: `fallback-${index + 1}`,
    sourceId: source.id,
    title: source.title,
    url: source.url,
    text: source.summary,
    lexical: 0,
    semantic: 0,
    score: 0,
  }));
  const chunks = stored?.chunks.length ? stored.chunks : fallbackChunks;
  if (!chunks.length) return { sources: stored?.sources ?? fallbackSources, context: "", indexed: false };
  const ranked = await rankChunks(question, chunks, groqOptions);
  return {
    sources: stored?.sources ?? fallbackSources,
    context: contextFromChunks(ranked),
    indexed: Boolean(stored),
  };
}

export async function researchQuestion(question: string, sessionId: string, groqOptions: GroqCallOptions = {}): Promise<{ sources: ResearchSource[]; context: string }> {
  groqOptions.signal?.throwIfAborted();
  const tavilyKey = (await resolveProviderCredentials()).tavilyKey;
  if (!tavilyKey) return { sources: [], context: "" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Research request timed out", "TimeoutError")), 35000);
  let results: TavilyResult[] = [];
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: groqOptions.signal ? AbortSignal.any([groqOptions.signal, controller.signal]) : controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavilyKey, query: question, max_results: 20, search_depth: "advanced", include_raw_content: "markdown", include_answer: false }),
    });
    if (!response.ok) throw new Error(`Tavily search failed (${response.status})`);
    results = ((await response.json()) as { results?: TavilyResult[] }).results ?? [];
  } finally {
    clearTimeout(timer);
  }

  const seen = new Set<string>();
  const unique = results.filter((result) => {
    if (!result.url) return false;
    const normalized = result.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 20);

  const sources: ResearchSource[] = unique.map((result, index) => ({
    id: `source-${index + 1}`,
    title: (result.title || `Source ${index + 1}`).slice(0, 180),
    url: result.url!,
    publisher: new URL(result.url!).hostname.replace(/^www\./, "").slice(0, 100),
    summary: (result.content || result.raw_content || "Relevant source").replace(/\s+/g, " ").slice(0, 500),
    score: Math.max(0, Math.min(1, result.score ?? 0.5)),
  }));

  const chunks: ResearchChunk[] = [];
  unique.forEach((result, sourceIndex) => {
    chunkText(result.raw_content || result.content || "").forEach((text, chunkIndex) => {
      chunks.push({ id: `chunk-${sourceIndex + 1}-${chunkIndex + 1}`, sourceId: `source-${sourceIndex + 1}`, title: sources[sourceIndex]?.title ?? "Source", url: result.url!, text, lexical: lexicalScore(question, text), semantic: 0, score: 0 });
    });
  });

  // Persist the fetched material before any optional embeddings or LLM work.
  // This keeps the session RAG base available even if Groq is rate-limited.
  const storedChunks = chunks.slice(0, 120);
  await saveIndex(sessionId, { question, sources, chunks: storedChunks, indexedAt: Date.now() });
  const ranked = await rankChunks(question, storedChunks, groqOptions);
  const context = contextFromChunks(ranked);
  return { sources, context };
}
