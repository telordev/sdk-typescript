# @telordev/simse

The official **TypeScript SDK** for the [Simse](https://simse.dev) public API
(`api.simse.dev`).

The flagship `client.messages.create` / `.stream` / `.countTokens` surface is
**wire-compatible with the Anthropic Messages API**, and the SDK mirrors the
official Anthropic SDK ergonomics — typed content blocks and stream events,
a typed error hierarchy, automatic retries with backoff, and rate-limit header
surfacing. The full platform (models, account, usage, billing, sessions,
memories, plugins, project management, feature flags) is exposed under the same
client.

- ESM + CommonJS, ships `.d.ts` types.
- Uses the global `fetch` (Node 18+ / Bun) — no extra runtime dependencies.

## Install

```bash
npm install @telordev/simse
# or: bun add @telordev/simse / pnpm add @telordev/simse / yarn add @telordev/simse
```

## Quickstart

```ts
import { Simse } from "@telordev/simse";

// apiKey defaults to SIMSE_API_KEY, then ANTHROPIC_API_KEY, from the env.
const client = new Simse({ apiKey: process.env.SIMSE_API_KEY });

const message = await client.messages.create({
  model: "zoysia", // or "rye"
  max_tokens: 512,
  messages: [{ role: "user", content: "Hello, Simse!" }],
});

console.log(message.content); // [{ type: "text", text: "..." }]
console.log(message.usage); // { input_tokens, output_tokens }
```

### Configuration

```ts
const client = new Simse({
  apiKey: "sk_...", // default: SIMSE_API_KEY → ANTHROPIC_API_KEY
  baseURL: "https://api.simse.dev", // default; override via SIMSE_BASE_URL
  timeout: 600_000, // ms
  maxRetries: 2, // retried on 408/409/429/>=500, honoring retry-after
  apiVersion: "2026-06-01", // the anthropic-version header
  defaultHeaders: { "x-trace": "abc" },
});
```

Every request sends **both** `x-api-key: <key>` and
`Authorization: Bearer <key>`, plus `anthropic-version`.

## Streaming

`messages.stream(...)` returns a `MessageStream` that is async-iterable over
typed events, emits `.on("text" | "message" | "contentBlock" | ...)`, exposes a
text-only `.textStream`, and accumulates a final `Message`:

```ts
const stream = client.messages.stream({
  model: "zoysia",
  max_tokens: 512,
  messages: [{ role: "user", content: "Write a haiku about gateways." }],
});

// Event style:
stream.on("text", (delta) => process.stdout.write(delta));

// …or iterate the text:
for await (const chunk of stream.textStream) process.stdout.write(chunk);

// …or iterate the typed events:
for await (const event of stream) {
  if (event.type === "content_block_delta") {
    /* event.delta is a TextDelta | InputJSONDelta */
  }
}

// Always available: the fully-accumulated Message.
const final = await stream.finalMessage();
console.log(final.usage, final.stop_reason);
```

`create` with `stream: true` returns the same `MessageStream`:

```ts
const stream = client.messages.create({ model: "zoysia", max_tokens: 256, stream: true, messages });
```

## Tool use

```ts
import type { MessageParam, Tool } from "@telordev/simse";

const tools: Tool[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
];

const messages: MessageParam[] = [
  { role: "user", content: "What's the weather in San Francisco?" },
];

const first = await client.messages.create({
  model: "zoysia",
  max_tokens: 512,
  tools,
  messages,
});

const toolUse = first.content.find((b) => b.type === "tool_use");
if (toolUse?.type === "tool_use") {
  const result = `It is 18°C and sunny in ${(toolUse.input as { city: string }).city}.`;
  messages.push({ role: "assistant", content: first.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result }],
  });

  const second = await client.messages.create({ model: "zoysia", max_tokens: 512, tools, messages });
  console.log(second.content);
}
```

## Counting tokens

```ts
const { input_tokens } = await client.messages.countTokens({
  model: "zoysia",
  messages: [{ role: "user", content: "How many tokens is this?" }],
});
```

## Models

```ts
const { data } = await client.models.list(); // Model[]
for (const m of data) console.log(m.id, m.display_name, m.max_input_tokens);

const zoysia = await client.models.retrieve("zoysia");
```

## Agents (subagent run history)

```ts
const { agents } = await client.agents.list(); // newest first
for (const a of agents) console.log(a.id, a.status, a.description);
```

## Sessions (the agentic loop)

A session is a persisted, model-driven conversation where the agent reaches
tools via the orchestrator — distinct from the stateless Messages API.

```ts
const session = await client.sessions.create({ title: "My session" });

// Buffered:
const result = await client.sessions.prompt(session.id, { content: "List my files." });
console.log(result.message.content, result.usage);

// Streaming:
const stream = client.sessions.stream(session.id, { content: "Now summarize them." });
stream.on("text", (d) => process.stdout.write(d));
stream.on("toolCall", (e) => console.log("[tool]", e));
const final = await stream.finalResult(); // { text, status, usage }

await client.sessions.resume(session.id); // reconstruct history
await client.sessions.abort(session.id); // cancel an in-flight prompt
await client.sessions.delete(session.id);
```

## Account, usage, billing

```ts
const account = await client.account.retrieve(); // { id, user_id, plan }
const usage = await client.usage.retrieve(); // { period, requests, tokens, by_model }
const billing = await client.billing.retrieve(); // { plan, status, limits, current_usage }

// The rich UsagePanel view (per-model split, billing block, compute window).
// Wire keys are camelCase, surfaced verbatim:
const dash = await client.usage.dashboard();
console.log(dash.plan, dash.models, dash.billing, dash.compute?.session?.current);
```

## Memories, plugins, flags

```ts
// Memories (user-scoped):
await client.memories.create({ text: "Remember: the launch is Friday." });
const { memories } = await client.memories.list({ query: "launch" });
const stats = await client.memories.stats();

// Plugins / marketplace:
const { plugins } = await client.plugins.registry();
await client.plugins.install({ plugin_name: "github" });
const installed = await client.plugins.installed();

// Feature flags:
const { flags } = await client.flags.get();
```

## Project management

Session-scoped kanban (tasks/projects/todos) and user-scoped schedules +
workflows:

```ts
// Tasks (session-scoped):
const board = await client.pm.tasks.list(session.id);
const { taskId } = await client.pm.tasks.create(session.id, { title: "Ship the SDK" });
await client.pm.tasks.move(session.id, taskId, { status: "in_progress" });
await client.pm.tasks.setChecklist(session.id, taskId, [{ text: "write README", done: true }]);
await client.pm.tasks.addDependency(session.id, taskId, "other-task-id");

// Projects:
await client.pm.projects.create(session.id, { name: "Q3" });

// Read-only todos:
const { todos } = await client.pm.todos.list(session.id);

// Schedules (cron, user-scoped):
await client.pm.schedules.create({ name: "nightly", cronExpr: "0 0 * * *", actionKind: "run_workflow" });

// Workflows (user-scoped):
const { workflowId } = await client.pm.workflows.create({ name: "deploy", source });
await client.pm.workflows.lint(source);
const { runId } = await client.pm.workflows.run(workflowId, { input: {} });
const log = await client.pm.workflows.getRun(runId);
await client.pm.workflows.cancelRun(runId);
```

## Errors

Every error extends `APIError` with `.status`, `.type`, and `.requestId`. The
SDK parses both the Anthropic error envelope
(`{type,error:{type,message},request_id}`) and the legacy dashboard envelope
(`{error:{code,message}}`).

```ts
import {
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
  NotFoundError,
  OverloadedError,
} from "@telordev/simse";

try {
  await client.messages.create({ model: "zoysia", max_tokens: 256, messages });
} catch (err) {
  if (err instanceof RateLimitError) {
    // retried automatically up to maxRetries; honors retry-after
  } else if (err instanceof AuthenticationError) {
    console.error("Bad API key");
  } else if (err instanceof APIError) {
    console.error(err.status, err.type, err.message, err.requestId);
  }
}
```

| HTTP | Class                    | `error.type`            |
| ---- | ------------------------ | ----------------------- |
| 400  | `BadRequestError`        | `invalid_request_error` |
| 401  | `AuthenticationError`    | `authentication_error`  |
| 403  | `PermissionDeniedError`  | `permission_error`      |
| 404  | `NotFoundError`          | `not_found_error`       |
| 413  | `RequestTooLargeError`   | `request_too_large`     |
| 429  | `RateLimitError`         | `rate_limit_error`      |
| 500  | `InternalServerError`    | `api_error`             |
| 503  | `OverloadedError`        | `overloaded_error`      |

Transport failures surface as `APIConnectionError` / `APITimeoutError`.

## Request IDs & rate limits

Non-streaming `Message`s carry `_request_id`. Streams expose `stream.requestId`.
The `anthropic-ratelimit-*` headers are surfaced on the response metadata when
using the low-level client (`client.request(...)` returns `{ data, meta }` with
`meta.requestId` and `meta.rateLimit`).

## Examples

See [`examples/`](./examples): `basic-message.ts`, `streaming.ts`,
`tool-use.ts`, `list-models.ts`, `sessions.ts`.

```bash
SIMSE_API_KEY=sk_... npx tsx examples/streaming.ts
```

## License

[MIT](./LICENSE)
