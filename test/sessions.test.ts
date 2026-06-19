import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import { mockFetch, sessionSseBody } from "./helpers.js";

describe("sessions lifecycle", () => {
  it("creates a session", async () => {
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        json: {
          id: "sess_1",
          model: "zoysia",
          status: "active",
          created_at: "2026-06-19T00:00:00Z",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const sess = await client.sessions.create({ title: "My session" });
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.body).toMatchObject({ title: "My session" });
    expect(sess.id).toBe("sess_1");
    expect(sess.status).toBe("active");
  });

  it("lists, retrieves, and deletes sessions", async () => {
    const { fetch, requests } = mockFetch([
      { json: { sessions: [{ id: "s1", title: "t", status: "active" }] } },
      { json: { id: "s1", title: "t", status: "active" } },
      { json: { deleted: true, id: "s1" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const list = await client.sessions.list();
    expect(list.sessions[0]!.id).toBe("s1");
    const one = await client.sessions.retrieve("s1");
    expect(one.id).toBe("s1");
    const del = await client.sessions.delete("s1");
    expect(del.deleted).toBe(true);
    expect(requests[2]!.method).toBe("DELETE");
  });

  it("prompts (buffered) and returns assistant content + usage", async () => {
    const { fetch, requests } = mockFetch([
      {
        json: {
          message: { role: "assistant", content: "the answer is 42" },
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const res = await client.sessions.prompt("s1", { content: "question?" });
    expect(requests[0]!.url).toBe(
      "https://api.simse.dev/v1/sessions/s1/messages",
    );
    expect(requests[0]!.body).toMatchObject({
      content: "question?",
      stream: false,
    });
    expect(res.message.content).toBe("the answer is 42");
    expect(res.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("streams a session prompt and accumulates the final text + usage", async () => {
    const body = sessionSseBody([
      { type: "delta", delta: "Hel" },
      { type: "delta", delta: "lo" },
      { type: "tool_call", id: "tc1", name: "search", input: { q: "x" } },
      { type: "tool_result", id: "tc1", output: "ok", is_error: false },
      {
        type: "done",
        status: "complete",
        text: "Hello world",
        usage: {
          input_tokens: 12,
          output_tokens: 8,
        },
      },
    ]);
    const { fetch } = mockFetch([{ text: body }]);
    const client = new Simse({ apiKey: "sk_x", fetch });

    const stream = client.sessions.stream("s1", { content: "go" });
    const deltas: string[] = [];
    const toolCalls: unknown[] = [];
    stream.on("text", (d) => deltas.push(d));
    stream.on("toolCall", (e) => toolCalls.push(e));

    const result = await stream.finalResult();
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(toolCalls).toHaveLength(1);
    // The `done` frame's authoritative text wins.
    expect(result.text).toBe("Hello world");
    expect(result.status).toBe("complete");
    expect(result.usage).toEqual({ input_tokens: 12, output_tokens: 8 });
  });

  it("resume + abort", async () => {
    const { fetch, requests } = mockFetch([
      { json: { messages: [], tool_calls: [] } },
      { json: { aborted: true, id: "s1" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const resumed = await client.sessions.resume("s1");
    expect(resumed.messages).toEqual([]);
    const aborted = await client.sessions.abort("s1");
    expect(aborted.aborted).toBe(true);
    expect(requests[0]!.url).toBe(
      "https://api.simse.dev/v1/sessions/s1/resume",
    );
    expect(requests[1]!.url).toBe("https://api.simse.dev/v1/sessions/s1/abort");
  });
});
