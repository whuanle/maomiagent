const FEISHU_OAUTH_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const FEISHU_TENANT_ACCESS_TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";

const FEISHU_EXPIRED_ACCESS_TOKEN_CODES = new Set<number>([
  20006,
]);

const FEISHU_EXPIRED_REFRESH_TOKEN_CODES = new Set<number>([
  20064,
]);

const FEISHU_EXPIRED_ACCESS_TOKEN_MESSAGE_PATTERNS = [
  "access token expired",
  "access token has expired",
  "user access token expired",
  "tenant access token expired",
  "token expired",
  "access token is expired",
  "invalid access token",
  "access token invalid",
  "user access token is invalid",
  "tenant access token is invalid",
  "auth failed",
];

const FEISHU_EXPIRED_REFRESH_TOKEN_MESSAGE_PATTERNS = [
  "refresh token has been revoked",
  "refresh_token has been revoked",
  "refresh token revoked",
  "refresh_token revoked",
  "refresh token expired",
  "refresh_token expired",
  "refresh token can only be used once",
  "a refresh token can only be used once",
];

export type DesktopFeishuOpenApiTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

export type DesktopFeishuTenantAccessToken = {
  tenantAccessToken: string;
  expiresAt: string;
};

type DesktopFeishuOpenApiClientOptions = {
  fetch?: typeof fetch;
  now?: () => Date;
};

type FeishuEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type FeishuOAuthTokenData = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
};

type FeishuTenantAccessTokenData = {
  tenant_access_token?: string;
  expire?: number;
};

type FeishuErrorEnvelope = {
  code?: number;
  msg?: string;
};

type TokenMappingOptions = {
  requireRefreshToken: boolean;
};

export class DesktopFeishuOpenApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly responseText?: string;

  constructor(input: {
    message: string;
    status: number;
    code?: number;
    responseText?: string;
  }) {
    super(input.message);
    this.name = "DesktopFeishuOpenApiError";
    this.status = input.status;
    this.code = input.code;
    this.responseText = input.responseText;
  }
}

