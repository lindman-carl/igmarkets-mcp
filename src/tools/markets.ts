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

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getClient } from "../ig-client.js";

const ResolutionType = Type.Union(
  [
    Type.Literal("SECOND"),
    Type.Literal("MINUTE"),
    Type.Literal("MINUTE_2"),
    Type.Literal("MINUTE_3"),
    Type.Literal("MINUTE_5"),
    Type.Literal("MINUTE_10"),
    Type.Literal("MINUTE_15"),
    Type.Literal("MINUTE_30"),
    Type.Literal("HOUR"),
    Type.Literal("HOUR_2"),
    Type.Literal("HOUR_3"),
    Type.Literal("HOUR_4"),
    Type.Literal("DAY"),
    Type.Literal("WEEK"),
    Type.Literal("MONTH"),
  ],
  { description: "Price resolution" }
);

export function registerMarketsTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_categories - List instrument categories
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_categories",
    description:
      "Returns a list of all categories of instruments enabled for the account.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/categories", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_category_instruments - Instruments in a category
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_category_instruments",
    description: "Returns all instruments for a given category ID.",
    parameters: Type.Object({
      categoryId: Type.String({
        description: "Category ID from ig_categories",
      }),
    }),
    async execute(_id, params) {
      const { categoryId } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/categories/${categoryId}/instruments`,
        { version: "1" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_markets - Get details for multiple markets
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_markets",
    description:
      "Returns details for one or more markets by epic. Provide a comma-separated list of epics.",
    parameters: Type.Object({
      epics: Type.String({
        description:
          "Comma-separated list of instrument epics (e.g. 'IX.D.FTSE.DAILY.IP,CS.D.GBPUSD.TODAY.IP')",
      }),
    }),
    async execute(_id, params) {
      const { epics } = params;
      const client = getClient();
      const result = await client.request("GET", "/markets", {
        version: "2",
        params: { epics },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_market - Get details for a single market
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_market",
    description:
      "Returns full details for a single market including instrument info, " +
      "dealing rules, snapshot (bid/offer/high/low), and opening hours.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
    }),
    async execute(_id, params) {
      const { epic } = params;
      const client = getClient();
      const result = await client.request("GET", `/markets/${epic}`, {
        version: "3",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_search_markets - Search markets by term
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_search_markets",
    description:
      "Search for markets by a search term (e.g. 'FTSE', 'Apple', 'EUR/USD').",
    parameters: Type.Object({
      searchTerm: Type.String({ description: "Search term" }),
    }),
    async execute(_id, params) {
      const { searchTerm } = params;
      const client = getClient();
      const result = await client.request("GET", "/markets", {
        version: "1",
        params: { searchTerm },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_prices - Historical prices (default: last 10 min, minute resolution)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_prices",
    description:
      "Returns historical prices for an instrument. Defaults to minute prices " +
      "within the last 10 minutes. Use ig_prices_range or ig_prices_points for custom ranges.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
    }),
    async execute(_id, params) {
      const { epic } = params;
      const client = getClient();
      const result = await client.request("GET", `/prices/${epic}`, {
        version: "3",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_prices_points - Prices by resolution and number of data points
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_prices_points",
    description:
      "Returns historical prices for a given epic, resolution, and number of data points. " +
      "Resolution: SECOND, MINUTE, MINUTE_2, MINUTE_3, MINUTE_5, MINUTE_10, MINUTE_15, " +
      "MINUTE_30, HOUR, HOUR_2, HOUR_3, HOUR_4, DAY, WEEK, MONTH.",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
      resolution: ResolutionType,
      numPoints: Type.Number({ description: "Number of data points" }),
    }),
    async execute(_id, params) {
      const { epic, resolution, numPoints } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/prices/${epic}/${resolution}/${numPoints}`,
        { version: "2" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_prices_range - Prices by resolution and date range
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_prices_range",
    description:
      "Returns historical prices for a given epic, resolution, and date range. " +
      "Date format: yyyy-MM-ddTHH:mm:ss (UTC).",
    parameters: Type.Object({
      epic: Type.String({ description: "Instrument epic identifier" }),
      resolution: ResolutionType,
      startDate: Type.String({
        description: "Start date (yyyy-MM-ddTHH:mm:ss)",
      }),
      endDate: Type.String({
        description: "End date (yyyy-MM-ddTHH:mm:ss)",
      }),
    }),
    async execute(_id, params) {
      const { epic, resolution, startDate, endDate } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/prices/${epic}/${resolution}/${startDate}/${endDate}`,
        { version: "2" }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
