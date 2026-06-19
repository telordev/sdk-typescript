import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const modelList = {
  data: [
    {
      id: "zoysia",
      type: "model",
      display_name: "Zoysia (Qwen3.5 9B)",
      created_at: "2026-01-01T00:00:00Z",
      max_input_tokens: 131072,
      max_tokens: 8192,
    },
    {
      id: "rye",
      type: "model",
      display_name: "Rye (Qwen3.5 4B)",
      created_at: "2026-01-01T00:00:00Z",
      max_input_tokens: 131072,
      max_tokens: 8192,
    },
  ],
  has_more: false,
  first_id: "zoysia",
  last_id: "rye",
  // The gateway also returns legacy fields; SDK reads `data`.
  models: [],
  acp_providers: [],
};

describe("models.list", () => {
  it("parses the data array + cursor fields", async () => {
    const { fetch, requests } = mockFetch([{ json: modelList }]);
    const client = new Simse({ apiKey: "sk_x", fetch });

    const res = await client.models.list();

    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/models");
    expect(res.data).toHaveLength(2);
    expect(res.data[0]!.id).toBe("zoysia");
    expect(res.data[0]!.display_name).toBe("Zoysia (Qwen3.5 9B)");
    expect(res.data[0]!.max_input_tokens).toBe(131072);
    expect(res.has_more).toBe(false);
    expect(res.first_id).toBe("zoysia");
    expect(res.last_id).toBe("rye");
  });

  it("passes pagination params as query string", async () => {
    const { fetch, requests } = mockFetch([{ json: modelList }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.models.list({ limit: 5, after_id: "rye" });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("after_id")).toBe("rye");
  });
});

describe("models.retrieve", () => {
  it("fetches a single model by id", async () => {
    const { fetch, requests } = mockFetch([{ json: modelList.data[0] }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const model = await client.models.retrieve("zoysia");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/models/zoysia");
    expect(model.id).toBe("zoysia");
    expect(model.type).toBe("model");
  });
});
