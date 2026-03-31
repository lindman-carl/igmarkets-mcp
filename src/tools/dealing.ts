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

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getClient } from "../ig-client.js";

export function registerDealingTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_deal_confirmation - Get deal confirmation
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_deal_confirmation",
    description:
      "Returns a deal confirmation for a given deal reference. " +
      "Use this to check the outcome of a position/order operation.",
    parameters: Type.Object({
      dealReference: Type.String({
        description: "Deal reference returned from a trade operation",
      }),
    }),
    async execute(_id, params) {
      const { dealReference } = params;
      const client = getClient();
      const result = await client.request("GET", `/confirms/${dealReference}`, {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_positions - List all open positions
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_positions",
    description:
      "Returns all open positions for the active account, including market data " +
      "(bid, offer, instrument name) and position data (size, direction, stops, limits).",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/positions", {
        version: "2",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_position - Get a single position
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_position",
    description:
      "Returns an open position by deal identifier, including market and position data.",
    parameters: Type.Object({
      dealId: Type.String({ description: "Deal identifier" }),
    }),
    async execute(_id, params) {
      const { dealId } = params;
      const client = getClient();
      const result = await client.request("GET", `/positions/${dealId}`, {
        version: "2",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_create_position - Open a new OTC position
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_create_position",
    description:
      "Creates (opens) an OTC position. Returns a deal reference - use ig_deal_confirmation " +
      "to check the outcome. Supports market, limit, and quote order types, " +
      "stop/limit levels, trailing stops, and guaranteed stops.",
    parameters: Type.Object({
      epic: Type.String({
        description: "Instrument epic identifier (e.g. 'IX.D.FTSE.DAILY.IP')",
      }),
      direction: Type.Union([Type.Literal("BUY"), Type.Literal("SELL")], {
        description: "Deal direction",
      }),
      size: Type.Number({ description: "Deal size" }),
      expiry: Type.String({
        description: "Instrument expiry (e.g. 'DFB', '-', 'SEP-25')",
      }),
      currencyCode: Type.String({
        description: "Currency code (e.g. 'GBP', 'USD')",
      }),
      forceOpen: Type.Boolean({
        description:
          "True if force open is required (must be true if stops/limits set)",
      }),
      guaranteedStop: Type.Boolean({
        description: "True if a guaranteed stop is required",
      }),
      orderType: Type.Union(
        [Type.Literal("MARKET"), Type.Literal("LIMIT"), Type.Literal("QUOTE")],
        {
          description:
            "Order type: MARKET (no level needed), LIMIT (level required), QUOTE (level+quoteId)",
        },
      ),
      level: Type.Optional(
        Type.Number({ description: "Deal level (required for LIMIT/QUOTE)" }),
      ),
      quoteId: Type.Optional(
        Type.String({
          description: "Lightstreamer quote ID (required for QUOTE)",
        }),
      ),
      limitLevel: Type.Optional(
        Type.Number({ description: "Take-profit limit level" }),
      ),
      limitDistance: Type.Optional(
        Type.Number({
          description: "Take-profit limit distance (alternative to limitLevel)",
        }),
      ),
      stopLevel: Type.Optional(Type.Number({ description: "Stop-loss level" })),
      stopDistance: Type.Optional(
        Type.Number({
          description: "Stop-loss distance (alternative to stopLevel)",
        }),
      ),
      trailingStop: Type.Optional(
        Type.Boolean({ description: "Enable trailing stop" }),
      ),
      trailingStopIncrement: Type.Optional(
        Type.Number({ description: "Trailing stop increment in pips" }),
      ),
      timeInForce: Type.Optional(
        Type.Union(
          [Type.Literal("EXECUTE_AND_ELIMINATE"), Type.Literal("FILL_OR_KILL")],
          { description: "Time in force" },
        ),
      ),
      dealReference: Type.Optional(
        Type.String({
          description: "User-defined deal reference (max 30 chars)",
        }),
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request("POST", "/positions/otc", {
        version: "2",
        body: params,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_close_position - Close an OTC position
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_close_position",
    description:
      "Closes one or more OTC positions. Specify either dealId or epic+expiry. " +
      "Returns a deal reference.",
    parameters: Type.Object({
      dealId: Type.Optional(
        Type.String({ description: "Deal ID to close (use this OR epic)" }),
      ),
      epic: Type.Optional(
        Type.String({ description: "Instrument epic (use this OR dealId)" }),
      ),
      expiry: Type.Optional(
        Type.String({
          description: "Instrument expiry (required if using epic)",
        }),
      ),
      direction: Type.Union([Type.Literal("BUY"), Type.Literal("SELL")], {
        description: "Opposite direction to the open position",
      }),
      size: Type.Number({ description: "Size to close" }),
      orderType: Type.Union(
        [Type.Literal("MARKET"), Type.Literal("LIMIT"), Type.Literal("QUOTE")],
        { description: "Order type" },
      ),
      level: Type.Optional(
        Type.Number({ description: "Close level (for LIMIT/QUOTE)" }),
      ),
      quoteId: Type.Optional(
        Type.String({ description: "Quote ID (for QUOTE)" }),
      ),
      timeInForce: Type.Optional(
        Type.Union(
          [Type.Literal("EXECUTE_AND_ELIMINATE"), Type.Literal("FILL_OR_KILL")],
          { description: "Time in force" },
        ),
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      // IG uses DELETE with body via _method override (handled in ig-client)
      const result = await client.request("DELETE", "/positions/otc", {
        version: "1",
        body: params,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_update_position - Update an OTC position (stops/limits)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_update_position",
    description:
      "Updates an existing OTC position's stop level, limit level, and trailing stop settings.",
    parameters: Type.Object({
      dealId: Type.String({
        description: "Deal identifier of the position to update",
      }),
      stopLevel: Type.Optional(Type.Number({ description: "New stop level" })),
      limitLevel: Type.Optional(
        Type.Number({ description: "New limit level" }),
      ),
      trailingStop: Type.Optional(
        Type.Boolean({ description: "Enable/disable trailing stop" }),
      ),
      trailingStopDistance: Type.Optional(
        Type.Number({ description: "Trailing stop distance" }),
      ),
      trailingStopIncrement: Type.Optional(
        Type.Number({ description: "Trailing stop increment" }),
      ),
      guaranteedStop: Type.Optional(
        Type.Boolean({ description: "Enable guaranteed stop" }),
      ),
    }),
    async execute(_id, params) {
      const { dealId, ...body } = params;
      const client = getClient();
      const result = await client.request("PUT", `/positions/otc/${dealId}`, {
        version: "2",
        body,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_working_orders - List all working orders
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_working_orders",
    description: "Returns all open working orders for the active account.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/working-orders", {
        version: "2",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_create_working_order - Create a working order
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_create_working_order",
    description:
      "Creates an OTC working order (LIMIT or STOP). Returns a deal reference. " +
      "Use GOOD_TILL_CANCELLED or GOOD_TILL_DATE for time in force.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
      direction: Type.Union([Type.Literal("BUY"), Type.Literal("SELL")], {
        description: "Direction",
      }),
      size: Type.Number({ description: "Order size" }),
      level: Type.Number({ description: "Order trigger level" }),
      type: Type.Union([Type.Literal("LIMIT"), Type.Literal("STOP")], {
        description: "Working order type",
      }),
      currencyCode: Type.String({
        description: "Currency code (e.g. 'GBP')",
      }),
      expiry: Type.String({
        description: "Instrument expiry (e.g. 'DFB', '-')",
      }),
      guaranteedStop: Type.Boolean({
        description: "Whether a guaranteed stop is required",
      }),
      timeInForce: Type.Union(
        [Type.Literal("GOOD_TILL_CANCELLED"), Type.Literal("GOOD_TILL_DATE")],
        { description: "Time in force" },
      ),
      goodTillDate: Type.Optional(
        Type.String({
          description:
            "Expiry date for GOOD_TILL_DATE (yyyy/mm/dd hh:mm:ss UTC or Unix ms)",
        }),
      ),
      forceOpen: Type.Optional(Type.Boolean({ description: "Force open" })),
      limitLevel: Type.Optional(Type.Number({ description: "Limit level" })),
      limitDistance: Type.Optional(
        Type.Number({ description: "Limit distance" }),
      ),
      stopLevel: Type.Optional(Type.Number({ description: "Stop level" })),
      stopDistance: Type.Optional(
        Type.Number({ description: "Stop distance" }),
      ),
      dealReference: Type.Optional(
        Type.String({ description: "User-defined reference" }),
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request("POST", "/working-orders/otc", {
        version: "2",
        body: params,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_delete_working_order - Delete a working order
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_delete_working_order",
    description: "Deletes an existing OTC working order by deal ID.",
    parameters: Type.Object({
      dealId: Type.String({
        description: "Deal identifier of the working order",
      }),
    }),
    async execute(_id, params) {
      const { dealId } = params;
      const client = getClient();
      const result = await client.request(
        "DELETE",
        `/working-orders/otc/${dealId}`,
        { version: "2" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_update_working_order - Update a working order
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_update_working_order",
    description:
      "Updates an existing OTC working order's level, type, stops, limits, and time in force.",
    parameters: Type.Object({
      dealId: Type.String({
        description: "Deal identifier of the working order",
      }),
      level: Type.Number({ description: "New order level" }),
      type: Type.Union([Type.Literal("LIMIT"), Type.Literal("STOP")], {
        description: "Working order type",
      }),
      timeInForce: Type.Union(
        [Type.Literal("GOOD_TILL_CANCELLED"), Type.Literal("GOOD_TILL_DATE")],
        { description: "Time in force" },
      ),
      goodTillDate: Type.Optional(
        Type.String({ description: "Expiry date for GOOD_TILL_DATE" }),
      ),
      guaranteedStop: Type.Optional(
        Type.Boolean({ description: "Guaranteed stop" }),
      ),
      limitLevel: Type.Optional(Type.Number({ description: "Limit level" })),
      limitDistance: Type.Optional(
        Type.Number({ description: "Limit distance" }),
      ),
      stopLevel: Type.Optional(Type.Number({ description: "Stop level" })),
      stopDistance: Type.Optional(
        Type.Number({ description: "Stop distance" }),
      ),
    }),
    async execute(_id, params) {
      const { dealId, ...body } = params;
      const client = getClient();
      const result = await client.request(
        "PUT",
        `/working-orders/otc/${dealId}`,
        { version: "2", body },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
