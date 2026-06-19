/**
 * `MessageStream` — the accumulating streaming helper, mirroring the Anthropic
 * SDK. It is async-iterable over typed `MessageStreamEvent`s, exposes
 * `.on("text" | "message" | "contentBlock" | "error" | "end", cb)`, a
 * `.textStream` async-iterable of text deltas, and `await stream.finalMessage()`
 * which resolves to the accumulated `Message`.
 *
 * The constructor accepts a `Promise<Response>` so the caller can attach
 * `.on(...)` listeners synchronously, before the HTTP body starts flowing.
 *
 * Accumulation rules (per the contract's SSE sequence):
 *   - `message_start` seeds the message skeleton (id/model/usage.input_tokens).
 *   - `content_block_start` appends a block; `text_delta` concatenates onto a
 *     `text` block, `input_json_delta.partial_json` fragments concatenate into a
 *     `tool_use` block's input JSON (parsed at `content_block_stop`).
 *   - `message_delta` sets `stop_reason`/`stop_sequence` + `usage.output_tokens`.
 */

import { APIError, SimseError } from "./errors.js";
import { iterSSE } from "./streaming.js";
import type {
  ContentBlock,
  Message,
  MessageStreamEvent,
  TextBlock,
  ToolUseBlock,
} from "./types.js";

// The implementation listener signature must be the most general so the typed
// `.on(...)` overloads above are all assignable to it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

interface MutableToolUse extends ToolUseBlock {
  /** Accumulated partial JSON fragments before parsing at block-stop. */
  _partialJSON?: string;
}

type MutableBlock = TextBlock | MutableToolUse;

export class MessageStream implements AsyncIterable<MessageStreamEvent> {
  private readonly responsePromise: Promise<Response>;
  private response: Response | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private message: Message | null = null;
  private blocks: MutableBlock[] = [];
  private finalPromise: Promise<Message>;
  private resolveFinal!: (m: Message) => void;
  private rejectFinal!: (e: unknown) => void;
  private settled = false;
  private started = false;
  private errored: unknown = null;

  constructor(responsePromise: Promise<Response>) {
    this.responsePromise = responsePromise;
    this.finalPromise = new Promise<Message>((resolve, reject) => {
      this.resolveFinal = resolve;
      this.rejectFinal = reject;
    });
    // Surface the unhandled rejection only when nobody is awaiting; we attach a
    // no-op catch so an un-awaited stream that errors does not crash the process.
    this.finalPromise.catch(() => undefined);
  }

  /** Subscribe to a stream event. Returns `this` for chaining. */
  on(event: "text", cb: (delta: string, snapshot: string) => void): this;
  on(event: "message", cb: (message: Message) => void): this;
  on(event: "contentBlock", cb: (block: ContentBlock) => void): this;
  on(event: "streamEvent", cb: (event: MessageStreamEvent) => void): this;
  on(event: "error", cb: (error: unknown) => void): this;
  on(event: "end", cb: () => void): this;
  on(event: string, cb: Listener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return this;
  }

