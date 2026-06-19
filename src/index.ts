/**
 * `@telordev/simse` — the official TypeScript SDK for the Simse public API.
 *
 * The flagship `client.messages.create` / `.stream` / `.countTokens` surface is
 * Anthropic-Messages-wire-compatible; the rest of the platform (models, account,
 * usage, billing, sessions, memories, plugins, pm, flags) is exposed under the
 * same client.
 */

export { Simse } from "./simse.js";
export { Simse as default } from "./simse.js";

export { BaseClient } from "./client.js";
export type {
  ClientOptions,
  RequestOptions,
  ResponseMeta,
  RateLimit,
} from "./client.js";

export { MessageStream } from "./message-stream.js";
export { SessionStream } from "./session-stream.js";
export type { SessionFinalResult } from "./session-stream.js";
export { iterSSE } from "./streaming.js";
export type { SSEChunk } from "./streaming.js";

export {
  VERSION,
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
} from "./version.js";

// Errors
export {
  SimseError,
  SimseUserError,
  APIError,
  APIConnectionError,
  APITimeoutError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  RequestTooLargeError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  OverloadedError,
} from "./errors.js";
export type { SimseErrorShape } from "./errors.js";

// Resource classes (for advanced consumers / typing)
export { Messages } from "./resources/messages.js";
export type { MessageRequestOptions } from "./resources/messages.js";
export { Models } from "./resources/models.js";
export { Agents } from "./resources/agents.js";
export {
  AccountResource,
  UsageResource,
  BillingResource,
} from "./resources/account.js";
export { Sessions } from "./resources/sessions.js";
export { Memories } from "./resources/memories.js";
export { Plugins } from "./resources/plugins.js";
export { PM } from "./resources/pm.js";
export { Flags } from "./resources/flags.js";

// All wire types.
export type * from "./types.js";
