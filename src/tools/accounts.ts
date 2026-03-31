/**
 * Account tools - Accounts, preferences, activity history, transaction history
 *
 * IG API endpoints:
 *   GET /accounts                    (v1) - List accounts
 *   GET /accounts/preferences        (v1) - Get preferences
 *   PUT /accounts/preferences        (v1) - Update preferences
 *   GET /history/activity            (v3) - Activity history (paged)
 *   GET /history/activity/{from}/{to}           (v1) - Activity by date range
 *   GET /history/activity/{lastPeriod}          (v1) - Activity by period
 *   GET /history/transactions        (v2) - Transaction history (paged)
 *   GET /history/transactions/{type}/{from}/{to}  (v1) - Transactions by type+dates
 *   GET /history/transactions/{type}/{period}     (v1) - Transactions by type+period
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getClient } from "../ig-client.js";

export function registerAccountTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_accounts - List all accounts
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_accounts",
    description:
      "Returns a list of the logged-in client's accounts including balance, type, and status.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/accounts", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_preferences - Get account preferences
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_preferences",
    description:
      "Returns account preferences such as trailing stops enabled.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/accounts/preferences", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_update_preferences - Update account preferences
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_update_preferences",
    description:
      "Updates account preferences. Pass the preference fields you wish to change.",
    parameters: Type.Object({
      trailingStopsEnabled: Type.Optional(
        Type.Boolean({ description: "Enable/disable trailing stops" })
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const result = await client.request("PUT", "/accounts/preferences", {
        version: "1",
        body: params,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_activity_history - Get activity history (v3, paged)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_activity_history",
    description:
      "Returns account activity history with pagination. Supports filtering by date range, " +
      "FIQL filter, and page size. Uses API v3.",
    parameters: Type.Object({
      from: Type.Optional(
        Type.String({ description: "Start date (yyyy-MM-ddTHH:mm:ss)" })
      ),
      to: Type.Optional(
        Type.String({ description: "End date (yyyy-MM-ddTHH:mm:ss)" })
      ),
      detailed: Type.Optional(
        Type.Boolean({ description: "Include detailed activity info" })
      ),
      dealId: Type.Optional(
        Type.String({ description: "Filter by deal ID" })
      ),
      filter: Type.Optional(
        Type.String({ description: "FIQL filter expression" })
      ),
      pageSize: Type.Optional(
        Type.Number({ description: "Page size (default 50, max 500)" })
      ),
      pageNumber: Type.Optional(
        Type.Number({ description: "Page number (1-based)" })
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const queryParams: Record<string, string> = {};
      if (params.from) queryParams.from = params.from;
      if (params.to) queryParams.to = params.to;
      if (params.detailed !== undefined)
        queryParams.detailed = String(params.detailed);
      if (params.dealId) queryParams.dealId = params.dealId;
      if (params.filter) queryParams.filter = params.filter;
      if (params.pageSize) queryParams.pageSize = String(params.pageSize);
      if (params.pageNumber)
        queryParams.pageNumber = String(params.pageNumber);

      const result = await client.request("GET", "/history/activity", {
        version: "3",
        params:
          Object.keys(queryParams).length > 0 ? queryParams : undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_activity_history_range - Activity by date range (v1)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_activity_history_range",
    description:
      "Returns activity history for a specific date range. " +
      "Date format: dd-MM-yyyy. Uses API v1.",
    parameters: Type.Object({
      fromDate: Type.String({ description: "Start date (dd-MM-yyyy)" }),
      toDate: Type.String({ description: "End date (dd-MM-yyyy)" }),
    }),
    async execute(_id, params) {
      const { fromDate, toDate } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/activity/${fromDate}/${toDate}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_activity_history_period - Activity by period (v1)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_activity_history_period",
    description:
      "Returns activity history for the last specified period (e.g. 600000 for 10 minutes). Uses API v1.",
    parameters: Type.Object({
      lastPeriod: Type.String({ description: "Period in milliseconds" }),
    }),
    async execute(_id, params) {
      const { lastPeriod } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/activity/${lastPeriod}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_transaction_history - Transaction history (v2, paged)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_transaction_history",
    description:
      "Returns transaction history with pagination. Supports type filter and date range. Uses API v2.",
    parameters: Type.Object({
      type: Type.Optional(
        Type.Union(
          [
            Type.Literal("ALL"),
            Type.Literal("ALL_DEAL"),
            Type.Literal("DEPOSIT"),
            Type.Literal("WITHDRAWAL"),
          ],
          { description: "Transaction type filter" }
        )
      ),
      from: Type.Optional(
        Type.String({ description: "Start date (yyyy-MM-ddTHH:mm:ss)" })
      ),
      to: Type.Optional(
        Type.String({ description: "End date (yyyy-MM-ddTHH:mm:ss)" })
      ),
      maxSpanSeconds: Type.Optional(
        Type.Number({ description: "Max span in seconds" })
      ),
      pageSize: Type.Optional(
        Type.Number({ description: "Page size" })
      ),
      pageNumber: Type.Optional(
        Type.Number({ description: "Page number" })
      ),
    }),
    async execute(_id, params) {
      const client = getClient();
      const queryParams: Record<string, string> = {};
      if (params.type) queryParams.type = params.type;
      if (params.from) queryParams.from = params.from;
      if (params.to) queryParams.to = params.to;
      if (params.maxSpanSeconds)
        queryParams.maxSpanSeconds = String(params.maxSpanSeconds);
      if (params.pageSize) queryParams.pageSize = String(params.pageSize);
      if (params.pageNumber)
        queryParams.pageNumber = String(params.pageNumber);

      const result = await client.request("GET", "/history/transactions", {
        version: "2",
        params:
          Object.keys(queryParams).length > 0 ? queryParams : undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_transaction_history_range - Transactions by type + date range (v1)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_transaction_history_range",
    description:
      "Returns transaction history for a given type and date range. " +
      "Date format: dd-MM-yyyy. Uses API v1.",
    parameters: Type.Object({
      transactionType: Type.Union(
        [
          Type.Literal("ALL"),
          Type.Literal("ALL_DEAL"),
          Type.Literal("DEPOSIT"),
          Type.Literal("WITHDRAWAL"),
        ],
        { description: "Transaction type" }
      ),
      fromDate: Type.String({ description: "Start date (dd-MM-yyyy)" }),
      toDate: Type.String({ description: "End date (dd-MM-yyyy)" }),
    }),
    async execute(_id, params) {
      const { transactionType, fromDate, toDate } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/transactions/${transactionType}/${fromDate}/${toDate}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_transaction_history_period - Transactions by type + period (v1)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_transaction_history_period",
    description:
      "Returns transaction history for a given type and period. Uses API v1.",
    parameters: Type.Object({
      transactionType: Type.Union(
        [
          Type.Literal("ALL"),
          Type.Literal("ALL_DEAL"),
          Type.Literal("DEPOSIT"),
          Type.Literal("WITHDRAWAL"),
        ],
        { description: "Transaction type" }
      ),
      lastPeriod: Type.String({ description: "Period in milliseconds" }),
    }),
    async execute(_id, params) {
      const { transactionType, lastPeriod } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/history/transactions/${transactionType}/${lastPeriod}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
