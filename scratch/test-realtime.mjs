import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { attachRealtimeServer } from "../lib/realtime-server.mjs";

async function setup(t, options) {
  const server = createServer();
  const hub = attachRealtimeServer(server, async (_req, socket) => socket.destroy(), options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { for (const socket of hub.clients) socket.terminate(); hub.close(); server.close(); });
  const url = `ws://127.0.0.1:${server.address().port}/api/ws`;
  async function client(sessionId, clientOptions) {
    const socket = new WebSocket(url, clientOptions);
    t.after(() => socket.terminate());
    const received = [];
    socket.on("message", (raw) => received.push(JSON.parse(raw.toString())));
    await until(() => received.some((event) => event.type === "ready"));
    socket.send(JSON.stringify({ type: "join", sessionId, clientId: "test" }));
    await until(() => received.some((event) => event.type === "joined"));
    return { socket, received };
  }
  return { client };
}

async function until(condition) {
  const end = Date.now() + 2000;
  while (!condition()) {
    assert.ok(Date.now() < end, "WebSocket expectation timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("immediate join, ping and peer events work without exposing extra fields or crossing sessions", async (t) => {
  const { client } = await setup(t);
  const a = await client("lesson-a");
  const b = await client("lesson-a");
  const c = await client("lesson-b");
  a.socket.send(JSON.stringify({ type: "ping" }));
  await until(() => a.received.some((event) => event.type === "pong"));
  a.socket.send(JSON.stringify({ type: "pointer", targetIds: ["node-1"], apiKey: "must-not-be-relayed", sessionId: "lesson-b" }));
  await until(() => b.received.some((event) => event.type === "pointer"));
  assert.deepEqual(b.received.find((event) => event.type === "pointer"), { type: "pointer", sessionId: "lesson-a", targetIds: ["node-1"] });
  assert.ok(!c.received.some((event) => event.type === "pointer"));
});

test("malformed frames do not crash the connection", async (t) => {
  const { client } = await setup(t);
  const a = await client("lesson");
  for (const frame of ["null", "[]", "{", '"text"']) a.socket.send(frame);
  a.socket.send(JSON.stringify({ type: "ping" }));
  await until(() => a.received.some((event) => event.type === "pong"));
  assert.equal(a.socket.readyState, WebSocket.OPEN);
});

test("heartbeat terminates an unresponsive peer so it can reconnect", async (t) => {
  const { client } = await setup(t, { heartbeatMs: 40 });
  const a = await client("lesson", { autoPong: false });
  await until(() => a.socket.readyState === WebSocket.CLOSED);
});
