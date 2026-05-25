import type { FeishuStateView } from "../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { isDesktopFeishuAccessTokenExpiredError } from "./desktop-feishu-openapi-client";
import { hydrateDesktopFeishuStateView } from "./desktop-feishu-state-hydrator";
import { runDesktopFeishuStoreMutation } from "./desktop-feishu-store-mutation";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
export const DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID = "desktop.feishu.developer-token-auto-refresh";

type DesktopFeishuAutoRefreshTaskState = FeishuStateView["smartAssistant"]["autoRefreshTask"];
type DesktopFeishuAutoRefreshTaskStatus = NonNullable<DesktopFeishuAutoRefreshTaskState["status"]>;

type DeveloperTokenRefreshDeps = {
  store: DesktopFeishuStorePort;
  openApiClient: Pick<DesktopFeishuOpenApiClient, "refreshUserAccessToken">;
  now?: () => Date;
  forceRefresh?: boolean;
};

type DeveloperTokenRetryAttempt = {
  accessToken: string;
  retried: boolean;
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

function resolveDesktopFeishuAutoRefreshTaskNextRunAt(now: Date): string {
  return new Date(now.getTime() + DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_INTERVAL_MS).toISOString();
}

function applyDesktopFeishuAutoRefreshTaskToTarget(
  target: { autoRefreshTask: DesktopFeishuAutoRefreshTaskState },
  task: DesktopFeishuAutoRefreshTaskState,
): void {
  target.autoRefreshTask = { ...task };
}

export function clearDesktopFeishuDeveloperAutoRefreshTask(snapshot: DesktopFeishuStoreSnapshot): void {
  if (snapshot.state.developer) {
    applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.developer, {
      enabled: false,
    });
  }
  applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.smartAssistant, {
    enabled: false,
  });
}

export function scheduleDesktopFeishuDeveloperAutoRefreshTask(
  snapshot: DesktopFeishuStoreSnapshot,
  now: Date,
  status: DesktopFeishuAutoRefreshTaskStatus = "queued",
): void {
  const task: DesktopFeishuAutoRefreshTaskState = {
    taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
    enabled: true,
    status,
    nextRunAt: resolveDesktopFeishuAutoRefreshTaskNextRunAt(now),
  };

  if (snapshot.state.developer) {
    applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.developer, task);
  }
  applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.smartAssistant, task);
}

export function markDesktopFeishuDeveloperAutoRefreshTaskRunning(
  snapshot: DesktopFeishuStoreSnapshot,
  now: Date,
): void {
  const nextRunAt = snapshot.state.smartAssistant.autoRefreshTask.nextRunAt
    || resolveDesktopFeishuAutoRefreshTaskNextRunAt(now);
  const task: DesktopFeishuAutoRefreshTaskState = {
    taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
    enabled: true,
    status: "running",
    nextRunAt,
  };

  if (snapshot.state.developer) {
    applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.developer, task);
  }
  applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.smartAssistant, task);
}

export function failDesktopFeishuDeveloperAutoRefreshTask(
  snapshot: DesktopFeishuStoreSnapshot,
  now: Date,
): void {
  const task: DesktopFeishuAutoRefreshTaskState = {
    taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
    enabled: true,
    status: "failed",
    nextRunAt: resolveDesktopFeishuAutoRefreshTaskNextRunAt(now),
  };

  if (snapshot.state.developer) {
    applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.developer, task);
  }
  applyDesktopFeishuAutoRefreshTaskToTarget(snapshot.state.smartAssistant, task);
}

function applyRefreshFailure(snapshot: DesktopFeishuStoreSnapshot, message: string, failedAt: Date): void {
  if (snapshot.state.developer) {
    snapshot.state.developer.authStatus = "error";
    snapshot.state.developer.lastError = message;
  }
  snapshot.state.smartAssistant.authStatus = "error";
  snapshot.state.smartAssistant.lastError = message;
  failDesktopFeishuDeveloperAutoRefreshTask(snapshot, failedAt);
}

function applyRefreshSuccess(snapshot: DesktopFeishuStoreSnapshot, refreshedAt: string, refreshedAtDate: Date): void {
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
  scheduleDesktopFeishuDeveloperAutoRefreshTask(snapshot, refreshedAtDate, "success");
}

export async function ensureDesktopFeishuDeveloperAccessToken(
  deps: DeveloperTokenRefreshDeps,
): Promise<string> {
  const now = deps.now?.() ?? new Date();
  const nowMs = now.getTime();

  if (!deps.forceRefresh) {
    const snapshot = await deps.store.read();
    if (hasFreshAccessToken(snapshot, nowMs)) {
      return snapshot.developerToken.accessToken;
    }
  }

  return runDesktopFeishuStoreMutation(deps.store, async (snapshot) => {
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
      applyRefreshSuccess(snapshot, now.toISOString(), now);
      return tokens.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      applyRefreshFailure(snapshot, message, now);
      throw new Error(message);
    }
  });
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

export async function withDesktopFeishuDeveloperAccessTokenRetry<T>(
  deps: DeveloperTokenRefreshDeps,
  action: (attempt: DeveloperTokenRetryAttempt) => Promise<T>,
): Promise<T> {
  const accessToken = await ensureDesktopFeishuDeveloperAccessToken(deps);

  try {
    return await action({
      accessToken,
      retried: false,
    });
  } catch (error) {
    if (!isDesktopFeishuAccessTokenExpiredError(error)) {
      throw error;
    }

    const refreshedAccessToken = await ensureDesktopFeishuDeveloperAccessToken({
      ...deps,
      forceRefresh: true,
    });

    return action({
      accessToken: refreshedAccessToken,
      retried: true,
    });
  }
}
