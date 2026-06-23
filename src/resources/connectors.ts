import type { BaseClient } from "../client.js";
import type {
  Connector,
  ConnectorCreateParams,
  ConnectorList,
  ConnectorTestResult,
  ConnectorUpdateParams,
} from "../types.js";

/**
 * The `connectors` resource — register remote-MCP servers and attach them to
 * sessions so the server-side agentic loop can call their tools (spec §1).
 *
 *   - `create / list / retrieve / update / delete`
 *   - `test(id)` → live `tools/list` probe (`{ ok, tool_count, error? }`)
 *
 * Bearer tokens and header values are **always redacted** in responses
 * (spec §1.3). Only `auth.kind` and `auth.per_session` are echoed back.
 */
export class Connectors {
  constructor(private readonly client: BaseClient) {}

  /** `POST /v1/connectors` → `{ id, ... }` (201). */
  async create(params: ConnectorCreateParams): Promise<Connector> {
    const { data } = await this.client.post<Connector>("/v1/connectors", params);
    return data;
  }

  /** `GET /v1/connectors` → `{ connectors: [...] }` (secrets redacted). */
  async list(): Promise<ConnectorList> {
    const { data } = await this.client.get<ConnectorList>("/v1/connectors");
    return data;
  }

  /** `GET /v1/connectors/{id}` → connector (secrets redacted). */
  async retrieve(id: string): Promise<Connector> {
    const { data } = await this.client.get<Connector>(
      `/v1/connectors/${encodeURIComponent(id)}`,
    );
    return data;
  }

  /** `PATCH /v1/connectors/{id}` → updated connector (partial update). */
  async update(id: string, params: ConnectorUpdateParams): Promise<Connector> {
    const { data } = await this.client.patch<Connector>(
      `/v1/connectors/${encodeURIComponent(id)}`,
      params,
    );
    return data;
  }

  /** `DELETE /v1/connectors/{id}` → `{ deleted: true }`. */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    const { data } = await this.client.delete<{ deleted: boolean; id: string }>(
      `/v1/connectors/${encodeURIComponent(id)}`,
    );
    return data;
  }

  /**
   * `POST /v1/connectors/{id}/test` → live `tools/list` probe.
   *
   * Returns `{ ok, tool_count, error? }`. A failed probe (auth or transport)
   * is reported as `ok: false` — the HTTP response is still 200.
   */
  async test(id: string): Promise<ConnectorTestResult> {
    const { data } = await this.client.post<ConnectorTestResult>(
      `/v1/connectors/${encodeURIComponent(id)}/test`,
    );
    return data;
  }
}
