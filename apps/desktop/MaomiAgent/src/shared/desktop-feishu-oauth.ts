export const DESKTOP_LOCAL_CONTROL_HOST = "127.0.0.1";
export const DESKTOP_LOCAL_CONTROL_PORT = 35000;
export const DESKTOP_LOCAL_CONTROL_PROTOCOL = "maomiagent.desktop.control.v1";
export const DESKTOP_FEISHU_OAUTH_CALLBACK_PATH = "/desktop/feishu/oauth/callback";
export const DESKTOP_FEISHU_DOC_MEDIA_PREVIEW_PATH = "/desktop/feishu/docs/media";
export const DESKTOP_FEISHU_DOC_WHITEBOARD_PREVIEW_PATH = "/desktop/feishu/docs/whiteboard";
const DESKTOP_LOCAL_CONTROL_PORT_ENV_NAME = "MAOMI_DESKTOP_LOCAL_CONTROL_PORT";

const LEGACY_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

function parseDesktopLocalControlPortValue(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    return null;
  }

  return parsed;
}

function readDesktopLocalControlPortFromEnvironment(): number | null {
  if (typeof process === "undefined" || typeof process.env !== "object" || !process.env) {
    return null;
  }

  return parseDesktopLocalControlPortValue(process.env[DESKTOP_LOCAL_CONTROL_PORT_ENV_NAME]);
}

export function resolveDesktopLocalControlPort(port?: number | null): number {
  if (Number.isInteger(port) && port! > 0 && port! <= 65_535) {
    return port!;
  }

  return readDesktopLocalControlPortFromEnvironment() ?? DESKTOP_LOCAL_CONTROL_PORT;
}

export function resolveDesktopLocalControlBaseUrl(port?: number | null): string {
  return `http://${DESKTOP_LOCAL_CONTROL_HOST}:${resolveDesktopLocalControlPort(port)}`;
}

export function resolveDesktopFeishuOAuthCallbackUrl(port?: number | null): string {
  return `${resolveDesktopLocalControlBaseUrl(port)}${DESKTOP_FEISHU_OAUTH_CALLBACK_PATH}`;
}

export function resolveDesktopFeishuDocMediaPreviewUrl(
  fileToken: string,
  port?: number | null,
): string {
  const url = new URL(
    `${resolveDesktopLocalControlBaseUrl(port)}${DESKTOP_FEISHU_DOC_MEDIA_PREVIEW_PATH}`,
  );
  url.searchParams.set("token", fileToken);
  return url.toString();
}

export function resolveDesktopFeishuDocWhiteboardPreviewUrl(
  whiteboardToken: string,
  port?: number | null,
): string {
  const url = new URL(
    `${resolveDesktopLocalControlBaseUrl(port)}${DESKTOP_FEISHU_DOC_WHITEBOARD_PREVIEW_PATH}`,
  );
  url.searchParams.set("token", whiteboardToken);
  return url.toString();
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

export function normalizeDesktopFeishuRedirectUri(value?: string | null, port?: number | null): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || isLegacyDesktopFeishuLoopbackCallbackUrl(normalized)) {
    return resolveDesktopFeishuOAuthCallbackUrl(port);
  }

  return normalized;
}

export function resolveDesktopFeishuOAuthCallbackOrigin(
  value?: string | null,
  port?: number | null,
): string {
  const redirectUri = normalizeDesktopFeishuRedirectUri(value, port);

  try {
    return new URL(redirectUri).origin;
  } catch {
    return resolveDesktopLocalControlBaseUrl(port);
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
