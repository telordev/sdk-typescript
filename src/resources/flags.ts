import type { BaseClient } from "../client.js";
import type { FlagsResponse } from "../types.js";

/** `GET /v1/flags` → the feature flags the authenticated key may use. */
export class Flags {
  constructor(private readonly client: BaseClient) {}

  /** Retrieve the full flag map. */
  async get(): Promise<FlagsResponse> {
    const { data } = await this.client.get<FlagsResponse>("/v1/flags");
    return data;
  }
}
