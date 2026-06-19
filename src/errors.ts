/**
 * Typed error hierarchy mirroring the official Anthropic SDK.
 *
 * `APIError` is the base for every error returned by the API. Transport-level
 * failures surface as `APIConnectionError` / `APITimeoutError`. The
 * `APIError.from()` factory maps an HTTP status + parsed body to the correct
 * subclass and parses BOTH supported error envelopes:
 *
 *   1. Anthropic envelope (Messages / Models surfaces):
 *      `{"type":"error","error":{"type":"...","message":"..."},"request_id":"req_..."}`
 *   2. Legacy/dashboard envelope (sessions / memories / plugins / pm / usage):
 *      `{"error":{"code":"...","message":"..."}}`
 */

export interface SimseErrorShape {
  /** The machine-readable error discriminator (e.g. `invalid_request_error`). */
  type: string | null;
  /** A human-readable message. */
  message: string;
  /** The unique request id, when present (`req_...`). */
  requestId: string | null;
}

/** Base class for every error originating from the Simse API. */
export class SimseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore prototype chain for transpiled-to-ES5 consumers.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Base class for errors carrying an HTTP status from the API. */
export class APIError extends SimseError {
  /** HTTP status code, or `undefined` for connection failures. */
  readonly status: number | undefined;
  /** The machine-readable error type/code (`error.type` or `error.code`). */
  readonly type: string | null;
  /** The `request-id` (`req_...`), from the body or the response header. */
  readonly requestId: string | null;
  /** The raw parsed error body, if any. */
  readonly error: unknown;
  /** The response headers (lowercased keys), if available. */
  readonly headers: Record<string, string> | undefined;

  constructor(
    status: number | undefined,
    error: unknown,
    message: string | undefined,
    headers: Record<string, string> | undefined,
  ) {
    super(APIError.makeMessage(status, error, message));
    this.status = status;
    this.headers = headers;
    this.error = error;
    const parsed = APIError.parseEnvelope(error);
    this.type = parsed.type;
    this.requestId =
      parsed.requestId ?? (headers ? headers["request-id"] ?? null : null);
  }

  private static makeMessage(
    status: number | undefined,
    error: unknown,
    message: string | undefined,
  ): string {
    const parsed = APIError.parseEnvelope(error);
    const msg = parsed.message || message;
    if (msg && status) return `${status} ${msg}`;
    if (msg) return msg;
    if (status) return `${status} status code (no body)`;
    return message || "(no message)";
  }

  /**
   * Parse either supported error envelope. Prefers the Anthropic `error.type`,
   * falls back to the legacy `error.code`.
   */
  static parseEnvelope(body: unknown): SimseErrorShape {
    const empty: SimseErrorShape = {
      type: null,
      message: "",
      requestId: null,
    };
    if (!body || typeof body !== "object") return empty;
    const obj = body as Record<string, unknown>;
    const requestId =
      typeof obj["request_id"] === "string"
        ? (obj["request_id"] as string)
        : null;
    const err = obj["error"];
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      const type =
        typeof e["type"] === "string"
          ? (e["type"] as string)
          : typeof e["code"] === "string"
            ? (e["code"] as string)
            : null;
      const message =
        typeof e["message"] === "string" ? (e["message"] as string) : "";
      return { type, message, requestId };
    }
    // Bare `{message}` fallback.
    const message =
      typeof obj["message"] === "string" ? (obj["message"] as string) : "";
    return { type: null, message, requestId };
  }

  /**
   * Map an HTTP status + parsed body to the correct `APIError` subclass.
   */
  static from(
    status: number,
    body: unknown,
    message: string | undefined,
    headers: Record<string, string> | undefined,
  ): APIError {
    switch (status) {
      case 400:
        return new BadRequestError(status, body, message, headers);
      case 401:
        return new AuthenticationError(status, body, message, headers);
      case 403:
        return new PermissionDeniedError(status, body, message, headers);
      case 404:
        return new NotFoundError(status, body, message, headers);
      case 409:
        return new ConflictError(status, body, message, headers);
      case 413:
        return new RequestTooLargeError(status, body, message, headers);
      case 422:
        return new UnprocessableEntityError(status, body, message, headers);
      case 429:
        return new RateLimitError(status, body, message, headers);
      default:
        if (status >= 500) {
          if (status === 503) {
            return new OverloadedError(status, body, message, headers);
          }
          return new InternalServerError(status, body, message, headers);
        }
        return new APIError(status, body, message, headers);
    }
  }
}

/** 400 — malformed/invalid request (`invalid_request_error`). */
export class BadRequestError extends APIError {}
/** 401 — missing/invalid API key (`authentication_error`). */
export class AuthenticationError extends APIError {}
/** 403 — key lacks permission (`permission_error`). */
export class PermissionDeniedError extends APIError {}
/** 404 — resource not found (`not_found_error`). */
export class NotFoundError extends APIError {}
/** 409 — conflict (retryable). */
export class ConflictError extends APIError {}
/** 413 — body exceeds the size limit (`request_too_large`). */
export class RequestTooLargeError extends APIError {}
/** 422 — unprocessable entity. */
export class UnprocessableEntityError extends APIError {}
/** 429 — rate limit hit (`rate_limit_error`); see `retry-after`. */
export class RateLimitError extends APIError {}
/** 500 — internal error (`api_error`). */
export class InternalServerError extends APIError {}
/** 503 — backend unavailable/overloaded (`overloaded_error`, retryable). */
export class OverloadedError extends APIError {}

/** Transport-level failure — the request never reached/parsed from the API. */
export class APIConnectionError extends APIError {
  constructor({
    message,
    cause,
  }: {
    message?: string;
    cause?: unknown;
  } = {}) {
    super(undefined, undefined, message || "Connection error.", undefined);
    if (cause) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/** The request exceeded the configured timeout. */
export class APITimeoutError extends APIConnectionError {
  constructor(message = "Request timed out.") {
    super({ message });
  }
}

/** Raised when a user-supplied input fails client-side validation. */
export class SimseUserError extends SimseError {}
