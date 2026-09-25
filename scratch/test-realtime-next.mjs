import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import next from "next";
import { WebSocket } from "ws";
import { attachRealtimeServer, RealtimeHttpServer } from "../lib/realtime-server.mjs";

// Run after `pnpm build`. A bare WebSocket hub test cannot reproduce Next's
// second upgrade listener, which appears only after an actual HTTP request.
test("production Next HTTP initialization cannot hijack Chalkie's socket", { timeout: 20000 }, async (t) => {
  await access(new URL("../.next/BUILD_ID", import.meta.url));
  const server = new RealtimeHttpServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const app = next({ dev: false, hostname: "127.0.0.1", port, httpServer: server });
  let hub;
  t.after(async () => {
    for (const socket of hub?.clients ?? []) socket.terminate();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await app.close();
  });
  await app.prepare();
  const handle = app.getRequestHandler();
  server.on("request", (request, response) => handle(request, response));
  hub = attachRealtimeServer(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/version`);
  assert.equal(response.status, 200);
  await response.text();
  assert.ok(server.listenerCount("upgrade") >= 2, "Next installed its own upgrade handler alongside the protocol guard");

  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
  const messages = [];
  socket.on("message", raw => messages.push(JSON.parse(raw.toString())));
  socket.on("error", () => {});
  t.after(() => socket.terminate());
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "join", sessionId: "next-production-regression" }));
  socket.send(JSON.stringify({ type: "ping" }));
  const end = Date.now() + 3000;
  while (!messages.some(message => message.type === "pong")) {
    assert.equal(socket.readyState, WebSocket.OPEN, "Next must not close the upgraded socket");
    assert.ok(Date.now() < end, "joined/pong did not arrive after the upgrade");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(messages.some(message => message.type === "ready"));
  assert.ok(messages.some(message => message.type === "joined"));
  socket.close();
  await once(socket, "close");
});
