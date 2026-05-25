import type { FeishuStateView } from "../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { hydrateDesktopFeishuStateView } from "./desktop-feishu-state-hydrator";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

type DeveloperTokenRefreshDeps = {
  store: DesktopFeishuStorePort;
  openApiClient: Pick<DesktopFeishuOpenApiClient, "refreshUserAccessToken">;
  now?: () => Date;
  forceRefresh?: boolean;
};

function getTime(value: string): number | null {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function hasFreshAccessToken(snapshot: DesktopFeishuStoreSnapshot, nowMs: number): boolean {
  if (!snapshot.developerToken.accessToken) {
    return false;
  }

  const expiresAt = getTime(snapshot.developerToken.accessTokenExpiresAt);
  return expiresAt == null || expiresAt - nowMs > ACCESS_TOKEN_REFRESH_SKEW_MS;
}

function readDeveloperCredentials(snapshot: DesktopFeishuStoreSnapshot): {
  appId: string;
  appSecret: string;
  refreshToken: string;
} {
  return {
    appId: snapshot.state.developer?.appId || snapshot.state.smartAssistant.appId || "",
    appSecret: snapshot.developerCredential.appSecret,
    refreshToken: snapshot.developerToken.refreshToken,
  };
}

function applyRefreshFailure(snapshot: DesktopFeishuStoreSnapshot, message: string): void {
  if (snapshot.state.developer) {
    snapshot.state.developer.authStatus = "error";
    snapshot.state.developer.lastError = message;
  }
  snapshot.state.smartAssistant.authStatus = "error";
  snapshot.state.smartAssistant.lastError = message;
}

function applyRefreshSuccess(snapshot: DesktopFeishuStoreSnapshot, refreshedAt: string): void {
  if (snapshot.state.developer) {
    snapshot.state.developer.authStatus = "authorized";
    snapshot.state.developer.hasRefreshToken = true;
    snapshot.state.developer.accessTokenExpiresAt = snapshot.developerToken.accessTokenExpiresAt;
    snapshot.state.developer.refreshTokenExpiresAt = snapshot.developerToken.refreshTokenExpiresAt;
    snapshot.state.developer.lastRefreshedAt = refreshedAt;
    snapshot.state.developer.lastError = undefined;
  }
  snapshot.state.smartAssistant.authStatus = "authorized";
  snapshot.state.smartAssistant.hasRefreshToken = true;
  snapshot.state.smartAssistant.accessTokenExpiresAt = snapshot.developerToken.accessTokenExpiresAt;
  snapshot.state.smartAssistant.refreshTokenExpiresAt = snapshot.developerToken.refreshTokenExpiresAt;
  snapshot.state.smartAssistant.lastRefreshedAt = refreshedAt;
  snapshot.state.smartAssistant.lastError = undefined;
}

export async function ensureDesktopFeishuDeveloperAccessToken(
  deps: DeveloperTokenRefreshDeps,
): Promise<string> {
  const snapshot = await deps.store.read();
  const now = deps.now?.() ?? new Date();
  const nowMs = now.getTime();

  if (!deps.forceRefresh && hasFreshAccessToken(snapshot, nowMs)) {
    return snapshot.developerToken.accessToken;
  }

  const { appId, appSecret, refreshToken } = readDeveloperCredentials(snapshot);
  const refreshExpiresAt = getTime(snapshot.developerToken.refreshTokenExpiresAt);

  try {
    if (!appId || !appSecret || !refreshToken) {
      throw new Error("请先完成飞书授权");
    }
    if (refreshExpiresAt != null && refreshExpiresAt <= nowMs) {
      throw new Error("飞书授权已过期，请重新授权");
    }

    const tokens = await deps.openApiClient.refreshUserAccessToken({
      appId,
      appSecret,
      refreshToken,
    });
    snapshot.developerToken = tokens;
    applyRefreshSuccess(snapshot, now.toISOString());
    await deps.store.write(snapshot);
    return tokens.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    applyRefreshFailure(snapshot, message);
    await deps.store.write(snapshot);
    throw new Error(message);
  }
}

export async function refreshDesktopFeishuDeveloperToken(
  deps: DeveloperTokenRefreshDeps,
): Promise<FeishuStateView> {
  await ensureDesktopFeishuDeveloperAccessToken({
    ...deps,
    forceRefresh: true,
  });
  const snapshot = await deps.store.read();
  return hydrateDesktopFeishuStateView(snapshot.state as FeishuStateView);
}
