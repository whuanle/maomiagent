import {
  mergeDesktopFeishuOAuthScopes,
  normalizeDesktopFeishuRedirectUri,
} from "../../../../../shared/desktop-feishu-oauth";

const DESKTOP_FEISHU_OAUTH_AUTHORIZE_URL =
  "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const DESKTOP_FEISHU_OAUTH_TOKEN_URL =
  "https://open.feishu.cn/open-apis/authen/v2/oauth/token";

type DesktopFeishuOAuthTokenResponse = {
  code?: number;
  msg?: string;
  error?: string;
  error_description?: string;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
};

export type DesktopFeishuOAuthToken = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  tokenType: string;
  scopes: string[];
};

export class DesktopFeishuOAuthError extends Error {
  constructor(
    message: string,
    readonly kind: "provider_rejected" | "transport",
    readonly code?: number,
    readonly errorType?: string,
  ) {
    super(message);
    this.name = "DesktopFeishuOAuthError";
  }
}

export function buildDesktopFeishuAuthorizationUrl(input: {
  appId: string;
  redirectUri?: string;
  state: string;
  scopes: readonly string[];
}): string {
  const url = new URL(DESKTOP_FEISHU_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.appId.trim());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", normalizeDesktopFeishuRedirectUri(input.redirectUri));

  const scopes = mergeDesktopFeishuOAuthScopes(input.scopes);
  if (scopes.length > 0) {
    url.searchParams.set("scope", scopes.join(" "));
  }

  const state = input.state.trim();
  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function exchangeDesktopFeishuAuthorizationCode(input: {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri?: string;
  scopes?: readonly string[];
}): Promise<DesktopFeishuOAuthToken> {
  return requestDesktopFeishuOAuthToken({
    grant_type: "authorization_code",
    client_id: input.appId.trim(),
    client_secret: input.appSecret.trim(),
    code: input.code.trim(),
    redirect_uri: normalizeDesktopFeishuRedirectUri(input.redirectUri),
    ...(input.scopes && input.scopes.length > 0
      ? { scope: mergeDesktopFeishuOAuthScopes(input.scopes).join(" ") }
      : {}),
  });
}

export async function refreshDesktopFeishuAuthorization(input: {
  appId: string;
  appSecret: string;
  refreshToken: string;
  scopes?: readonly string[];
}): Promise<DesktopFeishuOAuthToken> {
  return requestDesktopFeishuOAuthToken({
    grant_type: "refresh_token",
    client_id: input.appId.trim(),
    client_secret: input.appSecret.trim(),
    refresh_token: input.refreshToken.trim(),
    ...(input.scopes && input.scopes.length > 0
      ? { scope: mergeDesktopFeishuOAuthScopes(input.scopes).join(" ") }
      : {}),
  });
}

export function renderDesktopFeishuOAuthCallbackHtml(input: {
  success: boolean;
  message: string;
}): string {
  const title = input.success ? "飞书授权成功" : "飞书授权失败";
  const status = input.success ? "即将关闭" : "请返回应用处理";
  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>${escapeHtml(title)}</title>`,
    "  <style>",
    "    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #f5f7fb; color: #122033; }",
    "    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }",
    "    section { width: min(420px, 100%); padding: 28px; border-radius: 18px; background: #ffffff; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12); }",
    "    h1 { margin: 0 0 12px; font-size: 22px; }",
    "    p { margin: 0 0 8px; line-height: 1.7; font-size: 14px; color: #526277; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <section>",
    `      <h1>${escapeHtml(title)}</h1>`,
    `      <p>${escapeHtml(input.message)}</p>`,
    `      <p>${escapeHtml(status)}</p>`,
    "    </section>",
    "  </main>",
    "  <script>",
    "    window.setTimeout(() => {",
    "      try { window.close(); } catch {}",
    "    }, 900);",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
}

async function requestDesktopFeishuOAuthToken(
  body: Record<string, string>,
): Promise<DesktopFeishuOAuthToken> {
  let response: Response;
  try {
    response = await fetch(DESKTOP_FEISHU_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new DesktopFeishuOAuthError(
      `Failed to reach Feishu OAuth token endpoint: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "transport",
    );
  }

  let payload: DesktopFeishuOAuthTokenResponse;
  try {
    payload = await response.json() as DesktopFeishuOAuthTokenResponse;
  } catch {
    throw new DesktopFeishuOAuthError(
      `Feishu OAuth token endpoint returned an unreadable response (HTTP ${response.status}).`,
      "transport",
    );
  }

  if (!response.ok || payload.code !== 0) {
    throw new DesktopFeishuOAuthError(
      payload.error_description?.trim()
        || payload.msg?.trim()
        || payload.error?.trim()
        || `Feishu OAuth token request failed (HTTP ${response.status}).`,
      "provider_rejected",
      payload.code,
      payload.error,
    );
  }

  const accessToken = payload.access_token?.trim();
  const tokenType = payload.token_type?.trim();
  if (!accessToken || !tokenType || typeof payload.expires_in !== "number") {
    throw new DesktopFeishuOAuthError(
      "Feishu OAuth token response is missing required fields.",
      "provider_rejected",
      payload.code,
      payload.error,
    );
  }

  return {
    accessToken,
    accessTokenExpiresAt: deriveFutureTimestamp(payload.expires_in),
    ...(payload.refresh_token?.trim()
      ? { refreshToken: payload.refresh_token.trim() }
      : {}),
    ...(typeof payload.refresh_token_expires_in === "number"
      ? { refreshTokenExpiresAt: deriveFutureTimestamp(payload.refresh_token_expires_in) }
      : {}),
    tokenType,
    scopes: normalizeScopeList(payload.scope),
  };
}

function normalizeScopeList(value?: string): string[] {
  return [...new Set(
    (value ?? "")
      .split(/\s+/g)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function deriveFutureTimestamp(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
