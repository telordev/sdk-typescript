/**
 * The low-level HTTP transport: auth headers, retries with backoff, error
 * mapping, and rate-limit header surfacing. Built on the global `fetch`.
 */

import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  SimseUserError,
} from "./errors.js";
import {
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  VERSION,
} from "./version.js";

export interface RateLimit {
  requestsLimit: number | null;
  requestsRemaining: number | null;
  requestsReset: string | null;
}

export interface ResponseMeta {
  requestId: string | null;
  rateLimit: RateLimit;
  headers: Record<string, string>;
}

export interface ClientOptions {
  /**
   * The platform API key. Defaults to `SIMSE_API_KEY`, then `ANTHROPIC_API_KEY`
   * from the environment.
   */
  apiKey?: string;
  /** Base URL. Defaults to `SIMSE_BASE_URL` env, then `https://api.simse.dev`. */
  baseURL?: string;
  /** Per-request timeout in milliseconds. Default 600_000 (10 min). */
  timeout?: number;
  /** Max automatic retries on retryable failures. Default 2. */
  maxRetries?: number;
  /** Extra headers merged onto every request. */
  defaultHeaders?: Record<string, string>;
  /** Override the API version header. Default `2026-06-01`. */
  apiVersion?: string;
  /** Inject a custom `fetch` (e.g. for testing). Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Override `maxRetries` for this call. */
  maxRetries?: number;
  /** Per-call timeout override (ms). */
  timeout?: number;
  /** Caller-supplied AbortSignal. */
  signal?: AbortSignal;
  /** When set, the raw `Response` is returned (for SSE bodies). */
  stream?: boolean;
}

function envGet(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[name];
  }
  return undefined;
}

