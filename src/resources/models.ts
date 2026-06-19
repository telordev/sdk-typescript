import type { BaseClient } from "../client.js";
import type { Model, ModelList, ModelListParams } from "../types.js";

/**
 * The `models` resource (Anthropic-shaped).
 *
 *   - `list(params?)` → `ModelList` (`data` array + cursor fields).
 *   - `retrieve(modelId)` → `Model` (404 → `NotFoundError`).
 */
export class Models {
  constructor(private readonly client: BaseClient) {}

  /** List the available models. Returns the full `ModelList` page. */
  async list(params: ModelListParams = {}): Promise<ModelList> {
    const { data } = await this.client.get<ModelList>("/v1/models", {
      query: {
        limit: params.limit,
        before_id: params.before_id,
        after_id: params.after_id,
      },
    });
    return data;
  }

  /** Retrieve a single model by id. */
  async retrieve(modelId: string): Promise<Model> {
    const { data } = await this.client.get<Model>(
      `/v1/models/${encodeURIComponent(modelId)}`,
    );
    return data;
  }
}
