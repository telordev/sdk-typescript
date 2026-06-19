import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("rate-limit + request-id header surfacing", () => {
  it("exposes request-id and anthropic-ratelimit-* on the response meta", async () => {
    const { fetch } = mockFetch([
      {
        json: { id: "pa_1", user_id: "user_1", plan: "free" },
        headers: {
          "request-id": "req_meta",
          "anthropic-ratelimit-requests-limit": "1000",
          "anthropic-ratelimit-requests-remaining": "999",
          "anthropic-ratelimit-requests-reset": "2026-06-19T12:00:00Z",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });

    // The low-level client returns { data, meta }.
    const { data, meta } = await client.get<{ plan: string }>("/v1/account");
    expect(data.plan).toBe("free");
    expect(meta.requestId).toBe("req_meta");
    expect(meta.rateLimit.requestsLimit).toBe(1000);
    expect(meta.rateLimit.requestsRemaining).toBe(999);
    expect(meta.rateLimit.requestsReset).toBe("2026-06-19T12:00:00Z");
  });
});
