export const DESKTOP_LOCAL_CONTROL_HOST = "127.0.0.1";
export const DESKTOP_LOCAL_CONTROL_PORT = 35000;
export const DESKTOP_LOCAL_CONTROL_PROTOCOL = "maomiagent.desktop.control.v1";
export const DESKTOP_FEISHU_OAUTH_CALLBACK_PATH = "/desktop/feishu/oauth/callback";

const LEGACY_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function resolveDesktopLocalControlBaseUrl(port = DESKTOP_LOCAL_CONTROL_PORT): string {
  return `http://${DESKTOP_LOCAL_CONTROL_HOST}:${port}`;
}

export function resolveDesktopFeishuOAuthCallbackUrl(port = DESKTOP_LOCAL_CONTROL_PORT): string {
  return `${resolveDesktopLocalControlBaseUrl(port)}${DESKTOP_FEISHU_OAUTH_CALLBACK_PATH}`;
}

function isLegacyDesktopFeishuLoopbackCallbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return LEGACY_LOOPBACK_HOSTS.has(url.hostname)
      && url.pathname === DESKTOP_FEISHU_OAUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}

export function normalizeDesktopFeishuRedirectUri(value?: string | null): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || isLegacyDesktopFeishuLoopbackCallbackUrl(normalized)) {
    return resolveDesktopFeishuOAuthCallbackUrl();
  }

  return normalized;
}

export function resolveDesktopFeishuOAuthCallbackOrigin(value?: string | null): string {
  const redirectUri = normalizeDesktopFeishuRedirectUri(value);

  try {
    return new URL(redirectUri).origin;
  } catch {
    return resolveDesktopLocalControlBaseUrl();
  }
}

export function mergeDesktopFeishuOAuthScopes(scopes: readonly string[]): string[] {
  const normalized = scopes
    .map((item) => item.trim())
    .filter(Boolean);

  if (!normalized.includes("offline_access")) {
    normalized.push("offline_access");
  }

  return [...new Set(normalized)];
}
