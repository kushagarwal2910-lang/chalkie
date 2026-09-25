import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const state = globalThis.__byokCredentialTest = { value: undefined, options: undefined };
const headersMock = "data:text/javascript," + encodeURIComponent(`
export async function cookies(){ const s=globalThis.__byokCredentialTest;return {
get:()=>s.value?{value:s.value}:undefined,
set:(_name,value,options)=>{s.value=value;s.options=options;},
delete:()=>{s.value=undefined;}
};}`);
const poolMock = "data:text/javascript," + encodeURIComponent("export async function getGroqQuotaSnapshot(){return {keys:[]};}");
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "next/headers") return { url: headersMock, shortCircuit: true };
  if (specifier === "@/lib/groq-pool") return { url: poolMock, shortCircuit: true };
  if (specifier === "@/lib/provider-credentials") return next(new URL("../lib/provider-credentials.ts", import.meta.url).href, context);
  return next(specifier, context);
}});
process.env.NODE_ENV = "production";
process.env.BYOK_ENCRYPTION_SECRET = "offline-test-encryption-secret-only-".repeat(2);
delete process.env.GROQ_API_KEY;
delete process.env.GROQ_API_KEY_2;
delete process.env.GROQ_API_KEY_3;
delete process.env.TAVILY_API_KEY;
const credentials = await import("../lib/provider-credentials.ts");
const route = await import("../app/api/byok/route.ts");
const keyA = "gsk_offline_test_A_12345678901234567890";
const keyB = "gsk_offline_test_B_12345678901234567890";
const keyC = "gsk_offline_test_C_12345678901234567890";
const tavily = "tvly-offline-test-1234567890";
function request(body, origin = "https://chalkie.example") {
  const req = new Request("https://chalkie.example/api/byok", { method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  req.nextUrl = new URL(req.url);
  return req;
}
function reset() { state.value = undefined; state.options = undefined; }

test("three ordered BYOK keys are encrypted in an HttpOnly cookie and never returned", async () => {
  reset();
  const response = await route.POST(request({ groqKeys: [keyA, keyB, keyC], tavilyKey: tavily }));
  assert.equal(response.status, 200);
  assert.ok(!state.value.includes(keyA));
  assert.deepEqual(credentials.decryptProviderCredentials(state.value).groqKeys, [keyA, keyB, keyC]);
  assert.equal(state.options.httpOnly, true);
  assert.equal(state.options.secure, true);
  assert.equal(state.options.sameSite, "strict");
  const returned = JSON.stringify(await (await route.GET(request())).json());
  for (const secret of [keyA, keyB, keyC, tavily]) assert.ok(!returned.includes(secret));
});

test("Tavily-only credentials remain valid and are not marked as needing reentry", async () => {
  reset();
  assert.equal((await route.POST(request({ tavilyKey: tavily }))).status, 200);
  const info = await (await route.GET(request())).json();
  assert.equal(info.tavilySource, "byok");
  assert.equal(info.personalKeysNeedReentry, false);
});

test("updating either provider preserves the other and deduplicates Groq in order", async () => {
  reset();
  await route.POST(request({ groqKeys: [keyA, keyA, keyB] }));
  await route.POST(request({ groqKeys: ["", "", ""], tavilyKey: tavily }));
  assert.deepEqual(credentials.decryptProviderCredentials(state.value).groqKeys, [keyA, keyB]);
  await route.POST(request({ groqKeys: [keyC] }));
  const saved = credentials.decryptProviderCredentials(state.value);
  assert.deepEqual(saved.groqKeys, [keyC]);
  assert.equal(saved.tavilyKey, tavily);
});

test("bad keys, too many slots and cross-origin writes do not replace saved keys", async () => {
  reset();
  await route.POST(request({ groqKeys: [keyA] }));
  const original = state.value;
  for (const input of [{ groqKeys: ["bad"] }, { groqKeys: [keyA, keyB, keyC, keyA] }, {}]) {
    assert.equal((await route.POST(request(input))).status, 400);
    assert.equal(state.value, original);
  }
  assert.equal((await route.POST(request({ groqKeys: [keyB] }, "https://other.example"))).status, 403);
  assert.equal(state.value, original);
});

test("tampered cookie requests key reentry; deleting removes all personal credentials", async () => {
  reset();
  await route.POST(request({ groqKeys: [keyA], tavilyKey: tavily }));
  const bytes = Buffer.from(state.value, "base64url");
  bytes[15] ^= 1;
  state.value = bytes.toString("base64url");
  assert.equal((await (await route.GET(request())).json()).personalKeysNeedReentry, true);
  assert.equal((await route.DELETE(request())).status, 200);
  assert.equal(state.value, undefined);
});

test("public Host permits same-origin BYOK behind an internal custom-server hostname", async () => {
  reset();
  const sameSite = request({ groqKeys: [keyA] });
  sameSite.headers.set("host", "chalkie.example");
  sameSite.nextUrl = new URL("http://0.0.0.0:10000/api/byok");
  assert.equal((await route.POST(sameSite)).status, 200);
  const original = state.value;
  const crossSite = request({ groqKeys: [keyB] }, "https://other.example");
  crossSite.headers.set("host", "chalkie.example");
  crossSite.nextUrl = sameSite.nextUrl;
  assert.equal((await route.POST(crossSite)).status, 403);
  assert.equal(state.value, original);
});
