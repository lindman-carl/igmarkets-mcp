/**
 * General & costs tools - Indicative costs/charges, application management
 *
 * IG API endpoints:
 *   POST /indicativecostsandcharges/open               (v1) - Costs at opening
 *   POST /indicativecostsandcharges/close              (v1) - Costs at closing
 *   POST /indicativecostsandcharges/edit               (v1) - Costs for editing
 *   GET  /indicativecostsandcharges/durablemedium/{ref}(v1) - Download cost PDF
 *   GET  /indicativecostsandcharges/history/from/{f}/to/{t} (v1) - Cost history
 *   GET  /operations/application                        (v1) - List applications
 *   PUT  /operations/application                        (v1) - Update application
 *   PUT  /operations/application/disable                (v1) - Disable application
 *   GET  /repeat-dealing-window                         (v1) - Repeat deal window
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getClient } from "../ig-client.js";

const DirectionType = Type.Union(
  [Type.Literal("BUY"), Type.Literal("SELL")],
  { description: "Direction" }
);

const OrderTypeType = Type.Union(
  [Type.Literal("MARKET"), Type.Literal("LIMIT"), Type.Literal("QUOTE")],
  { description: "Order type" }
);

export function registerGeneralTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_costs_open - Indicative costs at opening
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_costs_open",
    description:
      "Returns indicative costs and charges for opening a position. " +
      "Supported for EU regulated entities.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
      direction: DirectionType,
      size: Type.Number({ description: "Deal size" }),
      orderType: OrderTypeType,
      currencyCode: Type.String({ description: "Currency code" }),
      expiry: Type.Optional(
        Type.String({ description: "Instrument expiry" })
      ),
      level: Type.Optional(
        Type.Number({ description: "Deal level" })
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request(
        "POST",
        "/indicativecostsandcharges/open",
        { version: "1", body: params }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_costs_close - Indicative costs at closing
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_costs_close",
    description:
      "Returns indicative costs and charges for closing a position.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
      direction: DirectionType,
      size: Type.Number({ description: "Deal size" }),
      orderType: OrderTypeType,
      currencyCode: Type.String({ description: "Currency code" }),
      expiry: Type.Optional(
        Type.String({ description: "Instrument expiry" })
      ),
      level: Type.Optional(
        Type.Number({ description: "Deal level" })
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request(
        "POST",
        "/indicativecostsandcharges/close",
        { version: "1", body: params }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_costs_edit - Indicative costs for editing an order
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_costs_edit",
    description:
      "Returns indicative costs and charges for editing an order.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
      direction: DirectionType,
      size: Type.Number({ description: "Deal size" }),
      orderType: OrderTypeType,
      currencyCode: Type.String({ description: "Currency code" }),
      expiry: Type.Optional(
        Type.String({ description: "Instrument expiry" })
      ),
      level: Type.Optional(
        Type.Number({ description: "Deal level" })
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request(
        "POST",
        "/indicativecostsandcharges/edit",
        { version: "1", body: params }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_costs_pdf - Download indicative costs as PDF
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_costs_pdf",
    description:
      "Downloads a previously generated indicative costs and charges quote as a PDF. " +
      "Returns the quote reference info (actual PDF download requires browser).",
    parameters: Type.Object({
      indicativeQuoteReference: Type.String({
        description: "Reference from a previous costs request",
      }),
    }),
    async execute(_id, params) {
      const { indicativeQuoteReference } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/indicativecostsandcharges/durablemedium/${indicativeQuoteReference}`,
        { version: "1" }
      );
      return {
        content: [
          {
            type: "text",
            text:
              typeof result === "string"
                ? `PDF data returned (${result.length} bytes). Save to file to view.`
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_costs_history - Cost and charges history by date range
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_costs_history",
    description:
      "Returns indicative costs and charges history for a date range.",
    parameters: Type.Object({
      from: Type.String({ description: "Start date (yyyy-MM-dd)" }),
      to: Type.String({ description: "End date (yyyy-MM-dd)" }),
    }),
    async execute(_id, params) {
      const { from, to } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/indicativecostsandcharges/history/from/${from}/to/${to}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_applications - List client applications
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_applications",
    description: "Returns a list of client-owned API applications.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/operations/application", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_update_application - Update application details
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_update_application",
    description: "Alters the details of a given user application.",
    parameters: Type.Object({
      allowanceAccountOverall: Type.Optional(
        Type.Number({ description: "Overall account allowance" })
      ),
      allowanceAccountTrading: Type.Optional(
        Type.Number({ description: "Trading allowance" })
      ),
      allowanceAccountHistoricalData: Type.Optional(
        Type.Number({ description: "Historical data allowance" })
      ),
      apiKey: Type.Optional(
        Type.String({ description: "API key to update" })
      ),
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal("ENABLED"),
            Type.Literal("DISABLED"),
            Type.Literal("REVOKED"),
          ],
          { description: "Application status" }
        )
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request("PUT", "/operations/application", {
        version: "1",
        body: params,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_disable_application - Disable current API key
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_disable_application",
    description:
      "Disables the current application API key from processing further requests. " +
      "WARNING: The key can only be re-enabled via the IG web platform.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request(
        "PUT",
        "/operations/application/disable",
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_repeat_deal_window - Get repeat deal window status
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_repeat_deal_window",
    description:
      "Returns the current repeat deal window status of the account.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/repeat-dealing-window", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
