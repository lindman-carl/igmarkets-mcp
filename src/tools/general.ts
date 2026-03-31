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

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../ig-client.js";

export function registerGeneralTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_costs_open - Indicative costs at opening
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_costs_open",
    {
      title: "IG Costs (Open)",
      description:
        "Returns indicative costs and charges for opening a position. " +
        "Supported for EU regulated entities.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
        direction: z.enum(["BUY", "SELL"]).describe("Direction"),
        size: z.number().describe("Deal size"),
        orderType: z.enum(["MARKET", "LIMIT", "QUOTE"]).describe("Order type"),
        currencyCode: z.string().describe("Currency code"),
        expiry: z.string().optional().describe("Instrument expiry"),
        level: z.number().optional().describe("Deal level"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("POST", "/indicativecostsandcharges/open", {
        version: "1",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_costs_close - Indicative costs at closing
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_costs_close",
    {
      title: "IG Costs (Close)",
      description: "Returns indicative costs and charges for closing a position.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
        direction: z.enum(["BUY", "SELL"]).describe("Direction"),
        size: z.number().describe("Deal size"),
        orderType: z.enum(["MARKET", "LIMIT", "QUOTE"]).describe("Order type"),
        currencyCode: z.string().describe("Currency code"),
        expiry: z.string().optional().describe("Instrument expiry"),
        level: z.number().optional().describe("Deal level"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("POST", "/indicativecostsandcharges/close", {
        version: "1",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_costs_edit - Indicative costs for editing an order
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_costs_edit",
    {
      title: "IG Costs (Edit)",
      description: "Returns indicative costs and charges for editing an order.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
        direction: z.enum(["BUY", "SELL"]).describe("Direction"),
        size: z.number().describe("Deal size"),
        orderType: z.enum(["MARKET", "LIMIT", "QUOTE"]).describe("Order type"),
        currencyCode: z.string().describe("Currency code"),
        expiry: z.string().optional().describe("Instrument expiry"),
        level: z.number().optional().describe("Deal level"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("POST", "/indicativecostsandcharges/edit", {
        version: "1",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_costs_pdf - Download indicative costs as PDF
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_costs_pdf",
    {
      title: "IG Costs PDF",
      description:
        "Downloads a previously generated indicative costs and charges quote as a PDF. " +
        "Returns the quote reference info (actual PDF download requires browser).",
      inputSchema: {
        indicativeQuoteReference: z
          .string()
          .describe("Reference from a previous costs request"),
      },
    },
    async ({ indicativeQuoteReference }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/indicativecostsandcharges/durablemedium/${indicativeQuoteReference}`,
        { version: "1" }
      );
      return {
        content: [
          {
            type: "text" as const,
            text:
              typeof result === "string"
                ? `PDF data returned (${result.length} bytes). Save to file to view.`
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_costs_history - Cost and charges history by date range
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_costs_history",
    {
      title: "IG Costs History",
      description: "Returns indicative costs and charges history for a date range.",
      inputSchema: {
        from: z.string().describe("Start date (yyyy-MM-dd)"),
        to: z.string().describe("End date (yyyy-MM-dd)"),
      },
    },
    async ({ from, to }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/indicativecostsandcharges/history/from/${from}/to/${to}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_applications - List client applications
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_applications",
    {
      title: "IG List Applications",
      description: "Returns a list of client-owned API applications.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/operations/application", {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_update_application - Update application details
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_update_application",
    {
      title: "IG Update Application",
      description: "Alters the details of a given user application.",
      inputSchema: {
        allowanceAccountOverall: z.number().optional().describe("Overall account allowance"),
        allowanceAccountTrading: z.number().optional().describe("Trading allowance"),
        allowanceAccountHistoricalData: z
          .number()
          .optional()
          .describe("Historical data allowance"),
        apiKey: z.string().optional().describe("API key to update"),
        status: z.enum(["ENABLED", "DISABLED", "REVOKED"]).optional().describe("Application status"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("PUT", "/operations/application", {
        version: "1",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_disable_application - Disable current API key
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_disable_application",
    {
      title: "IG Disable Application",
      description:
        "Disables the current application API key from processing further requests. " +
        "WARNING: The key can only be re-enabled via the IG web platform.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("PUT", "/operations/application/disable", {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_repeat_deal_window - Get repeat deal window status
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_repeat_deal_window",
    {
      title: "IG Repeat Deal Window",
      description: "Returns the current repeat deal window status of the account.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/repeat-dealing-window", {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
