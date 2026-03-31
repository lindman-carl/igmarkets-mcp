/**
 * Session tools - Login, logout, refresh, switch account, encryption key
 *
 * IG API endpoints:
 *   POST   /session          (v1, v2, v3) - Create session
 *   GET    /session          (v1)         - Get session details
 *   DELETE /session          (v1)         - Logout
 *   PUT    /session          (v1)         - Switch account
 *   GET    /session/encryptionKey (v1)    - Get encryption key
 *   POST   /session/refresh-token (v1)    - Refresh OAuth token
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient, hasClient, type IGClientConfig } from "../ig-client.js";

export function registerSessionTools(server: McpServer): void {
  // ---------------------------------------------------------------------------
  // ig_login - Create a trading session (v3 OAuth)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_login",
    {
      title: "IG Login",
      description:
        "Create a trading session with IG Markets using OAuth v3 authentication. " +
        "Provide API key, username, and password. Set isDemo=true (default) for demo account. " +
        "Returns session info including account ID and OAuth tokens.",
      inputSchema: {
        apiKey: z.string().describe("IG API key"),
        username: z.string().describe("IG username/identifier"),
        password: z.string().describe("IG password"),
        isDemo: z
          .boolean()
          .optional()
          .default(true)
          .describe("Use demo environment (default: true for safety)"),
      },
    },
    async ({ apiKey, username, password, isDemo }) => {
      const config: IGClientConfig = { apiKey, username, password, isDemo };
      const client = initClient(config);
      const result = await client.login();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_login_v2 - Create session with CST tokens (v2)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_login_v2",
    {
      title: "IG Login (v2 CST)",
      description:
        "Create a trading session using v2 authentication (CST + X-SECURITY-TOKEN headers). " +
        "Some account types or regions require v2 with encrypted passwords.",
      inputSchema: {
        apiKey: z.string().describe("IG API key"),
        username: z.string().describe("IG username/identifier"),
        password: z.string().describe("IG password"),
        isDemo: z.boolean().optional().default(true).describe("Use demo environment"),
        encryptedPassword: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether the password is encrypted"),
      },
    },
    async ({ apiKey, username, password, isDemo, encryptedPassword }) => {
      const config: IGClientConfig = { apiKey, username, password, isDemo };
      const client = initClient(config);
      const result = await client.loginV2(encryptedPassword);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_logout - Log out of current session
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_logout",
    {
      title: "IG Logout",
      description: "Log out of the current IG trading session.",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      await client.logout();
      return {
        content: [{ type: "text" as const, text: "Successfully logged out." }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_session_details - Get current session details
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_session_details",
    {
      title: "IG Session Details",
      description:
        "Returns the current session details including account ID, client ID, currency, " +
        "timezone offset, and Lightstreamer endpoint.",
      inputSchema: {
        fetchSessionTokens: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to fetch session token headers"),
      },
    },
    async ({ fetchSessionTokens }) => {
      const client = getClient();
      const params: Record<string, string> = {};
      if (fetchSessionTokens) {
        params.fetchSessionTokens = "true";
      }
      const result = await client.request("GET", "/session", {
        version: "1",
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_switch_account - Switch active account
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_switch_account",
    {
      title: "IG Switch Account",
      description:
        "Switch the active account. Optionally set the new account as the default.",
      inputSchema: {
        accountId: z.string().describe("The account ID to switch to"),
        defaultAccount: z
          .boolean()
          .optional()
          .describe("Set as default account"),
      },
    },
    async ({ accountId, defaultAccount }) => {
      const client = getClient();
      const body: Record<string, unknown> = { accountId };
      if (defaultAccount !== undefined) {
        body.defaultAccount = defaultAccount;
      }
      const result = await client.request("PUT", "/session", {
        version: "1",
        body,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_refresh_token - Refresh OAuth session tokens
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_refresh_token",
    {
      title: "IG Refresh Token",
      description: "Refresh the OAuth access token using the current refresh token (v3 auth only).",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.refreshSession();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_encryption_key - Get session encryption key
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_encryption_key",
    {
      title: "IG Encryption Key",
      description:
        "Get the encryption key for encrypting passwords. Required for some regions (e.g. Singapore).",
      inputSchema: {},
    },
    async () => {
      const client = getClient();
      const result = await client.request("GET", "/session/encryptionKey", {
        version: "1",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // ig_session_status - Check if logged in (local check)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "ig_session_status",
    {
      title: "IG Session Status",
      description: "Check if currently authenticated with IG Markets (local check, no API call).",
      inputSchema: {},
    },
    async () => {
      const authenticated = hasClient() && getClient().isAuthenticated();
      const info = hasClient() ? getClient().getSessionInfo() : null;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                authenticated,
                accountId: info?.accountId ?? null,
                clientId: info?.clientId ?? null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
