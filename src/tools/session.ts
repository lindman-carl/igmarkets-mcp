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

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../types/openclaw.js";
import {
  getClient,
  initClient,
  hasClient,
  type IGClientConfig,
} from "../ig-client.js";

export function registerSessionTools(api: OpenClawPluginApi): void {
  // ---------------------------------------------------------------------------
  // ig_login - Create a trading session (v3 OAuth)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_login",
    description:
      "Create a trading session with IG Markets using OAuth v3 authentication. " +
      "Provide API key, username, and password. Set isDemo=true (default) for demo account. " +
      "Returns session info including account ID and OAuth tokens.",
    parameters: Type.Object({
      apiKey: Type.String({ description: "IG API key" }),
      username: Type.String({ description: "IG username/identifier" }),
      password: Type.String({ description: "IG password" }),
      isDemo: Type.Optional(
        Type.Boolean({
          default: true,
          description: "Use demo environment (default: true for safety)",
        }),
      ),
    }),
    async execute(_id, params) {
      const { apiKey, username, password, isDemo = true } = params;
      const config: IGClientConfig = { apiKey, username, password, isDemo };
      const client = initClient(config);
      const result = await client.login();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_login_v2 - Create session with CST tokens (v2)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_login_v2",
    description:
      "Create a trading session using v2 authentication (CST + X-SECURITY-TOKEN headers). " +
      "Some account types or regions require v2 with encrypted passwords.",
    parameters: Type.Object({
      apiKey: Type.String({ description: "IG API key" }),
      username: Type.String({ description: "IG username/identifier" }),
      password: Type.String({ description: "IG password" }),
      isDemo: Type.Optional(
        Type.Boolean({ default: true, description: "Use demo environment" }),
      ),
      encryptedPassword: Type.Optional(
        Type.Boolean({
          default: false,
          description: "Whether the password is encrypted",
        }),
      ),
    }),
    async execute(_id, params) {
      const {
        apiKey,
        username,
        password,
        isDemo = true,
        encryptedPassword = false,
      } = params;
      const config: IGClientConfig = { apiKey, username, password, isDemo };
      const client = initClient(config);
      const result = await client.loginV2(encryptedPassword);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_logout - Log out of current session
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_logout",
    description: "Log out of the current IG trading session.",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      await client.logout();
      return {
        content: [{ type: "text", text: "Successfully logged out." }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_session_details - Get current session details
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_session_details",
    description:
      "Returns the current session details including account ID, client ID, currency, " +
      "timezone offset, and Lightstreamer endpoint.",
    parameters: Type.Object({
      fetchSessionTokens: Type.Optional(
        Type.Boolean({
          default: false,
          description: "Whether to fetch session token headers",
        }),
      ),
    }),
    async execute(_id, params) {
      const { fetchSessionTokens = false } = params;
      const client = getClient();
      const queryParams: Record<string, string> = {};
      if (fetchSessionTokens) {
        queryParams.fetchSessionTokens = "true";
      }
      const result = await client.request("GET", "/session", {
        version: "1",
        params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_switch_account - Switch active account
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_switch_account",
    description:
      "Switch the active account. Optionally set the new account as the default.",
    parameters: Type.Object({
      accountId: Type.String({ description: "The account ID to switch to" }),
      defaultAccount: Type.Optional(
        Type.Boolean({ description: "Set as default account" }),
      ),
    }),
    async execute(_id, params) {
      const { accountId, defaultAccount } = params;
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
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_refresh_token - Refresh OAuth session tokens
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_refresh_token",
    description:
      "Refresh the OAuth access token using the current refresh token (v3 auth only).",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.refreshSession();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_encryption_key - Get session encryption key
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_encryption_key",
    description:
      "Get the encryption key for encrypting passwords. Required for some regions (e.g. Singapore).",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const client = getClient();
      const result = await client.request("GET", "/session/encryptionKey", {
        version: "1",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  });

  // ---------------------------------------------------------------------------
  // ig_session_status - Check if logged in (local check)
  // ---------------------------------------------------------------------------
  api.registerTool({
    name: "ig_session_status",
    description:
      "Check if currently authenticated with IG Markets (local check, no API call).",
    parameters: Type.Object({}),
    async execute(_id, _params) {
      const authenticated = hasClient() && getClient().isAuthenticated();
      const info = hasClient() ? getClient().getSessionInfo() : null;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                authenticated,
                accountId: info?.accountId ?? null,
                clientId: info?.clientId ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });
}
