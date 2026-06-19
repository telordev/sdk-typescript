import { describe, expect, it } from "vitest";
import { Simse, SimseUserError } from "../src/index.js";
import { DEFAULT_API_VERSION } from "../src/version.js";
import { mockFetch } from "./helpers.js";

describe("auth + headers", () => {
  it("sends BOTH x-api-key and Authorization: Bearer, plus anthropic-version", async () => {
    const { fetch, requests } = mockFetch([{ json: { plan: "free" } }]);
    const client = new Simse({ apiKey: "sk_test_123", fetch });

    await client.account.retrieve();

    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.headers["x-api-key"]).toBe("sk_test_123");
    expect(req.headers["authorization"]).toBe("Bearer sk_test_123");
    expect(req.headers["anthropic-version"]).toBe(DEFAULT_API_VERSION);
    expect(req.headers["user-agent"]).toMatch(/^simse-sdk-typescript\//);
  });

  it("defaults the base URL to https://api.simse.dev", async () => {
    const { fetch, requests } = mockFetch([{ json: {} }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.account.retrieve();
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/account");
  });

  it("honors an explicit base URL and trims trailing slashes", async () => {
    const { fetch, requests } = mockFetch([{ json: {} }]);
    const client = new Simse({
      apiKey: "sk_x",
      baseURL: "https://example.test/",
      fetch,
    });
    await client.account.retrieve();
    expect(requests[0]!.url).toBe("https://example.test/v1/account");
  });

  it("reads the API key from SIMSE_API_KEY, then ANTHROPIC_API_KEY", async () => {
    const { fetch, requests } = mockFetch([{ json: {} }]);
    process.env.SIMSE_API_KEY = "sk_from_env";
    try {
      const client = new Simse({ fetch });
      await client.account.retrieve();
      expect(requests[0]!.headers["x-api-key"]).toBe("sk_from_env");
    } finally {
      delete process.env.SIMSE_API_KEY;
    }
  });

  it("throws a SimseUserError when no API key is available", () => {
    const saved = { s: process.env.SIMSE_API_KEY, a: process.env.ANTHROPIC_API_KEY };
    delete process.env.SIMSE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new Simse({ fetch: globalThis.fetch })).toThrow(
        SimseUserError,
      );
    } finally {
      if (saved.s) process.env.SIMSE_API_KEY = saved.s;
      if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    }
  });

  it("allows overriding the api version + adds default headers", async () => {
    const { fetch, requests } = mockFetch([{ json: {} }]);
    const client = new Simse({
      apiKey: "sk_x",
      apiVersion: "2023-06-01",
      defaultHeaders: { "x-custom": "yes" },
      fetch,
    });
    await client.account.retrieve();
    expect(requests[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(requests[0]!.headers["x-custom"]).toBe("yes");
  });
});
