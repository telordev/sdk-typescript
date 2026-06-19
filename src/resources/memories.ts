import type { BaseClient } from "../client.js";
import type {
  Memory,
  MemoryCreateParams,
  MemoryList,
  MemoryListParams,
  MemoryStats,
} from "../types.js";

/**
 * The `memories` resource (user-scoped; the gateway forces the scope to the
 * authenticated key's user).
 *
 *   - `list(params?)` (recency, or search when `query` is set)
 *   - `create({ text, metadata? })`
 *   - `delete(id)`
 *   - `stats()`
 */
export class Memories {
  constructor(private readonly client: BaseClient) {}

  /** List (recency) or search (when `query` is set) memories. */
  async list(params: MemoryListParams = {}): Promise<MemoryList> {
    const { data } = await this.client.get<MemoryList>("/v1/memories", {
      query: { query: params.query, limit: params.limit },
    });
    return data;
  }

  /** Create a memory. Returns `{ id }`. */
  async create(params: MemoryCreateParams): Promise<{ id: string }> {
    const { data } = await this.client.post<{ id: string }>(
      "/v1/memories",
      params,
    );
    return data;
  }

  /** Delete a memory by id. */
  async delete(id: string): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete<{ ok: boolean }>(
      `/v1/memories/${encodeURIComponent(id)}`,
    );
    return data;
  }

  /** Memory stats (`count`, `last_added_at`). */
  async stats(): Promise<MemoryStats> {
    const { data } = await this.client.get<MemoryStats>("/v1/memories/stats");
    return data;
  }
}

export type { Memory };
