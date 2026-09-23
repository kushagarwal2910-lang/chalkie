import type WebSocket from "ws";

type Connection = { sessionId: string; clientId: string; joinedAt: number };
type RealtimeEvent = {
  type: "timeline" | "pointer" | "interrupt" | "voice_query" | "generation" | "presence" | "pong" | "ready" | "joined";
  sessionId?: string;
  clientId?: string;
  segmentId?: string;
  targetIds?: string[];
  action?: string;
  question?: string;
  stage?: string;
  message?: string;
  ts?: number;
};

declare global {
  var chalkieSockets: Map<WebSocket, Connection> | undefined;
}

const sockets = globalThis.chalkieSockets ?? new Map<WebSocket, Connection>();
globalThis.chalkieSockets = sockets;

function send(ws: WebSocket, payload: RealtimeEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

export function registerSocket(ws: WebSocket) {
  sockets.set(ws, { sessionId: "", clientId: "", joinedAt: Date.now() });
  send(ws, { type: "ready", ts: Date.now() });
}

export function joinSession(ws: WebSocket, sessionId: string, clientId: string) {
  const connection = sockets.get(ws);
  if (!connection) return;
  connection.sessionId = sessionId.slice(0, 120);
  connection.clientId = clientId.slice(0, 120);
  send(ws, { type: "joined", sessionId: connection.sessionId, clientId: connection.clientId, ts: Date.now() });
  broadcast(connection.sessionId, { type: "presence", sessionId: connection.sessionId, clientId: connection.clientId, ts: Date.now() });
}

export function relayEvent(ws: WebSocket, payload: RealtimeEvent) {
  const connection = sockets.get(ws);
  if (!connection?.sessionId) return;
  broadcast(connection.sessionId, { ...payload, sessionId: connection.sessionId, clientId: connection.clientId, ts: Date.now() }, ws);
}

export function pong(ws: WebSocket) {
  send(ws, { type: "pong", ts: Date.now() });
}

export function unregisterSocket(ws: WebSocket) {
  sockets.delete(ws);
}

function broadcast(sessionId: string, payload: RealtimeEvent, except?: WebSocket) {
  for (const [socket, connection] of sockets) {
    if (socket !== except && connection.sessionId === sessionId) send(socket, payload);
  }
}
