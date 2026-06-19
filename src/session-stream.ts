/**
 * `SessionStream` — the streaming helper for the agentic session-prompt path
 * (`POST /v1/sessions/{id}/messages` with `stream:true`).
 *
 * The session prompt uses the legacy SSE framing (`data: {json}` lines, terminal
 * `data: [DONE]`) carrying `delta` / `tool_call` / `tool_result` / `done` /
 * `error` events. This helper is async-iterable over those typed events, exposes
 * `.on(...)`, a `.textStream`, and `await stream.finalResult()` resolving to the
 * accumulated text + usage.
 */

import { APIError, SimseError } from "./errors.js";
import { iterSSE } from "./streaming.js";
import type {
  PromptUsage,
  SessionStreamEvent,
} from "./types.js";

export interface SessionFinalResult {
  text: string;
  status: string;
  usage: PromptUsage;
}

// The implementation listener signature must be the most general so the typed
// `.on(...)` overloads above are all assignable to it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

export class SessionStream implements AsyncIterable<SessionStreamEvent> {
  private readonly responsePromise: Promise<Response>;
  private response: Response | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private text = "";
  private usage: PromptUsage = {
    input_tokens: 0,
    output_tokens: 0,
  };
  private status = "complete";
  private settled = false;
  private started = false;
  private finalPromise: Promise<SessionFinalResult>;
  private resolveFinal!: (r: SessionFinalResult) => void;
  private rejectFinal!: (e: unknown) => void;

  constructor(responsePromise: Promise<Response>) {
    this.responsePromise = responsePromise;
    this.finalPromise = new Promise<SessionFinalResult>((resolve, reject) => {
      this.resolveFinal = resolve;
      this.rejectFinal = reject;
    });
    this.finalPromise.catch(() => undefined);
  }

  on(event: "text", cb: (delta: string, snapshot: string) => void): this;
  on(event: "toolCall", cb: (e: SessionStreamEvent) => void): this;
  on(event: "toolResult", cb: (e: SessionStreamEvent) => void): this;
  on(event: "done", cb: (r: SessionFinalResult) => void): this;
  on(event: "error", cb: (e: unknown) => void): this;
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

  private emit(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }

  finalResult(): Promise<SessionFinalResult> {
    void this.consume();
    return this.finalPromise;
  }

  async finalText(): Promise<string> {
    return (await this.finalResult()).text;
  }

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
    this.on("text", (d) => {
      queue.push(d as string);
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

  [Symbol.asyncIterator](): AsyncIterator<SessionStreamEvent> {
    return this.iterate();
  }

  private async *iterate(): AsyncGenerator<SessionStreamEvent> {
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
        let event: SessionStreamEvent;
        try {
          event = JSON.parse(chunk.data) as SessionStreamEvent;
        } catch {
          continue;
        }
        this.handle(event);
        if (event.type === "error") {
          const err = new APIError(
            undefined,
            { error: { message: event.message } },
            event.message,
            undefined,
          );
          this.fail(err);
          throw err;
        }
        yield event;
        if (event.type === "done") break;
      }
      this.complete();
    } catch (e) {
      if (!this.settled) this.fail(e);
      throw e;
    }
  }

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
      // already routed to finalPromise
    }
  }

  private handle(event: SessionStreamEvent): void {
    switch (event.type) {
      case "delta": {
        this.text += event.delta;
        this.emit("text", event.delta, this.text);
        break;
      }
      case "tool_call":
        this.emit("toolCall", event);
        break;
      case "tool_result":
        this.emit("toolResult", event);
        break;
      case "done": {
        this.status = event.status;
        this.usage = event.usage;
        // The done frame carries the authoritative final text; prefer it.
        if (event.text) this.text = event.text;
        break;
      }
      case "error":
        break;
    }
  }

  private result(): SessionFinalResult {
    return { text: this.text, status: this.status, usage: this.usage };
  }

  private complete(): void {
    if (this.settled) return;
    this.settled = true;
    const r = this.result();
    this.emit("done", r);
    this.emit("end");
    this.resolveFinal(r);
  }

  private fail(err: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.emit("error", err);
    this.rejectFinal(err);
  }

  get requestId(): string | null {
    return this.response?.headers.get("request-id") ?? null;
  }
}
