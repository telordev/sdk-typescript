import { describe, expect, it } from "vitest";
import {
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  OverloadedError,
  RateLimitError,
  RequestTooLargeError,
  Simse,
} from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("error mapping", () => {
  it("maps 401 → AuthenticationError and parses the Anthropic envelope", async () => {
    const { fetch } = mockFetch([
      {
        status: 401,
        json: {
          type: "error",
          error: {
            type: "authentication_error",
            message: "invalid API key",
          },
          request_id: "req_401",
        },
        headers: { "request-id": "req_401" },
      },
    ]);
    const client = new Simse({ apiKey: "sk_bad", fetch, maxRetries: 0 });
    await expect(client.account.retrieve()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    try {
      await client.account.retrieve();
    } catch (e) {
      const err = e as APIError;
      expect(err.status).toBe(401);
      expect(err.type).toBe("authentication_error");
      expect(err.requestId).toBe("req_401");
      expect(err.message).toContain("invalid API key");
    }
  });

  it("maps 400 → BadRequestError", async () => {
    const { fetch } = mockFetch([
      {
        status: 400,
        json: {
          type: "error",
          error: { type: "invalid_request_error", message: "bad model" },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    await expect(
      client.messages.create({
        model: "",
        max_tokens: 1,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("maps 429 → RateLimitError", async () => {
    const { fetch } = mockFetch([
      {
        status: 429,
        json: {
          type: "error",
          error: { type: "rate_limit_error", message: "slow down" },
        },
        headers: { "retry-after": "1" },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    await expect(client.account.retrieve()).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("maps 404 → NotFoundError", async () => {
    const { fetch } = mockFetch([
      {
        status: 404,
        json: {
          type: "error",
          error: { type: "not_found_error", message: "no such model" },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    await expect(client.models.retrieve("nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps 413 → RequestTooLargeError", async () => {
    const { fetch } = mockFetch([
      {
        status: 413,
        json: {
          type: "error",
          error: { type: "request_too_large", message: "too big" },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    await expect(client.account.retrieve()).rejects.toBeInstanceOf(
      RequestTooLargeError,
    );
  });

  it("maps 503 → OverloadedError", async () => {
    const { fetch } = mockFetch([
      {
        status: 503,
        json: {
          type: "error",
          error: { type: "overloaded_error", message: "overloaded" },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    await expect(client.account.retrieve()).rejects.toBeInstanceOf(
      OverloadedError,
    );
  });

  it("parses the LEGACY {error:{code,message}} envelope too", async () => {
    const { fetch } = mockFetch([
      {
        status: 400,
        json: { error: { code: "feature_disabled", message: "nope" } },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    try {
      await client.sessions.list();
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as APIError;
      expect(err).toBeInstanceOf(BadRequestError);
      // `error.code` is read as the type.
      expect(err.type).toBe("feature_disabled");
      expect(err.message).toContain("nope");
    }
  });

  it("falls back to the request-id response header when absent from the body", async () => {
    const { fetch } = mockFetch([
      {
        status: 500,
        json: {
          type: "error",
          error: { type: "api_error", message: "boom" },
        },
        headers: { "request-id": "req_hdr" },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch, maxRetries: 0 });
    try {
      await client.account.retrieve();
    } catch (e) {
      expect((e as APIError).requestId).toBe("req_hdr");
    }
  });
});
