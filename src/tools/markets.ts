/**
 * Markets tools - Market details, search, categories, prices
 *
 * IG API endpoints:
 *   GET /categories                          (v1) - List instrument categories
 *   GET /categories/{categoryId}/instruments (v1) - Instruments in category
 *   GET /markets?epics=...                   (v2) - Multiple market details
 *   GET /markets/{epic}                      (v3) - Single market details
 *   GET /markets?searchTerm=...              (v1) - Search markets
 *   GET /prices/{epic}                       (v3) - Historical prices (default)
 *   GET /prices/{epic}/{resolution}/{numPoints}      (v2) - Prices by num points
 *   GET /prices/{epic}/{resolution}/{start}/{end}    (v2) - Prices by date range
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../ig-client.js";

export function registerMarketsTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_categories - List instrument categories
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_categories",
    {
      title: "IG Market Categories",
      description: "Returns a list of all categories of instruments enabled for the account.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/categories", { version: "1" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_category_instruments - Instruments in a category
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_category_instruments",
    {
      title: "IG Category Instruments",
      description: "Returns all instruments for a given category ID.",
      inputSchema: {
        categoryId: z.string().describe("Category ID from ig_categories"),
      },
    },
    async ({ categoryId }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/categories/${categoryId}/instruments`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_markets - Get details for multiple markets
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_markets",
    {
      title: "IG Market Details (Multiple)",
      description:
        "Returns details for one or more markets by epic. Provide a comma-separated list of epics.",
      inputSchema: {
        epics: z
          .string()
          .describe("Comma-separated list of instrument epics (e.g. 'IX.D.FTSE.DAILY.IP,CS.D.GBPUSD.TODAY.IP')"),
      },
    },
    async ({ epics }) => {
      const client = getClient();
      const result = await client.request("GET", "/markets", {
        version: "2",
        params: { epics },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_market - Get details for a single market
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_market",
    {
      title: "IG Market Details",
      description:
        "Returns full details for a single market including instrument info, " +
        "dealing rules, snapshot (bid/offer/high/low), and opening hours.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
      },
    },
    async ({ epic }) => {
      const client = getClient();
      const result = await client.request("GET", `/markets/${epic}`, {
        version: "3",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_search_markets - Search markets by term
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_search_markets",
    {
      title: "IG Search Markets",
      description: "Search for markets by a search term (e.g. 'FTSE', 'Apple', 'EUR/USD').",
      inputSchema: {
        searchTerm: z.string().describe("Search term"),
      },
    },
    async ({ searchTerm }) => {
      const client = getClient();
      const result = await client.request("GET", "/markets", {
        version: "1",
        params: { searchTerm },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_prices - Historical prices (default: last 10 min, minute resolution)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_prices",
    {
      title: "IG Prices",
      description:
        "Returns historical prices for an instrument. Defaults to minute prices " +
        "within the last 10 minutes. Use ig_prices_range or ig_prices_points for custom ranges.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
      },
    },
    async ({ epic }) => {
      const client = getClient();
      const result = await client.request("GET", `/prices/${epic}`, {
        version: "3",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_prices_points - Prices by resolution and number of data points
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_prices_points",
    {
      title: "IG Prices (By Points)",
      description:
        "Returns historical prices for a given epic, resolution, and number of data points. " +
        "Resolution: SECOND, MINUTE, MINUTE_2, MINUTE_3, MINUTE_5, MINUTE_10, MINUTE_15, " +
        "MINUTE_30, HOUR, HOUR_2, HOUR_3, HOUR_4, DAY, WEEK, MONTH.",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
        resolution: z
          .enum([
            "SECOND",
            "MINUTE",
            "MINUTE_2",
            "MINUTE_3",
            "MINUTE_5",
            "MINUTE_10",
            "MINUTE_15",
            "MINUTE_30",
            "HOUR",
            "HOUR_2",
            "HOUR_3",
            "HOUR_4",
            "DAY",
            "WEEK",
            "MONTH",
          ])
          .describe("Price resolution"),
        numPoints: z.number().describe("Number of data points"),
      },
    },
    async ({ epic, resolution, numPoints }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/prices/${epic}/${resolution}/${numPoints}`,
        { version: "2" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_prices_range - Prices by resolution and date range
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_prices_range",
    {
      title: "IG Prices (By Date Range)",
      description:
        "Returns historical prices for a given epic, resolution, and date range. " +
        "Date format: yyyy-MM-ddTHH:mm:ss (UTC).",
      inputSchema: {
        epic: z.string().describe("Instrument epic identifier"),
        resolution: z
          .enum([
            "SECOND",
            "MINUTE",
            "MINUTE_2",
            "MINUTE_3",
            "MINUTE_5",
            "MINUTE_10",
            "MINUTE_15",
            "MINUTE_30",
            "HOUR",
            "HOUR_2",
            "HOUR_3",
            "HOUR_4",
            "DAY",
            "WEEK",
            "MONTH",
          ])
          .describe("Price resolution"),
        startDate: z.string().describe("Start date (yyyy-MM-ddTHH:mm:ss)"),
        endDate: z.string().describe("End date (yyyy-MM-ddTHH:mm:ss)"),
      },
    },
    async ({ epic, resolution, startDate, endDate }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/prices/${epic}/${resolution}/${startDate}/${endDate}`,
        { version: "2" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
