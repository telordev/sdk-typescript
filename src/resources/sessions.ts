import type { BaseClient } from "../client.js";
import { SessionStream } from "../session-stream.js";
import type {
  Session,
  SessionCreateParams,
  SessionList,
  SessionPromptParams,
  SessionPromptResult,
  SessionResumeResult,
} from "../types.js";

/**
 * The `sessions` resource — the agentic, model-driven conversation loop.
 *
 *   - `create / list / retrieve / delete`
 *   - `prompt(id, params)` → buffered `SessionPromptResult`
 *   - `stream(id, params)` → `SessionStream` (typed events + accumulated text)
 *   - `resume(id)` / `abort(id)`
 */
export class Sessions {
  constructor(private readonly client: BaseClient) {}

  /** Create a new session. */
  async create(params: SessionCreateParams = {}): Promise<Session> {
    const { data } = await this.client.post<Session>("/v1/sessions", params);
    return data;
  }

  /** List the caller's sessions. */
  async list(): Promise<SessionList> {
    const { data } = await this.client.get<SessionList>("/v1/sessions");
    return data;
  }

  /** Retrieve a single session by id. */
  async retrieve(id: string): Promise<Session> {
    const { data } = await this.client.get<Session>(
      `/v1/sessions/${encodeURIComponent(id)}`,
    );
    return data;
  }

  /** Delete a session. */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    const { data } = await this.client.delete<{
      deleted: boolean;
      id: string;
    }>(`/v1/sessions/${encodeURIComponent(id)}`);
    return data;
  }

  /** Send a prompt and buffer the assistant turn. */
  async prompt(
    id: string,
    params: SessionPromptParams,
  ): Promise<SessionPromptResult> {
    const { data } = await this.client.post<SessionPromptResult>(
      `/v1/sessions/${encodeURIComponent(id)}/messages`,
      { ...params, stream: false },
    );
    return data;
  }

  /**
   * Send a prompt and stream the agentic loop's events
   * (`delta`/`tool_call`/`tool_result`/`done`). Returns a `SessionStream`.
   */
  stream(
    id: string,
    params: Omit<SessionPromptParams, "stream">,
  ): SessionStream {
    const responsePromise = this.client.stream({
      method: "post",
      path: `/v1/sessions/${encodeURIComponent(id)}/messages`,
      body: { ...params, stream: true },
    });
    return new SessionStream(responsePromise);
  }

  /** Resume a session — reconstruct its message + tool-call history. */
  async resume(id: string): Promise<SessionResumeResult> {
    const { data } = await this.client.post<SessionResumeResult>(
      `/v1/sessions/${encodeURIComponent(id)}/resume`,
    );
    return data;
  }

  /** Abort an in-flight prompt for a session. */
  async abort(id: string): Promise<{ aborted: boolean; id: string }> {
    const { data } = await this.client.post<{
      aborted: boolean;
      id: string;
    }>(`/v1/sessions/${encodeURIComponent(id)}/abort`);
    return data;
  }
}
