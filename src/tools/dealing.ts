/**
 * Dealing tools - Positions, working orders, deal confirmations
 *
 * IG API endpoints:
 *   GET    /confirms/{dealReference}      (v1)    - Deal confirmation
 *   GET    /positions                     (v2)    - List all positions
 *   GET    /positions/{dealId}            (v2)    - Get position by deal ID
 *   POST   /positions/otc                 (v2)    - Create position
 *   DELETE /positions/otc                 (v1)    - Close position
 *   PUT    /positions/otc/{dealId}        (v2)    - Update position
 *   GET    /working-orders                (v2)    - List working orders
 *   POST   /working-orders/otc           (v2)    - Create working order
 *   DELETE /working-orders/otc/{dealId}   (v2)    - Delete working order
 *   PUT    /working-orders/otc/{dealId}   (v2)    - Update working order
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../ig-client.js";

export function registerDealingTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_deal_confirmation - Get deal confirmation
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_deal_confirmation",
    {
      title: "IG Deal Confirmation",
      description:
        "Returns a deal confirmation for a given deal reference. " +
        "Use this to check the outcome of a position/order operation.",
      inputSchema: {
        dealReference: z.string().describe("Deal reference returned from a trade operation"),
      },
    },
    async ({ dealReference }) => {
      const client = getClient();
      const result = await client.request("GET", `/confirms/${dealReference}`, {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_positions - List all open positions
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_positions",
    {
      title: "IG List Positions",
      description:
        "Returns all open positions for the active account, including market data " +
        "(bid, offer, instrument name) and position data (size, direction, stops, limits).",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/positions", { version: "2" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_position - Get a single position
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_position",
    {
      title: "IG Get Position",
      description: "Returns an open position by deal identifier, including market and position data.",
      inputSchema: {
        dealId: z.string().describe("Deal identifier"),
      },
    },
    async ({ dealId }) => {
      const client = getClient();
      const result = await client.request("GET", `/positions/${dealId}`, {
        version: "2",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_create_position - Open a new OTC position
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_create_position",
    {
      title: "IG Create Position",
      description:
        "Creates (opens) an OTC position. Returns a deal reference - use ig_deal_confirmation " +
        "to check the outcome. Supports market, limit, and quote order types, " +
        "stop/limit levels, trailing stops, and guaranteed stops.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier (e.g. 'IX.D.FTSE.DAILY.IP')"),
        direction: z.enum(["BUY", "SELL"]).describe("Deal direction"),
        size: z.number().describe("Deal size"),
        expiry: z
          .string()
          .describe("Instrument expiry (e.g. 'DFB', '-', 'SEP-25')"),
        currencyCode: z
          .string()
          .describe("Currency code (e.g. 'GBP', 'USD')"),
        forceOpen: z
          .boolean()
          .describe("True if force open is required (must be true if stops/limits set)"),
        guaranteedStop: z
          .boolean()
          .describe("True if a guaranteed stop is required"),
        orderType: z
          .enum(["MARKET", "LIMIT", "QUOTE"])
          .describe("Order type: MARKET (no level needed), LIMIT (level required), QUOTE (level+quoteId)"),
        level: z.number().optional().describe("Deal level (required for LIMIT/QUOTE)"),
        quoteId: z.string().optional().describe("Lightstreamer quote ID (required for QUOTE)"),
        limitLevel: z.number().optional().describe("Take-profit limit level"),
        limitDistance: z.number().optional().describe("Take-profit limit distance (alternative to limitLevel)"),
        stopLevel: z.number().optional().describe("Stop-loss level"),
        stopDistance: z.number().optional().describe("Stop-loss distance (alternative to stopLevel)"),
        trailingStop: z.boolean().optional().describe("Enable trailing stop"),
        trailingStopIncrement: z.number().optional().describe("Trailing stop increment in pips"),
        timeInForce: z
          .enum(["EXECUTE_AND_ELIMINATE", "FILL_OR_KILL"])
          .optional()
          .describe("Time in force"),
        dealReference: z
          .string()
          .optional()
          .describe("User-defined deal reference (max 30 chars)"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("POST", "/positions/otc", {
        version: "2",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_close_position - Close an OTC position
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_close_position",
    {
      title: "IG Close Position",
      description:
        "Closes one or more OTC positions. Specify either dealId or epic+expiry. " +
        "Returns a deal reference.",
      inputSchema: {
        dealId: z.string().optional().describe("Deal ID to close (use this OR epic)"),
        epic: z.string().optional().describe("Instrument epic (use this OR dealId)"),
        expiry: z.string().optional().describe("Instrument expiry (required if using epic)"),
        direction: z.enum(["BUY", "SELL"]).describe("Opposite direction to the open position"),
        size: z.number().describe("Size to close"),
        orderType: z
          .enum(["MARKET", "LIMIT", "QUOTE"])
          .describe("Order type"),
        level: z.number().optional().describe("Close level (for LIMIT/QUOTE)"),
        quoteId: z.string().optional().describe("Quote ID (for QUOTE)"),
        timeInForce: z
          .enum(["EXECUTE_AND_ELIMINATE", "FILL_OR_KILL"])
          .optional()
          .describe("Time in force"),
      },
    },
    async (args) => {
      const client = getClient();
      // IG uses DELETE with body via _method override (handled in ig-client)
      const result = await client.request("DELETE", "/positions/otc", {
        version: "1",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_update_position - Update an OTC position (stops/limits)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_update_position",
    {
      title: "IG Update Position",
      description:
        "Updates an existing OTC position's stop level, limit level, and trailing stop settings.",
      inputSchema: {
        dealId: z.string().describe("Deal identifier of the position to update"),
        stopLevel: z.number().optional().describe("New stop level"),
        limitLevel: z.number().optional().describe("New limit level"),
        trailingStop: z.boolean().optional().describe("Enable/disable trailing stop"),
        trailingStopDistance: z.number().optional().describe("Trailing stop distance"),
        trailingStopIncrement: z.number().optional().describe("Trailing stop increment"),
        guaranteedStop: z.boolean().optional().describe("Enable guaranteed stop"),
      },
    },
    async ({ dealId, ...body }) => {
      const client = getClient();
      const result = await client.request("PUT", `/positions/otc/${dealId}`, {
        version: "2",
        body,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_working_orders - List all working orders
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_working_orders",
    {
      title: "IG List Working Orders",
      description: "Returns all open working orders for the active account.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/working-orders", { version: "2" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_create_working_order - Create a working order
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_create_working_order",
    {
      title: "IG Create Working Order",
      description:
        "Creates an OTC working order (LIMIT or STOP). Returns a deal reference. " +
        "Use GOOD_TILL_CANCELLED or GOOD_TILL_DATE for time in force.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
        direction: z.enum(["BUY", "SELL"]).describe("Direction"),
        size: z.number().describe("Order size"),
        level: z.number().describe("Order trigger level"),
        type: z.enum(["LIMIT", "STOP"]).describe("Working order type"),
        currencyCode: z.string().describe("Currency code (e.g. 'GBP')"),
        expiry: z.string().describe("Instrument expiry (e.g. 'DFB', '-')"),
        guaranteedStop: z.boolean().describe("Whether a guaranteed stop is required"),
        timeInForce: z
          .enum(["GOOD_TILL_CANCELLED", "GOOD_TILL_DATE"])
          .describe("Time in force"),
        goodTillDate: z
          .string()
          .optional()
          .describe("Expiry date for GOOD_TILL_DATE (yyyy/mm/dd hh:mm:ss UTC or Unix ms)"),
        forceOpen: z.boolean().optional().describe("Force open"),
        limitLevel: z.number().optional().describe("Limit level"),
        limitDistance: z.number().optional().describe("Limit distance"),
        stopLevel: z.number().optional().describe("Stop level"),
        stopDistance: z.number().optional().describe("Stop distance"),
        dealReference: z.string().optional().describe("User-defined reference"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("POST", "/working-orders/otc", {
        version: "2",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_delete_working_order - Delete a working order
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_delete_working_order",
    {
      title: "IG Delete Working Order",
      description: "Deletes an existing OTC working order by deal ID.",
      inputSchema: {
        dealId: z.string().describe("Deal identifier of the working order"),
      },
    },
    async ({ dealId }) => {
      const client = getClient();
      const result = await client.request(
        "DELETE",
        `/working-orders/otc/${dealId}`,
        { version: "2" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_update_working_order - Update a working order
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_update_working_order",
    {
      title: "IG Update Working Order",
      description:
        "Updates an existing OTC working order's level, type, stops, limits, and time in force.",
      inputSchema: {
        dealId: z.string().describe("Deal identifier of the working order"),
        level: z.number().describe("New order level"),
        type: z.enum(["LIMIT", "STOP"]).describe("Working order type"),
        timeInForce: z
          .enum(["GOOD_TILL_CANCELLED", "GOOD_TILL_DATE"])
          .describe("Time in force"),
        goodTillDate: z.string().optional().describe("Expiry date for GOOD_TILL_DATE"),
        guaranteedStop: z.boolean().optional().describe("Guaranteed stop"),
        limitLevel: z.number().optional().describe("Limit level"),
        limitDistance: z.number().optional().describe("Limit distance"),
        stopLevel: z.number().optional().describe("Stop level"),
        stopDistance: z.number().optional().describe("Stop distance"),
      },
    },
    async ({ dealId, ...body }) => {
      const client = getClient();
      const result = await client.request(
        "PUT",
        `/working-orders/otc/${dealId}`,
        { version: "2", body }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
