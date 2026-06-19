import type { BaseClient } from "../client.js";
import type {
  Account,
  Billing,
  UsageDashboard,
  UsageSummary,
} from "../types.js";

/** `GET /v1/account` → the authenticated key's account profile. */
export class AccountResource {
  constructor(private readonly client: BaseClient) {}

  async retrieve(): Promise<Account> {
    const { data } = await this.client.get<Account>("/v1/account");
    return data;
  }
}

/**
 * The `usage` resource.
 *
 *   - `retrieve()`  → `GET /v1/usage` (the current-period usage summary).
 *   - `dashboard()` → `GET /v1/usage/dashboard` (the rich UsagePanel view:
 *     per-model included-vs-extra split, the billing block, and the optional
 *     compute-session window). Wire keys are camelCase, surfaced verbatim.
 */
export class UsageResource {
  constructor(private readonly client: BaseClient) {}

  async retrieve(): Promise<UsageSummary> {
    const { data } = await this.client.get<UsageSummary>("/v1/usage");
    return data;
  }

  /** `GET /v1/usage/dashboard` → the rich usage-panel view. */
  async dashboard(): Promise<UsageDashboard> {
    const { data } = await this.client.get<UsageDashboard>(
      "/v1/usage/dashboard",
    );
    return data;
  }
}

/** `GET /v1/billing` → the plan/status/limits/usage view. */
export class BillingResource {
  constructor(private readonly client: BaseClient) {}

  async retrieve(): Promise<Billing> {
    const { data } = await this.client.get<Billing>("/v1/billing");
    return data;
  }
}
