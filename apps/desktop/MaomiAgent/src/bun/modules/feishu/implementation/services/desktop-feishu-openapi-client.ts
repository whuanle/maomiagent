const FEISHU_OAUTH_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";

export type DesktopFeishuOpenApiTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
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

type TokenMappingOptions = {
  requireRefreshToken: boolean;
};

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

  async getJson<T>(url: string, accessToken: string): Promise<T> {
    return this.readEnvelope<T>(await this.fetchImpl(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
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
      throw new Error(`Feishu API HTTP error ${response.status}: ${envelope.msg || response.statusText || "request failed"}`);
    }

    const code = envelope.code ?? 0;
    if (code !== 0) {
      throw new Error(`Feishu API error ${code}: ${envelope.msg || "request failed"}`);
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