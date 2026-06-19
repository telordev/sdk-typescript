import { describe, expect, it } from "vitest";
import { iterSSE } from "../src/streaming.js";

function bodyFrom(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

/** A body delivered in awkward chunk boundaries (mid-line splits). */
function chunkedBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i]!));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

describe("iterSSE", () => {
  it("parses named events with data", async () => {
    const out: Array<{ event: string | null; data: string }> = [];
    for await (const c of iterSSE(
      bodyFrom("event: ping\ndata: {}\n\nevent: stop\ndata: 1\n\n"),
    )) {
      out.push(c);
    }
    expect(out).toEqual([
      { event: "ping", data: "{}" },
      { event: "stop", data: "1" },
    ]);
  });

  it("parses data-only framing (legacy session prompt)", async () => {
    const out: string[] = [];
    for await (const c of iterSSE(
      bodyFrom('data: {"type":"delta"}\n\ndata: [DONE]\n\n'),
    )) {
      out.push(c.data);
    }
    expect(out).toEqual(['{"type":"delta"}', "[DONE]"]);
  });

  it("reassembles events split across chunk boundaries", async () => {
    const out: string[] = [];
    for await (const c of iterSSE(
      chunkedBody(["event: m", "sg\nda", "ta: hel", "lo\n\n"]),
    )) {
      out.push(`${c.event}:${c.data}`);
    }
    expect(out).toEqual(["msg:hello"]);
  });

  it("handles multi-line data fields", async () => {
    const out: string[] = [];
    for await (const c of iterSSE(bodyFrom("data: a\ndata: b\n\n"))) {
      out.push(c.data);
    }
    expect(out).toEqual(["a\nb"]);
  });

  it("ignores comment lines and CRLF", async () => {
    const out: string[] = [];
    for await (const c of iterSSE(
      bodyFrom(": keepalive\r\nevent: x\r\ndata: y\r\n\r\n"),
    )) {
      out.push(`${c.event}:${c.data}`);
    }
    expect(out).toEqual(["x:y"]);
  });
});
