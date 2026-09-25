import { GroqFreeLimitError, GroqHttpError, type GroqQuotaSnapshot } from "./groq-pool";

export interface ProviderFailure {
  code: string;
  message: string;
  retryable: boolean;
  quota?: GroqQuotaSnapshot;
  nextRetryAt?: number;
}

export class ProviderResponseError extends Error {
  readonly code = "INVALID_PROVIDER_RESPONSE";
}

/** Never return a provider's raw response body, credentials, or stack to clients. */
export function providerFailure(error: unknown, latestQuota?: GroqQuotaSnapshot): { status: number; failure: ProviderFailure } {
  const details = error as { code?: string; name?: string; quota?: GroqQuotaSnapshot } | undefined;
  const quota = error instanceof GroqFreeLimitError ? error.quota : details?.quota ?? latestQuota;
  const retry = { ...(quota ? { quota } : {}), ...(quota?.nextRetryAt ? { nextRetryAt: quota.nextRetryAt } : {}) };
  if (error instanceof GroqFreeLimitError) {
    return { status: 429, failure: { code: error.code, message: error.message,
      retryable: !["no_keys", "all_keys_invalid"].includes(quota?.degradationReason ?? ""), ...retry } };
  }
  if (details?.name === "TimeoutError" || details?.code === "PROVIDER_TIMEOUT") {
    return { status: 504, failure: { code: "PROVIDER_TIMEOUT", message: "The provider took too long to respond. Please retry your request.", retryable: true, ...retry } };
  }
  if (details?.name === "AbortError") {
    return { status: 499, failure: { code: "REQUEST_CANCELLED", message: "The request was cancelled.", retryable: true, ...retry } };
  }
  if (error instanceof ProviderResponseError || error instanceof SyntaxError) {
    return { status: 502, failure: { code: "INVALID_PROVIDER_RESPONSE", message: "The provider returned an incomplete or invalid result. Please retry your request.", retryable: true, ...retry } };
  }
  if (error instanceof GroqHttpError) {
    return { status: error.status === 429 ? 429 : 502, failure: { code: "PROVIDER_ERROR", message: "The provider could not complete this request. Check your provider settings or retry.", retryable: true, ...retry } };
  }
  return { status: 502, failure: { code: "GENERATION_FAILED", message: "Chalkie could not complete this request. Your current board has been kept. Please retry.", retryable: true, ...retry } };
}

export function providerFailureResponse(error: unknown, quota?: GroqQuotaSnapshot) {
  const { status, failure } = providerFailure(error, quota);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (failure.nextRetryAt) headers["Retry-After"] = String(Math.max(1, Math.ceil((failure.nextRetryAt - Date.now()) / 1000)));
  return Response.json({ error: failure.message, ...failure, ...(failure.quota ? { providerStatus: failure.quota } : {}) }, { status, headers });
}

type EventWriter = (type: string, data: unknown) => void;

/** A failed stream always terminates with error + done(false), never a demo plan. */
export function providerEventStream(
  request: Request,
  work: (send: EventWriter, signal: AbortSignal) => Promise<void>,
  timeoutMs = 270_000,
) {
  const cancellation = new AbortController();
  const deadline = new AbortController();
  const signal = AbortSignal.any([request.signal, cancellation.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException("Request deadline exceeded", "TimeoutError")), timeoutMs);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let latestQuota: GroqQuotaSnapshot | undefined;
      const write: EventWriter = (type, data) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; cancellation.abort(); }
      };
      const send: EventWriter = (type, data) => {
        signal.throwIfAborted();
        if (type === "provider_status") latestQuota = data as GroqQuotaSnapshot;
        write(type, data);
      };
      // Keep proxies from treating a long model generation as an idle stream.
      heartbeat = setInterval(() => write("heartbeat", { at: Date.now() }), 15000);
      let onAbort = () => {};
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
      try {
        signal.throwIfAborted();
        await Promise.race([work(send, signal), aborted]);
        send("done", { ok: true });
      } catch (error) {
        const { failure } = providerFailure(error, latestQuota);
        if (failure.quota) write("provider_status", failure.quota);
        write("error", failure);
        write("done", { ok: false });
      } finally {
        clearTimeout(timer);
        clearInterval(heartbeat);
        signal.removeEventListener("abort", onAbort);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; clearTimeout(timer); clearInterval(heartbeat); cancellation.abort(new DOMException("Client disconnected", "AbortError")); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  } });
}
