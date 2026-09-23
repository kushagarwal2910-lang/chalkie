import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

export const BYOK_COOKIE = "chalkie_byok";

export type StoredProviderCredentials = {
  version: 1;
  groqKeys: string[];
  tavilyKey?: string;
  savedAt: number;
};

export type ProviderGroqKey = {
  id: string;
  secret: string;
  slot: number;
  masked: string;
  source: "byok" | "server";
};

export type ProviderCredentials = {
  groqKeys: ProviderGroqKey[];
  tavilyKey?: string;
  tavilySource?: "byok" | "server";
  source: "byok" | "server" | "none";
};

declare global {
  var chalkieByokDevelopmentSecret: string | undefined;
}

const DEV_SECRET_FILE = ".chalkie-dev-secret";

/** Load or create a stable development encryption secret so BYOK cookies survive dev-server restarts. */
function loadOrCreateDevSecret(): string {
  const secretPath = path.resolve(process.cwd(), DEV_SECRET_FILE);
  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch { /* file doesn't exist yet */ }
  const fresh = crypto.randomBytes(32).toString("base64url");
  try {
    fs.writeFileSync(secretPath, fresh + "\n", { mode: 0o600 });
    // Ensure .gitignore contains the secret file
    const gitignorePath = path.resolve(process.cwd(), ".gitignore");
    try {
      const gitignore = fs.readFileSync(gitignorePath, "utf8");
      if (!gitignore.includes(DEV_SECRET_FILE)) {
        fs.appendFileSync(gitignorePath, `\n# Chalkie dev encryption secret (auto-generated)\n${DEV_SECRET_FILE}\n`);
      }
    } catch { /* no .gitignore — user's choice */ }
  } catch (error) {
    console.warn(`[chalkie] could not persist dev secret: ${error instanceof Error ? error.message : "unknown"}`);
  }
  return fresh;
}

function encryptionSecret() {
  const configured = process.env.BYOK_ENCRYPTION_SECRET || process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("BYOK_ENCRYPTION_SECRET must contain at least 32 characters in production");
  globalThis.chalkieByokDevelopmentSecret ??= loadOrCreateDevSecret();
  return globalThis.chalkieByokDevelopmentSecret;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(encryptionSecret()).digest();
}

function groqKeyId(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function maskKey(secret: string) {
  return `••••${secret.slice(-4)}`;
}

function uniqueKeys(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function encryptProviderCredentials(credentials: StoredProviderCredentials) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptProviderCredentials(value: string): StoredProviderCredentials {
  const data = Buffer.from(value, "base64url");
  if (data.length < 29) throw new Error("Invalid provider credential cookie");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  const parsed = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")) as StoredProviderCredentials;
  if (parsed.version !== 1 || !Array.isArray(parsed.groqKeys)) throw new Error("Unsupported provider credential cookie");
  return parsed;
}

export async function readByokCookie() {
  try {
    const value = (await cookies()).get(BYOK_COOKIE)?.value;
    return value ? decryptProviderCredentials(value) : null;
  } catch {
    return null;
  }
}

export async function resolveProviderCredentials(): Promise<ProviderCredentials> {
  const byok = await readByokCookie();
  const byokGroq = uniqueKeys(byok?.groqKeys ?? []).slice(0, 3);
  const serverGroq = uniqueKeys([process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3]).slice(0, 3);
  const selected = byokGroq.length ? byokGroq : serverGroq;
  const source = byokGroq.length ? "byok" as const : serverGroq.length ? "server" as const : "none" as const;
  const tavilyKey = byok?.tavilyKey?.trim() || process.env.TAVILY_API_KEY?.trim() || undefined;
  const tavilySource = byok?.tavilyKey?.trim() ? "byok" as const : process.env.TAVILY_API_KEY?.trim() ? "server" as const : undefined;
  return {
    source,
    groqKeys: selected.map((secret, index) => ({ id: groqKeyId(secret), secret, slot: index + 1, masked: source === "byok" ? maskKey(secret) : "managed", source: source === "byok" ? "byok" : "server" })),
    tavilyKey,
    tavilySource,
  };
}

export function byokEncryptionConfigured() {
  return process.env.NODE_ENV !== "production" || Boolean((process.env.BYOK_ENCRYPTION_SECRET || process.env.SESSION_SECRET)?.length && (process.env.BYOK_ENCRYPTION_SECRET || process.env.SESSION_SECRET)!.length >= 32);
}
