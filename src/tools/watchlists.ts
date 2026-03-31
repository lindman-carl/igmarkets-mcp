/**
 * Watchlist tools - CRUD watchlists, add/remove markets
 *
 * IG API endpoints:
 *   GET    /watchlists                    (v1) - List all watchlists
 *   POST   /watchlists                    (v1) - Create watchlist
 *   GET    /watchlists/{watchlistId}      (v1) - Get watchlist
 *   DELETE /watchlists/{watchlistId}      (v1) - Delete watchlist
 *   PUT    /watchlists/{watchlistId}      (v1) - Add market to watchlist
 *   DELETE /watchlists/{watchlistId}/{epic} (v1) - Remove market from watchlist
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../ig-client.js";

export function registerWatchlistTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_watchlists - List all watchlists
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_watchlists",
    {
      title: "IG List Watchlists",
      description: "Returns all watchlists belonging to the active account.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/watchlists", { version: "1" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_create_watchlist - Create a watchlist
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_create_watchlist",
    {
      title: "IG Create Watchlist",
      description: "Creates a new watchlist with an optional list of epics.",
      inputSchema: {
        name: z.string().describe("Watchlist name"),
        epics: z
          .array(z.string())
          .optional()
          .describe("List of instrument epics to add initially"),
      },
    },
    async ({ name, epics }) => {
      const client = getClient();
      const result = await client.request("POST", "/watchlists", {
        version: "1",
        body: { name, epics: epics ?? [] },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_watchlist - Get a watchlist
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_watchlist",
    {
      title: "IG Get Watchlist",
      description: "Returns the markets in a specific watchlist.",
      inputSchema: {
        watchlistId: z.string().describe("Watchlist ID"),
      },
    },
    async ({ watchlistId }) => {
      const client = getClient();
      const result = await client.request("GET", `/watchlists/${watchlistId}`, {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_delete_watchlist - Delete a watchlist
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_delete_watchlist",
    {
      title: "IG Delete Watchlist",
      description: "Deletes a watchlist by ID.",
      inputSchema: {
        watchlistId: z.string().describe("Watchlist ID"),
      },
    },
    async ({ watchlistId }) => {
      const client = getClient();
      const result = await client.request("DELETE", `/watchlists/${watchlistId}`, {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_watchlist_add_market - Add a market to a watchlist
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_watchlist_add_market",
    {
      title: "IG Add to Watchlist",
      description: "Adds an instrument to an existing watchlist.",
      inputSchema: {
        watchlistId: z.string().describe("Watchlist ID"),
        epic: z.string().describe("Instrument epic to add"),
      },
    },
    async ({ watchlistId, epic }) => {
      const client = getClient();
      const result = await client.request("PUT", `/watchlists/${watchlistId}`, {
        version: "1",
        body: { epic },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_watchlist_remove_market - Remove a market from a watchlist
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_watchlist_remove_market",
    {
      title: "IG Remove from Watchlist",
      description: "Removes an instrument from a watchlist.",
      inputSchema: {
        watchlistId: z.string().describe("Watchlist ID"),
        epic: z.string().describe("Instrument epic to remove"),
      },
    },
    async ({ watchlistId, epic }) => {
      const client = getClient();
      const result = await client.request(
        "DELETE",
        `/watchlists/${watchlistId}/${epic}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
