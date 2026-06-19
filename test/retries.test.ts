import { describe, expect, it, vi } from "vitest";
import { Simse } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("retries + retry-after handling", () => {
  it("retries a 429 honoring retry-after, then succeeds", async () => {
    const { fetch, callCount } = mockFetch([
      {
        status: 429,
        json: {
          type: "error",
          error: { type: "rate_limit_error", message: "slow down" },
        },
        headers: { "retry-after": "0" },
      },
      { json: { id: "pa_1", user_id: "user_1", plan: "free" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 2 });

    const acct = await client.account.retrieve();
    expect(acct.plan).toBe("free");
    // One retry → two fetch calls.
    expect(callCount()).toBe(2);
  });

  it("honors a numeric retry-after by sleeping (real timers spied)", async () => {
    const { fetch } = mockFetch([
      {
        status: 503,
        json: {
          type: "error",
          error: { type: "overloaded_error", message: "overloaded" },
        },
        headers: { "retry-after": "2" },
      },
      { json: { plan: "pro" } },
    ]);
    // Spy on setTimeout to confirm the retry delay derives from retry-after (2s).
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 1 });

    await client.account.retrieve();

    // Among the setTimeout calls, one should be the ~2000ms backoff (the others
    // are the per-request abort timers).
    const delays = setSpy.mock.calls.map((c) => Number(c[1]));
    expect(delays.some((d) => d === 2000)).toBe(true);
    setSpy.mockRestore();
  });

  it("retries on 500 up to maxRetries, then throws", async () => {
    const { fetch, callCount } = mockFetch([
      {
        status: 500,
        json: {
          type: "error",
          error: { type: "api_error", message: "boom" },
        },
        // A zero retry-after keeps the test fast (no real backoff sleep).
        headers: { "retry-after": "0" },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 2 });
    await expect(client.account.retrieve()).rejects.toThrow();
    // initial + 2 retries = 3 calls.
    expect(callCount()).toBe(3);
  });

  it("does NOT retry a non-retryable 400", async () => {
    const { fetch, callCount } = mockFetch([
      {
        status: 400,
        json: {
          type: "error",
          error: { type: "invalid_request_error", message: "bad" },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 5 });
    await expect(client.account.retrieve()).rejects.toThrow();
    expect(callCount()).toBe(1);
  });
});
