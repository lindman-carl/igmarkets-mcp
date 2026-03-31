/**
 * IG Markets MCP Server
 *
 * Exposes the full IG REST Trading API as MCP tools for use with OpenCode.
 * Communicates over stdio using the Model Context Protocol.
 *
 * Usage:
 *   npx tsx src/server.ts          # development
 *   node dist/server.js            # production (after npm run build)
 *
 * Environment variables (optional, for auto-login):
 *   IG_API_KEY   - IG API key
 *   IG_USERNAME  - IG username
 *   IG_PASSWORD  - IG password
 *   IG_DEMO      - "true" (default) or "false"
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { initClient } from "./ig-client.js";
import { registerSessionTools } from "./tools/session.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerDealingTools } from "./tools/dealing.js";
import { registerMarketsTools } from "./tools/markets.js";
import { registerWatchlistTools } from "./tools/watchlists.js";
import { registerSentimentTools } from "./tools/sentiment.js";
import { registerGeneralTools } from "./tools/general.js";

async function main() {
  const server = new McpServer({
    name: "igmarkets",
    version: "1.0.0",
  });

  // Register all tool groups
  registerSessionTools(server);
  registerAccountTools(server);
  registerDealingTools(server);
  registerMarketsTools(server);
  registerWatchlistTools(server);
  registerSentimentTools(server);
  registerGeneralTools(server);

  // Auto-login if environment variables are set
  const apiKey = process.env.IG_API_KEY;
  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;

  if (apiKey && username && password) {
    const isDemo = process.env.IG_DEMO !== "false";
    const client = initClient({ apiKey, username, password, isDemo });
    try {
      await client.login();
      console.error(
        `[igmarkets] Auto-logged in as ${username} (${isDemo ? "demo" : "live"})`
      );
    } catch (err) {
      console.error(
        `[igmarkets] Auto-login failed: ${err instanceof Error ? err.message : err}`
      );
      console.error("[igmarkets] Use the ig_login tool to authenticate manually.");
    }
  } else {
    console.error(
      "[igmarkets] No credentials in environment. Use ig_login tool to authenticate."
    );
  }

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[igmarkets] MCP server running on stdio");
}

main().catch((error) => {
  console.error("[igmarkets] Fatal error:", error);
  process.exit(1);
});
