import type { BaseClient } from "../client.js";
import type {
  InstalledList,
  PluginInstallParams,
  PluginsList,
  PluginUninstallParams,
  RegistryDetail,
  RegistryList,
} from "../types.js";

/**
 * The `plugins` resource — installed tools/plugins + the marketplace registry.
 *
 *   - `list()` (built-in tools + per-user plugins)
 *   - `registry()` / `registryEntry(id)`
 *   - `installed()`
 *   - `install({ pluginName, ... })` / `uninstall({ pluginName })`
 */
export class Plugins {
  constructor(private readonly client: BaseClient) {}

  /** Built-in tool defs + the caller's plugin list. */
  async list(): Promise<PluginsList> {
    const { data } = await this.client.get<PluginsList>("/v1/plugins");
    return data;
  }

  /** The marketplace registry catalog. */
  async registry(): Promise<RegistryList> {
    const { data } = await this.client.get<RegistryList>(
      "/v1/plugins/registry",
    );
    return data;
  }

  /** A single registry entry (manifest + readme). */
  async registryEntry(id: string): Promise<RegistryDetail> {
    const { data } = await this.client.get<RegistryDetail>(
      `/v1/plugins/registry/${encodeURIComponent(id)}`,
    );
    return data;
  }

  /** The caller's installed plugins. */
  async installed(): Promise<InstalledList> {
    const { data } = await this.client.get<InstalledList>(
      "/v1/plugins/installed",
    );
    return data;
  }

  /** Install a plugin by name. */
  async install(
    params: PluginInstallParams,
  ): Promise<{ installed: boolean }> {
    const { data } = await this.client.post<{ installed: boolean }>(
      "/v1/plugins/install",
      params,
    );
    return data;
  }

  /** Uninstall a plugin by name. */
  async uninstall(
    params: PluginUninstallParams,
  ): Promise<{ uninstalled: boolean }> {
    const { data } = await this.client.post<{ uninstalled: boolean }>(
      "/v1/plugins/uninstall",
      params,
    );
    return data;
  }

  /** Enable or disable an installed plugin. */
  async setEnabled(
    pluginName: string,
    enabled: boolean,
  ): Promise<{ updated: boolean }> {
    const { data } = await this.client.post<{ updated: boolean }>(
      "/v1/plugins/enabled",
      { plugin_name: pluginName, enabled },
    );
    return data;
  }
}