function normalizeFeishuErrorMessage(error: unknown): string {
  if (error instanceof DesktopFeishuOpenApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isDesktopFeishuAccessTokenExpiredError(error: unknown): boolean {
  if (error instanceof DesktopFeishuOpenApiError && error.code != null && FEISHU_EXPIRED_ACCESS_TOKEN_CODES.has(error.code)) {
    return true;
  }

  const normalizedMessage = normalizeFeishuErrorMessage(error).toLowerCase();
  if (normalizedMessage.includes("20006")) {
    return true;
  }

  return FEISHU_EXPIRED_ACCESS_TOKEN_MESSAGE_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

export function isDesktopFeishuRefreshTokenExpiredError(error: unknown): boolean {
  if (error instanceof DesktopFeishuOpenApiError && error.code != null && FEISHU_EXPIRED_REFRESH_TOKEN_CODES.has(error.code)) {
    return true;
  }

  const normalizedMessage = normalizeFeishuErrorMessage(error).toLowerCase();
  if (normalizedMessage.includes("20064")) {
    return true;
  }

  return FEISHU_EXPIRED_REFRESH_TOKEN_MESSAGE_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

function parseFeishuErrorEnvelope(text: string): FeishuErrorEnvelope | null {
  if (!text.trim()) {
    return null;
  }

  try {
    const value = JSON.parse(text) as FeishuErrorEnvelope;
    return typeof value === "object" && value ? value : null;
  } catch {
    return null;
  }
}

export class DesktopFeishuOpenApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: DesktopFeishuOpenApiClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async exchangeOAuthCode(input: {
    appId: string;
    appSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<DesktopFeishuOpenApiTokens> {
    const data = await this.postOAuthTokenJson({
      grant_type: "authorization_code",
      client_id: input.appId,
      client_secret: input.appSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    });

    return this.toTokens(data, { requireRefreshToken: false });
  }

  async refreshUserAccessToken(input: {
    appId: string;
    appSecret: string;
    refreshToken: string;
  }): Promise<DesktopFeishuOpenApiTokens> {
    const data = await this.postOAuthTokenJson({
      grant_type: "refresh_token",
      client_id: input.appId,
      client_secret: input.appSecret,
      refresh_token: input.refreshToken,
    });

    return this.toTokens(data, { requireRefreshToken: true });
  }

  async getTenantAccessToken(input: {
    appId: string;
    appSecret: string;
  }): Promise<DesktopFeishuTenantAccessToken> {
    const envelope = await this.readJsonEnvelope<FeishuTenantAccessTokenData>(await this.fetchImpl(
      FEISHU_TENANT_ACCESS_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          app_id: input.appId,
          app_secret: input.appSecret,
        }),
      },
    ));
    const data = envelope.data ?? (envelope as FeishuTenantAccessTokenData);
    if (!data.tenant_access_token || data.expire == null) {
      throw new Error("Feishu API response missing tenant access token data");
    }

    return {
      tenantAccessToken: data.tenant_access_token,
      expiresAt: new Date(this.now().getTime() + data.expire * 1000).toISOString(),
    };
  }

  async getJson<T>(url: string, accessToken: string): Promise<T> {
    return this.readEnvelope<T>(await this.fetchImpl(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    }));
  }

  async postAuthorizedJson<T>(url: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
    return this.readEnvelope<T>(await this.fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    }));
  }

  private async postOAuthTokenJson(body: Record<string, string>): Promise<FeishuOAuthTokenData> {
    const response = await this.fetchImpl(FEISHU_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    const envelope = await this.readJsonEnvelope<FeishuOAuthTokenData>(response);
    return envelope.data ?? (envelope as FeishuOAuthTokenData);
  }

  private async postJson<T>(url: string, body: Record<string, string>): Promise<T> {
    return this.readEnvelope<T>(await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    }));
  }

  private async readJsonEnvelope<T>(response: Response): Promise<FeishuEnvelope<T> & Partial<T>> {
    const text = await response.text();
    let envelope: FeishuEnvelope<T> & Partial<T>;
    try {
      envelope = JSON.parse(text) as FeishuEnvelope<T> & Partial<T>;
    } catch {
      throw new Error(`Feishu API returned non-JSON response: HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new DesktopFeishuOpenApiError({
        message: `Feishu API HTTP error ${response.status}${envelope.code != null ? ` (code ${envelope.code})` : ""}: ${envelope.msg || response.statusText || "request failed"}`,
        status: response.status,
        code: envelope.code,
        responseText: text,
      });
    }

    const code = envelope.code ?? 0;
    if (code !== 0) {
      throw new DesktopFeishuOpenApiError({
        message: `Feishu API error ${code}: ${envelope.msg || "request failed"}`,
        status: response.status,
        code,
        responseText: text,
      });
    }

    return envelope;
  }

  private async readEnvelope<T>(response: Response): Promise<T> {
    const envelope = await this.readJsonEnvelope<T>(response);

    if (envelope.data == null) {
      throw new Error("Feishu API response missing data");
    }

    return envelope.data;
  }

  private toTokens(data: FeishuOAuthTokenData, options: TokenMappingOptions): DesktopFeishuOpenApiTokens {
    const missingFields = [
      !data.access_token ? "access_token" : "",
      data.expires_in == null ? "expires_in" : "",
      options.requireRefreshToken && !data.refresh_token ? "refresh_token" : "",
      options.requireRefreshToken && data.refresh_expires_in == null ? "refresh_expires_in" : "",
    ].filter(Boolean);

    if (missingFields.length > 0) {
      throw new Error(`Feishu API response missing token data: ${missingFields.join(", ")}`);
    }

    const nowMs = this.now().getTime();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? "",
      accessTokenExpiresAt: new Date(nowMs + data.expires_in * 1000).toISOString(),
      refreshTokenExpiresAt: data.refresh_expires_in == null
        ? ""
        : new Date(nowMs + data.refresh_expires_in * 1000).toISOString(),
    };
  }
}
