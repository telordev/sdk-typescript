import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import type { Message } from "../src/types.js";
import { mockFetch } from "./helpers.js";

const sampleMessage: Message = {
  id: "msg_abc",
  type: "message",
  role: "assistant",
  model: "zoysia",
  content: [{ type: "text", text: "Hello there." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 34 },
};

describe("messages.create (non-streaming)", () => {
  it("round-trips a Message and posts the right body", async () => {
    const { fetch, requests } = mockFetch([
      { json: sampleMessage, headers: { "request-id": "req_xyz" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });

    const msg = await client.messages.create({
      model: "zoysia",
      max_tokens: 256,
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/messages");
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.body).toMatchObject({
      model: "zoysia",
      max_tokens: 256,
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(msg.id).toBe("msg_abc");
    expect(msg.content[0]).toEqual({ type: "text", text: "Hello there." });
    expect(msg.usage).toEqual({ input_tokens: 12, output_tokens: 34 });
    // request-id is surfaced onto the message.
    expect(msg._request_id).toBe("req_xyz");
  });

  it("parses a tool_use content block", async () => {
    const toolMsg: Message = {
      ...sampleMessage,
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Let me check." },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "get_weather",
          input: { city: "SF" },
        },
      ],
    };
    const { fetch } = mockFetch([{ json: toolMsg }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const msg = await client.messages.create({
      model: "zoysia",
      max_tokens: 256,
      messages: [{ role: "user", content: "weather?" }],
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });
    expect(msg.stop_reason).toBe("tool_use");
    const tool = msg.content.find((b) => b.type === "tool_use");
    expect(tool).toBeDefined();
    expect(tool && tool.type === "tool_use" && tool.input).toEqual({
      city: "SF",
    });
  });
});

describe("messages.countTokens", () => {
  it("returns the input token estimate", async () => {
    const { fetch, requests } = mockFetch([{ json: { input_tokens: 42 } }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const res = await client.messages.countTokens({
      model: "zoysia",
      messages: [{ role: "user", content: "count me" }],
    });
    expect(res.input_tokens).toBe(42);
    expect(requests[0]!.url).toBe(
      "https://api.simse.dev/v1/messages/count_tokens",
    );
  });
});
