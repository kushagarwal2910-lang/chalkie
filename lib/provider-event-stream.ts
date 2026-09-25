import { providerFailureError } from "./provider-retry.ts";

/** A successful plan is committed by the caller only after terminal done(ok:true). */
export async function readProviderEventStream(response: Response, onEvent: (type: string, data: Record<string, unknown>) => void) {
  if (!response.body) throw new Error("The provider connection did not return a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  function dispatch(block: string) {
    const type = block.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? "message";
    const lines = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart());
    if (!lines.length) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(lines.join("\n")) as Record<string, unknown>; }
    catch { throw new Error("The provider sent an unreadable response. Please retry the request."); }
    if (type === "error") throw providerFailureError(data);
    if (type === "done" && data.ok !== true) throw providerFailureError(data, "The request did not finish successfully.");
    onEvent(type, data);
    if (type === "done") completed = true;
  }
  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // A CRLF pair can span network chunks, so normalize the accumulated data.
      buffer = buffer.replace(/\r\n/g, "\n");
      let separator: number;
      while (!completed && (separator = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        dispatch(block);
      }
      if (done) {
        if (!completed && buffer.trim()) dispatch(buffer);
        break;
      }
    }
    if (!completed) throw new Error("The connection ended before the request finished. Please retry it.");
  } finally {
    try { await reader.cancel(); } catch { /* the network may already be closed */ }
    reader.releaseLock();
  }
}