/** Methods/statuses we retry, mirroring the contract. */
function shouldRetry(status: number | undefined): boolean {
  if (status === undefined) return true; // connection error
  if (status === 408 || status === 409 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

export class BaseClient {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly apiVersion: string;
  protected readonly defaultHeaders: Record<string, string>;
  protected readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    const apiKey =
      options.apiKey ??
      envGet("SIMSE_API_KEY") ??
      envGet("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new SimseUserError(
        "Missing API key. Pass `apiKey` to the client, or set the SIMSE_API_KEY (or ANTHROPIC_API_KEY) environment variable.",
      );
    }
    this.apiKey = apiKey;
    this.baseURL = (
      options.baseURL ??
      envGet("SIMSE_BASE_URL") ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 600_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.defaultHeaders = options.defaultHeaders ?? {};
    const f = options.fetch ?? globalThis.fetch;
    if (!f) {
      throw new SimseUserError(
        "No global `fetch` found. Use Node 18+/Bun, or pass a `fetch` implementation in the client options.",
      );
    }
    this.fetchImpl = f.bind(globalThis);
  }

  /** Auth + version + content headers sent on every request. */
  protected authHeaders(): Record<string, string> {
    return {
      // Send BOTH styles per the contract.
      "x-api-key": this.apiKey,
      authorization: `Bearer ${this.apiKey}`,
      "anthropic-version": this.apiVersion,
      "user-agent": `simse-sdk-typescript/${VERSION}`,
    };
  }

  protected buildURL(
    path: string,
    query?: RequestOptions["query"],
  ): string {
    const url = new URL(this.baseURL + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private static parseMeta(res: Response): ResponseMeta {
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const num = (k: string): number | null => {
      const v = headers[k];
      if (v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      requestId: headers["request-id"] ?? null,
      rateLimit: {
        requestsLimit: num("anthropic-ratelimit-requests-limit"),
        requestsRemaining: num("anthropic-ratelimit-requests-remaining"),
        requestsReset: headers["anthropic-ratelimit-requests-reset"] ?? null,
      },
      headers,
    };
  }

  /**
   * Execute a request with retries. Returns the raw `Response` when
   * `opts.stream` is set; otherwise the parsed JSON + meta.
   */
  async requestRaw(opts: RequestOptions): Promise<Response> {
    const maxRetries = opts.maxRetries ?? this.maxRetries;
    const url = this.buildURL(opts.path, opts.query);

    const headers: Record<string, string> = {
      ...this.authHeaders(),
      ...this.defaultHeaders,
      ...(opts.headers ?? {}),
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (opts.stream) {
      headers["accept"] = "text/event-stream";
    } else {
      headers["accept"] = headers["accept"] ?? "application/json";
    }

    let attempt = 0;
    let lastErr: unknown;
    for (;;) {
      const controller = new AbortController();
      const timeoutMs = opts.timeout ?? this.timeout;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // Chain a caller-supplied signal.
      if (opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else
          opts.signal.addEventListener("abort", () => controller.abort(), {
            once: true,
          });
      }

      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: opts.method.toUpperCase(),
          headers,
          body,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const aborted =
          (err as { name?: string })?.name === "AbortError" ||
          controller.signal.aborted;
        const timedOut = aborted && !opts.signal?.aborted;
        lastErr = timedOut
          ? new APITimeoutError()
          : new APIConnectionError({ cause: err });
        if (attempt < maxRetries && shouldRetry(undefined)) {
          await this.sleep(this.backoff(attempt));
          attempt++;
          continue;
        }
        throw lastErr;
      }
      clearTimeout(timer);

      if (res.ok) {
        return res;
      }

      // Error path: decide whether to retry.
      if (attempt < maxRetries && shouldRetry(res.status)) {
        const wait = this.retryDelay(res, attempt);
        // Drain the error body so the connection can be reused.
        await res.text().catch(() => undefined);
        await this.sleep(wait);
        attempt++;
        continue;
      }

      // Terminal error — parse + throw the typed subclass.
      throw await this.toError(res);
    }
  }

  /** Execute a JSON request and return `{ data, meta }`. */
  async request<T>(
    opts: RequestOptions,
  ): Promise<{ data: T; meta: ResponseMeta }> {
    const res = await this.requestRaw(opts);
    const meta = BaseClient.parseMeta(res);
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { data, meta };
  }

  /** GET → JSON. */
  get<T>(
    path: string,
    opts: Partial<RequestOptions> = {},
  ): Promise<{ data: T; meta: ResponseMeta }> {
    return this.request<T>({ ...opts, method: "get", path });
  }

  post<T>(
    path: string,
    body?: unknown,
    opts: Partial<RequestOptions> = {},
  ): Promise<{ data: T; meta: ResponseMeta }> {
    return this.request<T>({ ...opts, method: "post", path, body });
  }

  patch<T>(
    path: string,
    body?: unknown,
    opts: Partial<RequestOptions> = {},
  ): Promise<{ data: T; meta: ResponseMeta }> {
    return this.request<T>({ ...opts, method: "patch", path, body });
  }

  put<T>(
    path: string,
    body?: unknown,
    opts: Partial<RequestOptions> = {},
  ): Promise<{ data: T; meta: ResponseMeta }> {
    return this.request<T>({ ...opts, method: "put", path, body });
  }

  delete<T>(
    path: string,
    opts: Partial<RequestOptions> = {},
  ): Promise<{ data: T; meta: ResponseMeta }> {
    return this.request<T>({ ...opts, method: "delete", path });
  }

  /** Open a streaming request and hand back the raw `Response`. */
  async stream(
    opts: Omit<RequestOptions, "stream">,
  ): Promise<Response> {
    return this.requestRaw({ ...opts, stream: true });
  }

  static metaOf(res: Response): ResponseMeta {
    return BaseClient.parseMeta(res);
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private async toError(res: Response): Promise<APIError> {
    let parsed: unknown;
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: { message: text } };
      }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return APIError.from(res.status, parsed, res.statusText, headers);
  }

  /** Compute the retry delay, honoring `retry-after` (seconds or HTTP date). */
  private retryDelay(res: Response, attempt: number): number {
    const ra = res.headers.get("retry-after");
    if (ra) {
      const secs = Number(ra);
      if (Number.isFinite(secs)) return Math.min(secs * 1000, 60_000);
      const date = Date.parse(ra);
      if (!Number.isNaN(date)) {
        const delta = date - Date.now();
        if (delta > 0) return Math.min(delta, 60_000);
      }
    }
    const raMs = res.headers.get("retry-after-ms");
    if (raMs) {
      const ms = Number(raMs);
      if (Number.isFinite(ms)) return Math.min(ms, 60_000);
    }
    return this.backoff(attempt);
  }

  /** Exponential backoff with jitter. */
  private backoff(attempt: number): number {
    const base = Math.min(0.5 * 2 ** attempt, 8); // seconds, capped at 8s
    const jitter = base * 0.25 * Math.random();
    return (base + jitter) * 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
