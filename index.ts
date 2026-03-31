/**
 * OpenClaw Plugin Entry Point - IG Markets Trading
 *
 * Registers all 53 IG Markets tools and the trade safety hook.
 * Replaces the old MCP server (src/server.ts).
 *
 * Configuration (openclaw.json):
 *   plugins.entries.igmarkets.config: {
 *     apiKey, username, password, isDemo, tradeApproval
 *   }
 */

import type {
  PluginEntryDefinition,
  OpenClawPluginApi,
} from "./src/types/openclaw.js";
import { registerSessionTools } from "./src/tools/session.js";
import { registerAccountTools } from "./src/tools/accounts.js";
import { registerDealingTools } from "./src/tools/dealing.js";
import { registerMarketsTools } from "./src/tools/markets.js";
import { registerWatchlistTools } from "./src/tools/watchlists.js";
import { registerSentimentTools } from "./src/tools/sentiment.js";
import { registerGeneralTools } from "./src/tools/general.js";
import { initClient } from "./src/ig-client.js";

// Trade-mutating tool names that require approval
const TRADE_TOOLS = new Set([
  "ig_create_position",
  "ig_close_position",
  "ig_create_working_order",
  "ig_delete_working_order",
]);

/**
 * In production, this would be:
 *   import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
 *   export default definePluginEntry({ ... });
 *
 * For build compatibility without the SDK installed, we export the
 * definition object directly. The OpenClaw gateway accepts both forms.
 */
function definePluginEntry(
  entry: PluginEntryDefinition,
): PluginEntryDefinition {
  return entry;
}

export default definePluginEntry({
  id: "igmarkets",
  name: "IG Markets Trading",
  description:
    "Trade stocks, CFDs, and spread bets via the IG Markets REST API",

  register(api: OpenClawPluginApi) {
    // Register all 53 tools (7 groups)
    registerSessionTools(api);
    registerAccountTools(api);
    registerDealingTools(api);
    registerMarketsTools(api);
    registerWatchlistTools(api);
    registerSentimentTools(api);
    registerGeneralTools(api);

    // Trade safety hook (configurable via tradeApproval config)
    const tradeApproval = api.pluginConfig?.tradeApproval ?? true;
    if (tradeApproval) {
      api.on("before_tool_call", (event) => {
        if (TRADE_TOOLS.has(event.toolName)) {
          return { requireApproval: true };
        }
        return {};
      });
    }

    // Auto-login if credentials are configured
    const config = api.pluginConfig;
    if (config?.apiKey && config?.username && config?.password) {
      const isDemo = config.isDemo ?? true;
      const client = initClient({
        apiKey: config.apiKey,
        username: config.username,
        password: config.password,
        isDemo,
      });
      // register() is synchronous; fire-and-forget async login
      client
        .login()
        .then(() => {
          api.logger.info(
            `Auto-logged in as ${config.username} (${isDemo ? "demo" : "live"})`,
          );
        })
        .catch((err: unknown) => {
          api.logger.warn(
            `Auto-login failed: ${err instanceof Error ? err.message : err}`,
          );
          api.logger.info("Use the ig_login tool to authenticate manually.");
        });
    } else {
      api.logger.info(
        "No credentials configured. Use ig_login tool or set apiKey/username/password in plugin config.",
      );
    }
  },
});
