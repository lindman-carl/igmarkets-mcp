/**
 * Account tools - Accounts, preferences, activity history, transaction history
 *
 * IG API endpoints:
 *   GET /accounts                    (v1) - List accounts
 *   GET /accounts/preferences        (v1) - Get preferences
 *   PUT /accounts/preferences        (v1) - Update preferences
 *   GET /history/activity            (v3) - Activity history (paged)
 *   GET /history/activity            (v2) - Activity history (legacy)
 *   GET /history/transactions        (v2) - Transaction history (paged)
 *   GET /history/activity/{from}/{to}           (v1) - Activity by date range
 *   GET /history/activity/{lastPeriod}          (v1) - Activity by period
 *   GET /history/transactions/{type}/{from}/{to}  (v1) - Transactions by type+dates
 *   GET /history/transactions/{type}/{period}     (v1) - Transactions by type+period
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../ig-client.js";

export function registerAccountTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_accounts - List all accounts
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_accounts",
    {
      title: "IG List Accounts",
      description: "Returns a list of the logged-in client's accounts including balance, type, and status.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/accounts", { version: "1" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_preferences - Get account preferences
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_preferences",
    {
      title: "IG Account Preferences",
      description: "Returns account preferences such as trailing stops enabled.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/accounts/preferences", { version: "1" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_update_preferences - Update account preferences
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_update_preferences",
    {
      title: "IG Update Preferences",
      description: "Updates account preferences. Pass the preference fields you wish to change.",
      inputSchema: {
        trailingStopsEnabled: z.boolean().optional().describe("Enable/disable trailing stops"),
      },
    },
    async (args) => {
      const client = getClient();
      const result = await client.request("PUT", "/accounts/preferences", {
        version: "1",
        body: args,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_activity_history - Get activity history (v3, paged)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_activity_history",
    {
      title: "IG Activity History",
      description:
        "Returns account activity history with pagination. Supports filtering by date range, " +
        "FIQL filter, and page size. Uses API v3.",
      inputSchema: {
        from: z.string().optional().describe("Start date (yyyy-MM-ddTHH:mm:ss)"),
        to: z.string().optional().describe("End date (yyyy-MM-ddTHH:mm:ss)"),
        detailed: z.boolean().optional().describe("Include detailed activity info"),
        dealId: z.string().optional().describe("Filter by deal ID"),
        filter: z.string().optional().describe("FIQL filter expression"),
        pageSize: z.number().optional().describe("Page size (default 50, max 500)"),
        pageNumber: z.number().optional().describe("Page number (1-based)"),
      },
    },
    async (args) => {
      const client = getClient();
      const params: Record<string, string> = {};
      if (args.from) params.from = args.from;
      if (args.to) params.to = args.to;
      if (args.detailed !== undefined) params.detailed = String(args.detailed);
      if (args.dealId) params.dealId = args.dealId;
      if (args.filter) params.filter = args.filter;
      if (args.pageSize) params.pageSize = String(args.pageSize);
      if (args.pageNumber) params.pageNumber = String(args.pageNumber);

      const result = await client.request("GET", "/history/activity", {
        version: "3",
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_activity_history_range - Activity by date range (v1)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_activity_history_range",
    {
      title: "IG Activity History (Date Range)",
      description:
        "Returns activity history for a specific date range. " +
        "Date format: dd-MM-yyyy. Uses API v1.",
      inputSchema: {
        fromDate: z.string().describe("Start date (dd-MM-yyyy)"),
        toDate: z.string().describe("End date (dd-MM-yyyy)"),
      },
    },
    async ({ fromDate, toDate }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/activity/${fromDate}/${toDate}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_activity_history_period - Activity by period (v1)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_activity_history_period",
    {
      title: "IG Activity History (Period)",
      description:
        "Returns activity history for the last specified period (e.g. 600000 for 10 minutes). Uses API v1.",
      inputSchema: {
        lastPeriod: z.string().describe("Period in milliseconds"),
      },
    },
    async ({ lastPeriod }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/activity/${lastPeriod}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_transaction_history - Transaction history (v2, paged)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_transaction_history",
    {
      title: "IG Transaction History",
      description:
        "Returns transaction history with pagination. Supports type filter and date range. Uses API v2.",
      inputSchema: {
        type: z
          .enum(["ALL", "ALL_DEAL", "DEPOSIT", "WITHDRAWAL"])
          .optional()
          .describe("Transaction type filter"),
        from: z.string().optional().describe("Start date (yyyy-MM-ddTHH:mm:ss)"),
        to: z.string().optional().describe("End date (yyyy-MM-ddTHH:mm:ss)"),
        maxSpanSeconds: z.number().optional().describe("Max span in seconds"),
        pageSize: z.number().optional().describe("Page size"),
        pageNumber: z.number().optional().describe("Page number"),
      },
    },
    async (args) => {
      const client = getClient();
      const params: Record<string, string> = {};
      if (args.type) params.type = args.type;
      if (args.from) params.from = args.from;
      if (args.to) params.to = args.to;
      if (args.maxSpanSeconds) params.maxSpanSeconds = String(args.maxSpanSeconds);
      if (args.pageSize) params.pageSize = String(args.pageSize);
      if (args.pageNumber) params.pageNumber = String(args.pageNumber);

      const result = await client.request("GET", "/history/transactions", {
        version: "2",
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_transaction_history_range - Transactions by type + date range (v1)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_transaction_history_range",
    {
      title: "IG Transaction History (Date Range)",
      description:
        "Returns transaction history for a given type and date range. " +
        "Date format: dd-MM-yyyy. Uses API v1.",
      inputSchema: {
        transactionType: z
          .enum(["ALL", "ALL_DEAL", "DEPOSIT", "WITHDRAWAL"])
          .describe("Transaction type"),
        fromDate: z.string().describe("Start date (dd-MM-yyyy)"),
        toDate: z.string().describe("End date (dd-MM-yyyy)"),
      },
    },
    async ({ transactionType, fromDate, toDate }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/transactions/${transactionType}/${fromDate}/${toDate}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_transaction_history_period - Transactions by type + period (v1)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_transaction_history_period",
    {
      title: "IG Transaction History (Period)",
      description:
        "Returns transaction history for a given type and period. Uses API v1.",
      inputSchema: {
        transactionType: z
          .enum(["ALL", "ALL_DEAL", "DEPOSIT", "WITHDRAWAL"])
          .describe("Transaction type"),
        lastPeriod: z.string().describe("Period in milliseconds"),
      },
    },
    async ({ transactionType, lastPeriod }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/transactions/${transactionType}/${lastPeriod}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
