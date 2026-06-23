import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("connectors resource (spec §1.3, §1.6)", () => {
  it("creates a connector — posts correct body and returns connector object", async () => {
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        json: {
          id: "conn_1",
          user_id: "user_1",
          name: "My MCP",
          type: "mcp",
          url: "https://mcp.example.com/mcp",
          auth: { kind: "bearer" },
          created_at: "2026-06-23T00:00:00Z",
          updated_at: "2026-06-23T00:00:00Z",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const conn = await client.connectors.create({
      name: "My MCP",
      type: "mcp",
      url: "https://mcp.example.com/mcp",
      auth: { kind: "bearer", value: "tok_secret" },
    });

    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/connectors");
    expect(requests[0]!.body).toMatchObject({
      name: "My MCP",
      type: "mcp",
      url: "https://mcp.example.com/mcp",
      auth: { kind: "bearer", value: "tok_secret" },
    });
    expect(conn.id).toBe("conn_1");
    expect(conn.type).toBe("mcp");
    // Server redacts the bearer value — only kind echoed back.
    expect((conn.auth as { kind: string } | null | undefined)?.kind).toBe("bearer");
    expect((conn.auth as Record<string, unknown>)?.value).toBeUndefined();
  });

  it("create omits optional fields when absent", async () => {
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        json: {
          id: "conn_2",
          user_id: "u",
          name: "Bare",
          type: "mcp",
          url: "https://x.com/mcp",
          auth: { kind: "bearer" },
          created_at: "",
          updated_at: "",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.connectors.create({
      name: "Bare",
      type: "mcp",
      url: "https://x.com/mcp",
      auth: { kind: "bearer", per_session: true },
    });
    const body = requests[0]!.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("tool_allowlist");
    expect(body).not.toHaveProperty("tool_denylist");
    expect(body).not.toHaveProperty("headers");
  });

  it("create with tool_allowlist and tool_denylist includes them in body", async () => {
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        json: {
          id: "conn_3",
          user_id: "u",
          name: "Filtered",
          type: "mcp",
          url: "https://x.com/mcp",
          auth: { kind: "bearer" },
          tool_allowlist: ["search"],
          tool_denylist: ["admin"],
          created_at: "",
          updated_at: "",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.connectors.create({
      name: "Filtered",
      type: "mcp",
      url: "https://x.com/mcp",
      auth: { kind: "bearer", value: "tok" },
      tool_allowlist: ["search"],
      tool_denylist: ["admin"],
    });
    const body = requests[0]!.body as Record<string, unknown>;
    expect(body.tool_allowlist).toEqual(["search"]);
    expect(body.tool_denylist).toEqual(["admin"]);
  });

  it("lists connectors", async () => {
    const { fetch, requests } = mockFetch([
      {
        json: {
          connectors: [
            { id: "c1", name: "A", type: "mcp", url: "https://a.com/mcp",
              user_id: "u", auth: { kind: "bearer" }, created_at: "", updated_at: "" },
            { id: "c2", name: "B", type: "mcp", url: "https://b.com/mcp",
              user_id: "u", auth: { kind: "bearer" }, created_at: "", updated_at: "" },
          ],
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const list = await client.connectors.list();
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/connectors");
    expect(list.connectors).toHaveLength(2);
    expect(list.connectors[0]!.id).toBe("c1");
    expect(list.connectors[1]!.id).toBe("c2");
  });

  it("retrieves a single connector (secrets redacted)", async () => {
    const { fetch } = mockFetch([
      {
        json: {
          id: "conn_1",
          name: "A",
          type: "mcp",
          url: "https://a.com/mcp",
          user_id: "u",
          auth: { kind: "bearer" }, // no value — redacted
          created_at: "2026-06-23T00:00:00Z",
          updated_at: "2026-06-23T00:00:00Z",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const conn = await client.connectors.retrieve("conn_1");
    expect(conn.id).toBe("conn_1");
    // Bearer value must be absent (server redacts it).
    expect((conn.auth as Record<string, unknown> | null | undefined)?.value).toBeUndefined();
  });

  it("updates a connector via PATCH", async () => {
    const { fetch, requests } = mockFetch([
      {
        json: {
          id: "conn_1",
          name: "Updated",
          type: "mcp",
          url: "https://a.com/mcp",
          user_id: "u",
          auth: { kind: "bearer" },
          created_at: "",
          updated_at: "2026-06-23T01:00:00Z",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const conn = await client.connectors.update("conn_1", { name: "Updated" });
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/connectors/conn_1");
    expect(requests[0]!.body).toMatchObject({ name: "Updated" });
    expect(conn.name).toBe("Updated");
  });

  it("deletes a connector", async () => {
    const { fetch, requests } = mockFetch([
      { json: { deleted: true, id: "conn_1" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const result = await client.connectors.delete("conn_1");
    expect(requests[0]!.method).toBe("DELETE");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/connectors/conn_1");
    expect(result.deleted).toBe(true);
    expect(result.id).toBe("conn_1");
  });

  it("tests a connector — ok response with tool_count", async () => {
    const { fetch, requests } = mockFetch([
      { json: { ok: true, tool_count: 5 } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const result = await client.connectors.test("conn_1");
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/connectors/conn_1/test");
    expect(result.ok).toBe(true);
    expect(result.tool_count).toBe(5);
    expect(result.error).toBeUndefined();
  });

  it("tests a connector — auth failure returns ok:false with error", async () => {
    const { fetch } = mockFetch([
      { json: { ok: false, tool_count: 0, error: "401 Unauthorized" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const result = await client.connectors.test("conn_1");
    expect(result.ok).toBe(false);
    expect(result.tool_count).toBe(0);
    expect(result.error).toContain("401");
  });

  it("per_session auth serializes correctly", async () => {
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        json: {
          id: "conn_ps",
          user_id: "u",
          name: "PS",
          type: "mcp",
          url: "https://x.com/mcp",
          auth: { kind: "bearer", per_session: true },
          created_at: "",
          updated_at: "",
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.connectors.create({
      name: "PS",
      type: "mcp",
      url: "https://x.com/mcp",
      auth: { kind: "bearer", per_session: true },
    });
    const body = requests[0]!.body as Record<string, unknown>;
    const auth = body.auth as Record<string, unknown>;
    expect(auth.kind).toBe("bearer");
    expect(auth.per_session).toBe(true);
    expect(auth.value).toBeUndefined();
  });
});
