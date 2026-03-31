/**
 * Client sentiment tools
 *
 * IG API endpoints:
 *   GET /client-sentiment              (v1) - Bulk sentiment by market IDs
 *   GET /client-sentiment/{marketId}   (v1) - Sentiment for a market
 *   GET /client-sentiment/related/{marketId} (v1) - Related market sentiment
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../ig-client.js";

export function registerSentimentTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_client_sentiment_bulk - Get sentiment for multiple markets
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_client_sentiment_bulk",
    {
      title: "IG Client Sentiment (Bulk)",
      description: "Returns client sentiment for multiple instruments. Provide comma-separated market IDs.",
      inputSchema: {
        marketIds: z
          .string()
          .describe("Comma-separated market IDs (not epics, use the marketId field from market details)"),
      },
    },
    async ({ marketIds }) => {
      const client = getClient();
      const result = await client.request("GET", "/client-sentiment", {
        version: "1",
        params: { marketIds },
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_client_sentiment - Get sentiment for a single market
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_client_sentiment",
    {
      title: "IG Client Sentiment",
      description:
        "Returns client sentiment (long/short percentages) for a given instrument's market ID.",
      inputSchema: {
        marketId: z.string().describe("Market ID (from market details, not the epic)"),
      },
    },
    async ({ marketId }) => {
      const client = getClient();
      const result = await client.request("GET", `/client-sentiment/${marketId}`, {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_related_sentiment - Related market sentiment
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_related_sentiment",
    {
      title: "IG Related Sentiment",
      description: "Returns a list of related market sentiment for a given instrument's market ID.",
      inputSchema: {
        marketId: z.string().describe("Market ID"),
      },
    },
    async ({ marketId }) => {
      const client = getClient();
      const result = await client.request(
        "GET",
        `/client-sentiment/related/${marketId}`,
        { version: "1" }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
