import type { BaseClient } from "../client.js";
import type { Agent, AgentList } from "../types.js";

/**
 * The `agents` resource — the subagent run history the orchestrator records as
 * it spawns/finishes subagents (the dashboard "Agents" panel).
 *
 *   - `list()` → `AgentList` (`agents` array, newest-first, per-user scoped).
 */
export class Agents {
  constructor(private readonly client: BaseClient) {}

  /** List the subagent run history (newest first). */
  async list(): Promise<AgentList> {
    const { data } = await this.client.get<AgentList>("/v1/agents");
    return data;
  }
}

export type { Agent };
