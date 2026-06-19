/**
 * Minimal Server-Sent-Events parser over a `ReadableStream<Uint8Array>` body.
 *
 * Yields `{ event, data }` records. `event` is the `event:` field name (Anthropic
 * named events: `message_start`, `content_block_delta`, ...) or `null` for the
 * legacy `data:`-only framing the session-prompt path uses. `data` is the raw
 * payload string (one event may carry multiple `data:` lines, joined by `\n`).
 *
 * The terminal `data: [DONE]` sentinel is surfaced as `{ event, data: "[DONE]" }`
 * so callers can detect it.
 */

export interface SSEChunk {
  event: string | null;
  data: string;
}

const decoder = new TextDecoder("utf-8");

/** Iterate the chunks of an SSE response body as `{ event, data }` records. */
export async function* iterSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEChunk> {
  const reader = body.getReader();
  let buffer = "";

  let eventName: string | null = null;
  let dataLines: string[] = [];

  const flush = (): SSEChunk | null => {
    if (dataLines.length === 0 && eventName === null) return null;
    const data = dataLines.join("\n");
    const chunk: SSEChunk = { event: eventName, data };
    eventName = null;
    dataLines = [];
    return chunk;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Normalize CRLF → LF, then split into lines, keeping the trailing partial.
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);

        if (line === "") {
          // Blank line → dispatch the accumulated event.
          const chunk = flush();
          if (chunk) yield chunk;
          continue;
        }
        if (line.startsWith(":")) {
          // Comment line — ignore.
          continue;
        }
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let val = colon === -1 ? "" : line.slice(colon + 1);
        if (val.startsWith(" ")) val = val.slice(1);

        if (field === "event") {
          eventName = val;
        } else if (field === "data") {
          dataLines.push(val);
        }
        // `id` / `retry` fields are ignored.
      }
    }
    // Stream ended — flush any trailing event (no terminating blank line).
    const tail = flush();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
