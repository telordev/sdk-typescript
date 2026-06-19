import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import type { MessageStreamEvent } from "../src/types.js";
import { mockFetch, sseBody } from "./helpers.js";

/**
 * The exact Anthropic named-SSE-event sequence emitted by the gateway
 * (`warp/src/api_v1/anthropic.rs`): message_start → content_block_start → ping →
 * content_block_delta(text_delta)* → content_block_stop → message_delta →
 * message_stop.
 */
function textStreamBody(): string {
  return sseBody(
    [
      {
        event: "message_start",
        data: {
          type: "message_start",
          message: {
            id: "msg_stream_1",
            type: "message",
            role: "assistant",
            model: "zoysia",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 9, output_tokens: 0 },
          },
        },
      },
      {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
      },
      { event: "ping", data: { type: "ping" } },
      {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello" },
        },
      },
      {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: ", world" },
        },
      },
      {
        event: "content_block_stop",
        data: { type: "content_block_stop", index: 0 },
      },
      {
        event: "message_delta",
        data: {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 7 },
        },
      },
      { event: "message_stop", data: { type: "message_stop" } },
    ],
    { done: false },
  );
}

describe("messages.stream — SSE accumulation into a final Message", () => {
  it("accumulates text_delta into the final Message + text", async () => {
    const { fetch, requests } = mockFetch([
      {
        text: textStreamBody(),
        headers: { "request-id": "req_stream" },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });

    const stream = client.messages.stream({
      model: "zoysia",
      max_tokens: 64,
      messages: [{ role: "user", content: "hi" }],
    });

    const textChunks: string[] = [];
    stream.on("text", (delta) => textChunks.push(delta));

    const final = await stream.finalMessage();

    // The request body asked for streaming.
    expect(requests[0]!.body).toMatchObject({ stream: true });
    expect(requests[0]!.headers["accept"]).toBe("text/event-stream");

    expect(textChunks).toEqual(["Hello", ", world"]);
    expect(final.id).toBe("msg_stream_1");
    expect(final.content).toEqual([{ type: "text", text: "Hello, world" }]);
    expect(final.stop_reason).toBe("end_turn");
    expect(final.usage).toEqual({ input_tokens: 9, output_tokens: 7 });
    expect(final._request_id).toBe("req_stream");
  });

  it("is async-iterable over typed stream events", async () => {
    const { fetch } = mockFetch([{ text: textStreamBody() }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const stream = client.messages.stream({
      model: "zoysia",
      max_tokens: 64,
      messages: [{ role: "user", content: "hi" }],
    });

    const types: string[] = [];
    for await (const ev of stream as AsyncIterable<MessageStreamEvent>) {
      types.push(ev.type);
    }
    expect(types).toEqual([
      "message_start",
      "content_block_start",
      "ping",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
  });

  it("accumulates input_json_delta fragments into a tool_use input", async () => {
    const body = sseBody([
      {
        event: "message_start",
        data: {
          type: "message_start",
          message: {
            id: "msg_tool",
            type: "message",
            role: "assistant",
            model: "zoysia",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 5, output_tokens: 0 },
          },
        },
      },
      {
        event: "content_block_start",
        data: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_9",
            name: "get_weather",
            input: {},
          },
        },
      },
      {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"city":' },
        },
      },
      {
        event: "content_block_delta",
        data: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '"SF"}' },
        },
      },
      {
        event: "content_block_stop",
        data: { type: "content_block_stop", index: 0 },
      },
      {
        event: "message_delta",
        data: {
          type: "message_delta",
          delta: { stop_reason: "tool_use", stop_sequence: null },
          usage: { output_tokens: 11 },
        },
      },
      { event: "message_stop", data: { type: "message_stop" } },
    ]);

    const { fetch } = mockFetch([{ text: body }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const stream = client.messages.stream({
      model: "zoysia",
      max_tokens: 64,
      messages: [{ role: "user", content: "weather?" }],
    });

    const blocks: unknown[] = [];
    stream.on("contentBlock", (b) => blocks.push(b));

    const final = await stream.finalMessage();
    expect(final.stop_reason).toBe("tool_use");
    const tool = final.content[0];
    expect(tool && tool.type === "tool_use").toBe(true);
    if (tool && tool.type === "tool_use") {
      expect(tool.name).toBe("get_weather");
      expect(tool.input).toEqual({ city: "SF" });
    }
    expect(blocks).toHaveLength(1);
  });

  it("exposes a text-only async iterable via .textStream", async () => {
    const { fetch } = mockFetch([{ text: textStreamBody() }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const stream = client.messages.stream({
      model: "zoysia",
      max_tokens: 64,
      messages: [{ role: "user", content: "hi" }],
    });
    let acc = "";
    for await (const t of stream.textStream) acc += t;
    expect(acc).toBe("Hello, world");
  });

  it("rejects finalMessage when the stream emits a mid-stream error event", async () => {
    const body = sseBody([
      {
        event: "message_start",
        data: {
          type: "message_start",
          message: {
            id: "msg_err",
            type: "message",
            role: "assistant",
            model: "zoysia",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      },
      {
        event: "error",
        data: {
          type: "error",
          error: { type: "overloaded_error", message: "backend overloaded" },
        },
      },
    ]);
    const { fetch } = mockFetch([{ text: body }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const stream = client.messages.stream({
      model: "zoysia",
      max_tokens: 64,
      messages: [{ role: "user", content: "hi" }],
    });
    await expect(stream.finalMessage()).rejects.toThrow("backend overloaded");
  });
});
