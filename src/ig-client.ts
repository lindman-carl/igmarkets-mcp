/**
 * IG Markets REST API HTTP Client
 *
 * Handles authentication (v3 OAuth + v2 CST/token), session management,
 * automatic token refresh, and versioned API requests.
 *
 * IG API base URLs:
 *   Live: https://api.ig.com/gateway/deal
 *   Demo: https://demo-api.ig.com/gateway/deal
 */

export interface IGClientConfig {
  apiKey: string;
  username: string;
  password: string;
  /** Use demo environment. Defaults to true for safety. */
  isDemo?: boolean;
}

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  token_type: string;
  scope: string;
}

interface SessionState {
  /** CST header token (v1/v2 auth) */
  cst?: string;
  /** X-SECURITY-TOKEN header (v1/v2 auth) */
  securityToken?: string;
  /** OAuth tokens (v3 auth) */
  oauth?: OAuthTokens;
  accountId?: string;
  clientId?: string;
  lightstreamerEndpoint?: string;
  timezoneOffset?: number;
}

export class IGClient {
  private config: IGClientConfig;
  private session: SessionState = {};
  private baseUrl: string;

  constructor(config: IGClientConfig) {
    this.config = config;
    const isDemo = config.isDemo ?? true;
    this.baseUrl = isDemo
      ? "https://demo-api.ig.com/gateway/deal"
      : "https://api.ig.com/gateway/deal";
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /**
   * Login using v3 (OAuth) session creation.
   * Returns full session info including OAuth tokens.
   */
  async login(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-IG-API-KEY": this.config.apiKey,
        VERSION: "3",
      },
      body: JSON.stringify({
        identifier: this.config.username,
        password: this.config.password,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Login failed (${res.status}): ${body}`);
    }

    const data = await res.json();

    this.session = {
      oauth: data.oauthToken,
      accountId: data.accountId,
      clientId: data.clientId,
      lightstreamerEndpoint: data.lightstreamerEndpoint,
      timezoneOffset: data.timezoneOffset,
    };

    return data;
  }

  /**
   * Login using v2 session creation (CST + security token headers).
   * Some endpoints or account types may require this.
   */
  async loginV2(encryptedPassword = false): Promise<any> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-IG-API-KEY": this.config.apiKey,
        VERSION: "2",
      },
      body: JSON.stringify({
        identifier: this.config.username,
        password: this.config.password,
        encryptedPassword,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Login v2 failed (${res.status}): ${body}`);
    }

    const data = await res.json();

    this.session = {
      cst: res.headers.get("CST") ?? undefined,
      securityToken: res.headers.get("X-SECURITY-TOKEN") ?? undefined,
      accountId: data.currentAccountId,
      clientId: data.clientId,
      lightstreamerEndpoint: data.lightstreamerEndpoint,
      timezoneOffset: data.timezoneOffset,
    };

    return data;
  }

  /**
   * Refresh OAuth tokens.
   */
  async refreshSession(): Promise<any> {
    if (!this.session.oauth?.refresh_token) {
      throw new Error("No refresh token available. Login first using v3.");
    }

    const res = await fetch(`${this.baseUrl}/session/refresh-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-IG-API-KEY": this.config.apiKey,
        VERSION: "1",
      },
      body: JSON.stringify({
        refresh_token: this.session.oauth.refresh_token,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Token refresh failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    this.session.oauth = data;
    return data;
  }

  /**
   * Logout current session.
   */
  async logout(): Promise<void> {
    await this.request("DELETE", "/session", { version: "1" });
    this.session = {};
  }

  // ---------------------------------------------------------------------------
  // Generic request
  // ---------------------------------------------------------------------------

  /**
   * Make an authenticated request to the IG API.
   *
   * @param method    HTTP method
   * @param path      API path (e.g. "/positions")
   * @param options   Request options
   */
  async request(
    method: string,
    path: string,
    options: {
      version?: string;
      body?: unknown;
      params?: Record<string, string>;
    } = {}
  ): Promise<any> {
    const { version = "1", body, params } = options;

    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json; charset=UTF-8",
      "X-IG-API-KEY": this.config.apiKey,
      VERSION: version,
    };

    // Add auth headers
    if (this.session.oauth?.access_token) {
      headers["Authorization"] = `Bearer ${this.session.oauth.access_token}`;
    }
    if (this.session.cst) {
      headers["CST"] = this.session.cst;
    }
    if (this.session.securityToken) {
      headers["X-SECURITY-TOKEN"] = this.session.securityToken;
    }

    // IG's DELETE endpoints accept body via _method override
    let actualMethod = method;
    let actualBody = body;
    if (method === "DELETE" && body) {
      actualMethod = "POST";
      headers["_method"] = "DELETE";
      actualBody = body;
    }

    const res = await fetch(url, {
      method: actualMethod,
      headers,
      body: actualBody ? JSON.stringify(actualBody) : undefined,
    });

    // Update CST/security token if returned in headers
    const newCst = res.headers.get("CST");
    const newSecurity = res.headers.get("X-SECURITY-TOKEN");
    if (newCst) this.session.cst = newCst;
    if (newSecurity) this.session.securityToken = newSecurity;

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`IG API error ${res.status} ${method} ${path}: ${errorBody}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return res.json();
    }

    // Some endpoints return no body (e.g. DELETE /session)
    const text = await res.text();
    return text || null;
  }

  // ---------------------------------------------------------------------------
  // State accessors
  // ---------------------------------------------------------------------------

  isAuthenticated(): boolean {
    return !!(this.session.oauth?.access_token || this.session.cst);
  }

  getAccountId(): string | undefined {
    return this.session.accountId;
  }

  getSessionInfo(): SessionState {
    return { ...this.session };
  }
}

// Singleton instance, configured at startup
let client: IGClient | null = null;

export function getClient(): IGClient {
  if (!client) {
    throw new Error(
      "IG client not initialized. Use the ig_login tool first, or set " +
        "IG_API_KEY, IG_USERNAME, IG_PASSWORD environment variables."
    );
  }
  return client;
}

export function initClient(config: IGClientConfig): IGClient {
  client = new IGClient(config);
  return client;
}

export function hasClient(): boolean {
  return client !== null;
}