  off(event: string, cb: Listener): this {
    this.listeners.get(event)?.delete(cb);
    return this;
  }

  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(...args);
  }

  /** Resolves with the fully-accumulated `Message`. */
  finalMessage(): Promise<Message> {
    void this.consume();
    return this.finalPromise;
  }

  /** Resolves with the concatenated text of the final message. */
  async finalText(): Promise<string> {
    const m = await this.finalMessage();
    return m.content
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  /** Abort the underlying HTTP stream. */
  abort(): void {
    void this.response?.body?.cancel().catch(() => undefined);
  }

  /** Async-iterable of text deltas only. */
  get textStream(): AsyncIterable<string> {
    const queue: string[] = [];
    let done = false;
    let err: unknown = null;
    let resume: (() => void) | null = null;
    const wake = () => {
      const r = resume;
      resume = null;
      r?.();
    };
    this.on("text", (delta) => {
      queue.push(delta as string);
      wake();
    });
    this.on("end", () => {
      done = true;
      wake();
    });
    this.on("error", (e) => {
      err = e;
      done = true;
      wake();
    });
    void this.consume();

    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (queue.length) yield queue.shift() as string;
          if (done) {
            if (err) throw err;
            return;
          }
          await new Promise<void>((r) => {
            resume = r;
          });
        }
      },
    };
  }

  [Symbol.asyncIterator](): AsyncIterator<MessageStreamEvent> {
    return this.iterate();
  }

  private async *iterate(): AsyncGenerator<MessageStreamEvent> {
    if (this.started) {
      throw new SimseError("This stream has already been consumed.");
    }
    this.started = true;

    let body: ReadableStream<Uint8Array> | null;
    try {
      this.response = await this.responsePromise;
      body = this.response.body;
    } catch (e) {
      this.fail(e);
      throw e;
    }

    if (!body) {
      const e = new APIError(
        this.response.status,
        undefined,
        "Streaming response had no body.",
        undefined,
      );
      this.fail(e);
      throw e;
    }

    try {
      for await (const chunk of iterSSE(body)) {
        if (chunk.data === "[DONE]") break;
        if (!chunk.data) continue;
        let event: MessageStreamEvent;
        try {
          event = JSON.parse(chunk.data) as MessageStreamEvent;
        } catch {
          continue;
        }
        this.handle(event);
        this.emit("streamEvent", event);
        if (event.type === "error") {
          const err = new APIError(
            undefined,
            event,
            event.error?.message ?? "stream error",
            undefined,
          );
          this.fail(err);
          throw err;
        }
        yield event;
      }
      this.complete();
    } catch (e) {
      if (!this.settled) this.fail(e);
      throw e;
    }
  }

  /** Drive the stream to completion without exposing the iterator. */
  private async consume(): Promise<void> {
    if (this.settled) return;
    if (this.started) {
      await this.finalPromise.catch(() => undefined);
      return;
    }
    try {
      for await (const _ of this.iterate()) {
        // drain
      }
    } catch {
      // failure already routed to finalPromise via fail()
    }
  }

  private handle(event: MessageStreamEvent): void {
    switch (event.type) {
      case "message_start": {
        this.message = { ...event.message, content: [] };
        this.blocks = [];
        this.emit("message", this.message);
        break;
      }
      case "content_block_start": {
        const block = { ...event.content_block } as MutableBlock;
        if (block.type === "tool_use") {
          (block as MutableToolUse)._partialJSON = "";
          block.input = block.input ?? {};
        }
        this.blocks[event.index] = block;
        break;
      }
      case "content_block_delta": {
        const block = this.blocks[event.index];
        if (!block) break;
        if (event.delta.type === "text_delta" && block.type === "text") {
          const snapshot = (block.text += event.delta.text);
          this.emit("text", event.delta.text, snapshot);
        } else if (
          event.delta.type === "input_json_delta" &&
          block.type === "tool_use"
        ) {
          (block as MutableToolUse)._partialJSON =
            ((block as MutableToolUse)._partialJSON ?? "") +
            event.delta.partial_json;
        }
        break;
      }
      case "content_block_stop": {
        const block = this.blocks[event.index];
        if (block && block.type === "tool_use") {
          const raw = (block as MutableToolUse)._partialJSON ?? "";
          if (raw) {
            try {
              block.input = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              // leave the partial input as-is
            }
          }
          delete (block as MutableToolUse)._partialJSON;
        }
        if (block) this.emit("contentBlock", this.cleanBlock(block));
        break;
      }
      case "message_delta": {
        if (this.message) {
          this.message.stop_reason = event.delta.stop_reason;
          this.message.stop_sequence = event.delta.stop_sequence;
          this.message.usage.output_tokens = event.usage.output_tokens;
        }
        break;
      }
      case "message_stop":
      case "ping":
      case "error":
        break;
    }
  }

  private cleanBlock(block: MutableBlock): ContentBlock {
    if (block.type === "tool_use") {
      const { _partialJSON, ...rest } = block as MutableToolUse;
      void _partialJSON;
      return rest;
    }
    return block;
  }

  private finalize(): Message {
    const msg = this.message ?? {
      id: "",
      type: "message" as const,
      role: "assistant" as const,
      model: "",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
    msg.content = this.blocks
      .filter((b): b is MutableBlock => b !== undefined)
      .map((b) => this.cleanBlock(b));
    msg._request_id = this.requestId;
    return msg;
  }

  private complete(): void {
    if (this.settled) return;
    this.settled = true;
    const msg = this.finalize();
    this.emit("end");
    this.resolveFinal(msg);
  }

  private fail(err: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.errored = err;
    this.emit("error", err);
    this.rejectFinal(err);
  }

  /** The `request-id` header of the streaming response, if any. */
  get requestId(): string | null {
    return this.response?.headers.get("request-id") ?? null;
  }

  get failed(): unknown {
    return this.errored;
  }
}
