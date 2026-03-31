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

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getClient } from "../ig-client.js";

export function registerWatchlistTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_watchlists - List all watchlists
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_watchlists",
    description: "Returns all watchlists belonging to the active account.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/watchlists", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_create_watchlist - Create a watchlist
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_create_watchlist",
    description: "Creates a new watchlist with an optional list of epics.",
    parameters: Type.Object({
      name: Type.String({ description: "Watchlist name" }),
      epics: Type.Optional(
        Type.Array(Type.String(), {
          description: "List of instrument epics to add initially",
        })
      ),
    }),
    async execute(_id, params) {
      const { name, epics } = params;
      const client = getClient();
      const result = await client.request("POST", "/watchlists", {
        version: "1",
        body: { name, epics: epics ?? [] },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_watchlist - Get a watchlist
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_watchlist",
    description: "Returns the markets in a specific watchlist.",
    parameters: Type.Object({
      watchlistId: Type.String({ description: "Watchlist ID" }),
    }),
    async execute(_id, params) {
      const { watchlistId } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/watchlists/${watchlistId}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_delete_watchlist - Delete a watchlist
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_delete_watchlist",
    description: "Deletes a watchlist by ID.",
    parameters: Type.Object({
      watchlistId: Type.String({ description: "Watchlist ID" }),
    }),
    async execute(_id, params) {
      const { watchlistId } = params;
      const client = getClient();
      const result = await client.request(
        "DELETE",
        `/watchlists/${watchlistId}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_watchlist_add_market - Add a market to a watchlist
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_watchlist_add_market",
    description: "Adds an instrument to an existing watchlist.",
    parameters: Type.Object({
      watchlistId: Type.String({ description: "Watchlist ID" }),
      epic: Type.String({ description: "Instrument epic to add" }),
    }),
    async execute(_id, params) {
      const { watchlistId, epic } = params;
      const client = getClient();
      const result = await client.request(
        "PUT",
        `/watchlists/${watchlistId}`,
        { version: "1", body: { epic } }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_watchlist_remove_market - Remove a market from a watchlist
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_watchlist_remove_market",
    description: "Removes an instrument from a watchlist.",
    parameters: Type.Object({
      watchlistId: Type.String({ description: "Watchlist ID" }),
      epic: Type.String({ description: "Instrument epic to remove" }),
    }),
    async execute(_id, params) {
      const { watchlistId, epic } = params;
      const client = getClient();
      const result = await client.request(
        "DELETE",
        `/watchlists/${watchlistId}/${epic}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
