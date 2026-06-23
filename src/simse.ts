import { BaseClient, type ClientOptions } from "./client.js";
import {
  AccountResource,
  BillingResource,
  UsageResource,
} from "./resources/account.js";
import { Agents } from "./resources/agents.js";
import { Connectors } from "./resources/connectors.js";
import { Flags } from "./resources/flags.js";
import { Memories } from "./resources/memories.js";
import { Messages } from "./resources/messages.js";
import { Models } from "./resources/models.js";
import { Plugins } from "./resources/plugins.js";
import { PM } from "./resources/pm.js";
import { Sessions } from "./resources/sessions.js";

/**
 * The Simse API client.
 *
 * ```ts
 * import { Simse } from "@telordev/simse";
 *
 * const client = new Simse({ apiKey: process.env.SIMSE_API_KEY });
 * const message = await client.messages.create({
 *   model: "zoysia",
 *   max_tokens: 256,
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 * console.log(message.content);
 * ```
 *
 * Auth: every request sends BOTH `x-api-key` and `Authorization: Bearer`, plus
 * `anthropic-version`. The key defaults from `SIMSE_API_KEY`, then
 * `ANTHROPIC_API_KEY`. The base URL defaults to `https://api.simse.dev`
 * (override via `SIMSE_BASE_URL`).
 */
export class Simse extends BaseClient {
  readonly messages: Messages;
  readonly models: Models;
  readonly agents: Agents;
  readonly account: AccountResource;
  readonly usage: UsageResource;
  readonly billing: BillingResource;
  readonly sessions: Sessions;
  readonly memories: Memories;
  readonly plugins: Plugins;
  readonly pm: PM;
  readonly flags: Flags;
  readonly connectors: Connectors;

  constructor(options: ClientOptions = {}) {
    super(options);
    this.messages = new Messages(this);
    this.models = new Models(this);
    this.agents = new Agents(this);
    this.account = new AccountResource(this);
    this.usage = new UsageResource(this);
    this.billing = new BillingResource(this);
    this.sessions = new Sessions(this);
    this.memories = new Memories(this);
    this.plugins = new Plugins(this);
    this.pm = new PM(this);
    this.flags = new Flags(this);
    this.connectors = new Connectors(this);
  }
}
