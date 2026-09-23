"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "realtime" | "http";

export function useRealtime(sessionId: string, onEvent?: (event: Record<string, unknown>) => void) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    const clientId = sessionStorage.getItem("chalkie:client") || crypto.randomUUID();
    sessionStorage.setItem("chalkie:client", clientId);

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (cancelled) return socket.close();
        delay = 1000;
        const join = () => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "join", sessionId, clientId }));
        };
        handshakeTimer = setTimeout(join, 1500);
      });

      socket.addEventListener("message", (message) => {
        try {
          const event = JSON.parse(message.data) as Record<string, unknown>;
          if (event.type === "ready") {
            if (handshakeTimer) clearTimeout(handshakeTimer);
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "join", sessionId, clientId }));
          }
          if (event.type === "joined") {
            setStatus("realtime");
            if (pingTimer) clearInterval(pingTimer);
            pingTimer = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
            }, 20000);
          }
          onEventRef.current?.(event);
        } catch { /* ignore invalid frames */ }
      });

      socket.addEventListener("close", () => {
        if (pingTimer) clearInterval(pingTimer);
        if (handshakeTimer) clearTimeout(handshakeTimer);
        if (cancelled) return;
        setStatus("http");
        retryTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      });

      socket.addEventListener("error", () => socket.close());
    }

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (handshakeTimer) clearTimeout(handshakeTimer);
      socketRef.current?.close();
    };
  }, [sessionId]);

  const send = useCallback((event: Record<string, unknown>) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(event));
    return true;
  }, []);

  return { status, send };
}
