/**
 * Client sentiment tools
 *
 * IG API endpoints:
 *   GET /client-sentiment              (v1) - Bulk sentiment by market IDs
 *   GET /client-sentiment/{marketId}   (v1) - Sentiment for a market
 *   GET /client-sentiment/related/{marketId} (v1) - Related market sentiment
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getClient } from "../ig-client.js";

export function registerSentimentTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_client_sentiment_bulk - Get sentiment for multiple markets
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_client_sentiment_bulk",
    description:
      "Returns client sentiment for multiple instruments. Provide comma-separated market IDs.",
    parameters: Type.Object({
      marketIds: Type.String({
        description:
          "Comma-separated market IDs (not epics, use the marketId field from market details)",
      }),
    }),
    async execute(_id, params) {
      const { marketIds } = params;
      const client = getClient();
      const result = await client.request("GET", "/client-sentiment", {
        version: "1",
        params: { marketIds },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_client_sentiment - Get sentiment for a single market
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_client_sentiment",
    description:
      "Returns client sentiment (long/short percentages) for a given instrument's market ID.",
    parameters: Type.Object({
      marketId: Type.String({
        description: "Market ID (from market details, not the epic)",
      }),
    }),
    async execute(_id, params) {
      const { marketId } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/client-sentiment/${marketId}`,
        { version: "1" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_related_sentiment - Related market sentiment
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_related_sentiment",
    description:
      "Returns a list of related market sentiment for a given instrument's market ID.",
    parameters: Type.Object({
      marketId: Type.String({ description: "Market ID" }),
    }),
    async execute(_id, params) {
      const { marketId } = params;
      const client = getClient();
      const result = await client.request(
        "GET",
        `/client-sentiment/related/${marketId}`,
        { version: "1" },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });
}
