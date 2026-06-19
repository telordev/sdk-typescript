/**
 * Offline test helpers: a recordable mock `fetch` and an SSE body builder. No
 * test ever touches the network.
 */

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockResponseSpec {
  status?: number;
  /** JSON body — serialized for the response. */
  json?: unknown;
  /** Raw text/SSE body (takes precedence over `json`). */
  text?: string;
  headers?: Record<string, string>;
}

/**
 * Build a mock `fetch` that returns the queued responses in order. The last
 * response is reused if the queue is exhausted. Records every request.
 */
export function mockFetch(responses: MockResponseSpec[]): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  callCount: () => number;
} {
  const requests: RecordedRequest[] = [];
  let i = 0;

  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h) {
      if (h instanceof Headers) {
        h.forEach((v, k) => (headers[k.toLowerCase()] = v));
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k.toLowerCase()] = v;
      } else {
        for (const [k, v] of Object.entries(h))
          headers[k.toLowerCase()] = String(v);
      }
    }
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    requests.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers,
      body,
    });

    const spec = responses[Math.min(i, responses.length - 1)];
    i++;
    const status = spec?.status ?? 200;
    const respHeaders = new Headers(spec?.headers ?? {});
    let payload: string;
    if (spec?.text !== undefined) {
      payload = spec.text;
      if (!respHeaders.has("content-type"))
        respHeaders.set("content-type", "text/event-stream");
    } else {
      payload = JSON.stringify(spec?.json ?? {});
      if (!respHeaders.has("content-type"))
        respHeaders.set("content-type", "application/json");
    }
    return new Response(payload, { status, headers: respHeaders });
  }) as typeof fetch;

  return { fetch: fetchImpl, requests, callCount: () => i };
}

/** Build an Anthropic-named-event SSE body from `{ event, data }` records. */
export function sseBody(
  events: Array<{ event: string; data: unknown }>,
  opts: { done?: boolean } = {},
): string {
  let out = "";
  for (const e of events) {
    out += `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
  }
  if (opts.done) out += "data: [DONE]\n\n";
  return out;
}

/** Build a legacy session-prompt SSE body (`data:`-only + `[DONE]`). */
export function sessionSseBody(events: unknown[]): string {
  let out = "";
  for (const e of events) out += `data: ${JSON.stringify(e)}\n\n`;
  out += "data: [DONE]\n\n";
  return out;
}
