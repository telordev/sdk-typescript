import { describe, expect, it } from "vitest";
import { Simse } from "../src/index.js";
import { mockFetch } from "./helpers.js";

describe("account / usage / billing", () => {
  it("retrieves account, usage, billing", async () => {
    const { fetch, requests } = mockFetch([
      { json: { id: "pa_1", user_id: "user_1", plan: "free" } },
      {
        json: {
          period: "current",
          requests: 3,
          tokens: 100,
          by_model: { zoysia: 100 },
        },
      },
      { json: { plan: "free", status: "active", limits: {}, current_usage: {} } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    expect((await client.account.retrieve()).plan).toBe("free");
    const usage = await client.usage.retrieve();
    expect(usage.tokens).toBe(100);
    expect(usage.by_model.zoysia).toBe(100);
    expect((await client.billing.retrieve()).status).toBe("active");
    expect(requests.map((r) => r.url)).toEqual([
      "https://api.simse.dev/v1/account",
      "https://api.simse.dev/v1/usage",
      "https://api.simse.dev/v1/billing",
    ]);
  });
});

describe("usage dashboard", () => {
  it("retrieves the rich usage-panel view with camelCase wire keys", async () => {
    const { fetch, requests } = mockFetch([
      {
        json: {
          plan: "pro",
          periodStart: 1718755200000,
          models: [
            {
              model: "zoysia",
              includedInputTokens: 1000,
              includedOutputTokens: 500,
              extraInputTokens: 10,
              extraOutputTokens: 5,
              extraSpendCents: 3,
              requestCount: 7,
              multiplier: 2.5,
            },
          ],
          billing: {
            extraUsageEnabled: true,
            extraUsageCapCents: 5000,
            creditsBalanceCents: 250,
            extraSpendThisPeriodCents: 3,
            planIncludedTokens: 1000000,
          },
          compute: {
            session: {
              current: {
                state: "active",
                startedAt: 1718755200000,
                expiresAt: 1718773200000,
                cooldownUntil: 1718791200000,
                usedMs: 60000,
                limitMs: 18000000,
                inFlight: 0,
              },
            },
          },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const dash = await client.usage.dashboard();
    expect(requests[0]!.url).toBe(
      "https://api.simse.dev/v1/usage/dashboard",
    );
    expect(requests[0]!.method).toBe("GET");
    expect(dash.plan).toBe("pro");
    expect(dash.periodStart).toBe(1718755200000);
    expect(dash.models[0]!.model).toBe("zoysia");
    expect(dash.models[0]!.includedInputTokens).toBe(1000);
    expect(dash.models[0]!.multiplier).toBe(2.5);
    expect(dash.billing.extraUsageEnabled).toBe(true);
    expect(dash.billing.creditsBalanceCents).toBe(250);
    expect(dash.compute?.session?.current?.state).toBe("active");
    expect(dash.compute?.session?.current?.inFlight).toBe(0);
  });

  it("tolerates an omitted compute block", async () => {
    const { fetch } = mockFetch([
      {
        json: {
          plan: "free",
          periodStart: 0,
          models: [],
          billing: {
            extraUsageEnabled: false,
            extraUsageCapCents: 0,
            creditsBalanceCents: 0,
            extraSpendThisPeriodCents: 0,
            planIncludedTokens: 0,
          },
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const dash = await client.usage.dashboard();
    expect(dash.models).toEqual([]);
    expect(dash.compute).toBeUndefined();
  });
});

describe("agents", () => {
  it("lists the subagent run history", async () => {
    const { fetch, requests } = mockFetch([
      {
        json: {
          agents: [
            {
              id: "agent_1",
              description: "fix the build",
              status: "completed",
              started_at: "2026-06-19T00:00:00Z",
              completed_at: "2026-06-19T00:01:00Z",
              duration_ms: 60000,
              turns: 4,
              input_tokens: 1200,
              output_tokens: 800,
              error: null,
            },
            {
              id: "agent_2",
              description: "run tests",
              status: "running",
              started_at: "2026-06-19T00:02:00Z",
              completed_at: null,
              duration_ms: null,
              turns: 1,
              input_tokens: 300,
              output_tokens: 0,
              error: null,
            },
          ],
        },
      },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const res = await client.agents.list();
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/agents");
    expect(requests[0]!.method).toBe("GET");
    expect(res.agents).toHaveLength(2);
    expect(res.agents[0]!.id).toBe("agent_1");
    expect(res.agents[0]!.status).toBe("completed");
    expect(res.agents[0]!.duration_ms).toBe(60000);
    expect(res.agents[0]!.error).toBeNull();
    expect(res.agents[1]!.status).toBe("running");
    expect(res.agents[1]!.completed_at).toBeNull();
  });
});

describe("memories", () => {
  it("lists, searches, creates, deletes, stats", async () => {
    const { fetch, requests } = mockFetch([
      { json: { memories: [{ id: "m1", text: "hi", metadata: {}, created_at: "" }] } },
      { json: { memories: [] } },
      { status: 201, json: { id: "m2" } },
      { json: { ok: true } },
      { json: { count: 5, last_added_at: "2026-06-19T00:00:00Z" } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const list = await client.memories.list();
    expect(list.memories[0]!.id).toBe("m1");
    await client.memories.list({ query: "search-term", limit: 10 });
    expect(new URL(requests[1]!.url).searchParams.get("query")).toBe(
      "search-term",
    );
    const created = await client.memories.create({ text: "remember this" });
    expect(created.id).toBe("m2");
    expect((await client.memories.delete("m2")).ok).toBe(true);
    expect((await client.memories.stats()).count).toBe(5);
  });
});

describe("plugins", () => {
  it("covers list/registry/installed/install/uninstall", async () => {
    const { fetch, requests } = mockFetch([
      { json: { tools: [], plugins: [] } },
      { json: { plugins: [{ id: "p1", name: "P1" }] } },
      { json: { plugin_id: "p1", manifest: {}, readme: "rm" } },
      { json: { installed: [] } },
      { json: { installed: true } },
      { json: { uninstalled: true } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.plugins.list();
    const reg = await client.plugins.registry();
    expect(reg.plugins[0]!.id).toBe("p1");
    const detail = await client.plugins.registryEntry("p1");
    expect(detail.plugin_id).toBe("p1");
    await client.plugins.installed();
    expect((await client.plugins.install({ plugin_name: "p1" })).installed).toBe(
      true,
    );
    expect(
      (await client.plugins.uninstall({ plugin_name: "p1" })).uninstalled,
    ).toBe(true);
    expect(requests[4]!.body).toMatchObject({ plugin_name: "p1" });
  });

  it("setEnabled posts correct body", async () => {
    const { fetch, requests } = mockFetch([{ json: { updated: true } }]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const result = await client.plugins.setEnabled("github", false);
    expect(result.updated).toBe(true);
    expect(requests[0]!.body).toMatchObject({ plugin_name: "github", enabled: false });
  });
});

describe("flags", () => {
  it("reads the flag map", async () => {
    const { fetch } = mockFetch([
      { json: { flags: { "v1.chat": true, "v1.sessions": false } } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    const res = await client.flags.get();
    expect(res.flags["v1.chat"]).toBe(true);
    expect(res.flags["v1.sessions"]).toBe(false);
  });
});

describe("pm — tasks / projects / schedules / workflows", () => {
  it("hits the right session-scoped task routes", async () => {
    const { fetch, requests } = mockFetch([
      { json: { tasks: [], projects: [], deps: [] } },
      { status: 201, json: { taskId: "t1" } },
      { json: { ok: true } },
      { json: { ok: true } },
      { json: { deleted: true } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.pm.tasks.list("s1");
    expect(requests[0]!.url).toBe("https://api.simse.dev/v1/sessions/s1/tasks");
    const created = await client.pm.tasks.create("s1", { title: "do it" });
    expect(created.taskId).toBe("t1");
    await client.pm.tasks.move("s1", "t1", { status: "doing" });
    expect(requests[2]!.url).toBe(
      "https://api.simse.dev/v1/sessions/s1/tasks/t1/move",
    );
    await client.pm.tasks.addDependency("s1", "t1", "t2");
    expect(requests[3]!.body).toMatchObject({ blocksTaskId: "t2" });
    await client.pm.tasks.delete("s1", "t1");
    expect(requests[4]!.method).toBe("DELETE");
  });

  it("covers schedules + workflows (user-scoped)", async () => {
    const { fetch, requests } = mockFetch([
      { json: { schedules: [] } },
      { status: 201, json: { taskId: "sch1" } },
      { json: { workflows: [] } },
      { status: 201, json: { workflowId: "wf1" } },
      { json: { ok: true, errors: [] } },
      { json: { runId: "run1", status: "running" } },
      { json: { cancelled: true } },
    ]);
    const client = new Simse({ apiKey: "sk_x", fetch });
    await client.pm.schedules.list();
    const sch = await client.pm.schedules.create({
      name: "nightly",
      cronExpr: "0 0 * * *",
      actionKind: "run_workflow",
    });
    expect(sch.taskId).toBe("sch1");
    await client.pm.workflows.list();
    const wf = await client.pm.workflows.create({
      name: "wf",
      source: "...",
    });
    expect(wf.workflowId).toBe("wf1");
    const lint = await client.pm.workflows.lint("source");
    expect(lint.ok).toBe(true);
    const run = await client.pm.workflows.run("wf1", { input: { x: 1 } });
    expect(run.runId).toBe("run1");
    await client.pm.workflows.cancelRun("run1");
    expect(requests[6]!.url).toBe(
      "https://api.simse.dev/v1/workflows/runs/run1/cancel",
    );
  });
});
