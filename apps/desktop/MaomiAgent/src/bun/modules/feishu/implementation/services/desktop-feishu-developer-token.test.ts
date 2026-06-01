import { describe, expect, test } from "bun:test";

import type { FeishuBotStateView, FeishuStateView } from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import {
  DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
  ensureDesktopFeishuDeveloperAccessToken,
  shouldRunDesktopFeishuDeveloperAutoRefreshTask,
  withDesktopFeishuDeveloperAccessTokenRetry,
} from "./desktop-feishu-developer-token";
import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";

function createState(): FeishuStateView {
  return {
    personalDocs: {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    },
    smartAssistant: {
      enabled: true,
      appId: "cli_test_app",
      hasAppSecret: true,
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
      redirectOrigin: "http://127.0.0.1:35000",
      authStatus: "authorized",
      authMethod: "oauth",
      hasRefreshToken: true,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
      docsMcp: null,
      runtimePolicy: {
        controlPlane: "ready",
        domainMounting: "lazy_by_domain",
        actionExecution: "registry_first",
      },
      connectionProfiles: [],
      domainModels: [],
      contextTemplates: [],
      policyItems: [],
      domains: [],
      actions: [],
    },
    mode: "developer",
    personal: null,
    developer: {
      appId: "cli_test_app",
      hasAppSecret: true,
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
      redirectOrigin: "http://127.0.0.1:35000",
      authStatus: "authorized",
      authMethod: "oauth",
      hasRefreshToken: true,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
    },
    managedMcp: null,
    docs: {
      personal: "https://open.feishu.cn",
      developer: "https://open.feishu.cn",
      authorize: "https://open.feishu.cn",
      token: "https://open.feishu.cn",
      refreshToken: "https://open.feishu.cn",
    },
    catalog: {
      developerScopes: [],
      developerTenantScopes: [],
      developerAllowedTools: [],
      supportedTools: [],
    },
  };
}

function createBotState(): FeishuBotStateView {
  return {
    enabled: false,
    appId: "",
    hasAppSecret: false,
    hasVerificationToken: false,
    hasEncryptKey: false,
    transportMode: "websocket",
    catalog: {
      transportMode: "websocket",
      descriptors: [],
    },
    connectionStatus: "disconnected",
    sessionMappingCount: 0,
    processedMessageCount: 0,
    queuedConversationCount: 0,
    recentProcessedMessages: [],
    updatedAt: "2026-05-22T00:00:00.000Z",
  };
}

function createSnapshot(overrides: Partial<DesktopFeishuStoreSnapshot["developerToken"]> = {}): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
    botRuntime: {
      version: "1.0",
      bindings: [],
      processedMessages: [],
      pendingActions: [],
    },
    docs: {},
    developerCredential: {
      appSecret: "secret-1",
    },
    developerToken: {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      accessTokenExpiresAt: "2026-05-22T01:00:00.000Z",
      refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
      ...overrides,
    },
    docTreeCache: {
      lastRootToken: "",
      lastRootUpdatedAt: "",
      roots: {},
      branches: {},
      contents: {},
    },
  };
}

function cloneSnapshot(snapshot: DesktopFeishuStoreSnapshot): DesktopFeishuStoreSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DesktopFeishuStoreSnapshot;
}

function createStore(snapshot: DesktopFeishuStoreSnapshot) {
  let current = cloneSnapshot(snapshot);
  return {
    read: async () => cloneSnapshot(current),
    write: async (next: DesktopFeishuStoreSnapshot) => {
      current = cloneSnapshot(next);
    },
    mutate: async <T>(mutator: (next: DesktopFeishuStoreSnapshot) => Promise<T> | T) => {
      const next = cloneSnapshot(current);
      const result = await mutator(next);
      current = cloneSnapshot(next);
      return result;
    },
    snapshot: () => cloneSnapshot(current),
  };
}

function createDeferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve: (value: T | PromiseLike<T>) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

describe("ensureDesktopFeishuDeveloperAccessToken", () => {
  test("returns the stored access token when it is not close to expiring", async () => {
    const store = createStore(createSnapshot());
    let refreshCalls = 0;

    const token = await ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async () => {
          refreshCalls += 1;
          throw new Error("should not refresh");
        },
      },
    });

    expect(token).toBe("old-access");
    expect(refreshCalls).toBe(0);
  });

  test("refreshes and stores a new access token before expiry", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:03:00.000Z",
    }));

    const token = await ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async (input) => {
          expect(input).toEqual({
            appId: "cli_test_app",
            appSecret: "secret-1",
            refreshToken: "old-refresh",
          });
          return {
            accessToken: "new-access",
            refreshToken: "new-refresh",
            accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
            refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
          };
        },
      },
    });

    expect(token).toBe("new-access");
    expect(store.snapshot().developerToken.accessToken).toBe("new-access");
    expect(store.snapshot().developerToken.refreshToken).toBe("new-refresh");
    expect(store.snapshot().state.smartAssistant.accessTokenExpiresAt).toBe("2026-05-22T02:00:00.000Z");
    expect(store.snapshot().state.smartAssistant.lastRefreshedAt).toBe("2026-05-22T00:00:00.000Z");
    expect(store.snapshot().state.smartAssistant.lastError).toBeUndefined();
    expect(store.snapshot().state.smartAssistant.autoRefreshTask).toMatchObject({
      taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
      enabled: true,
      status: "success",
      nextRunAt: "2026-05-22T01:55:00.000Z",
    });
  });

  test("persists the rotated refresh token even when refresh_expires_in is omitted", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:03:00.000Z",
      refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
    }));

    const token = await ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async () => ({
          accessToken: "new-access",
          refreshToken: "new-refresh",
          accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
          refreshTokenExpiresAt: "",
        }),
      },
    });

    expect(token).toBe("new-access");
    expect(store.snapshot().developerToken).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
      refreshTokenExpiresAt: "",
    });
    expect(store.snapshot().state.smartAssistant.authStatus).toBe("authorized");
    expect(store.snapshot().state.smartAssistant.hasRefreshToken).toBe(true);
    expect(store.snapshot().state.smartAssistant.lastError).toBeUndefined();
  });

  test("deduplicates concurrent forced refresh requests and reuses the rotated refresh token", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:00:00.000Z",
    }));
    const gate = createDeferred<void>();
    let refreshCalls = 0;

    const first = ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      forceRefresh: true,
      openApiClient: {
        refreshUserAccessToken: async () => {
          refreshCalls += 1;
          await gate.promise;
          return {
            accessToken: "new-access",
            refreshToken: "new-refresh",
            accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
            refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
          };
        },
      },
    });
    const second = ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      forceRefresh: true,
      openApiClient: {
        refreshUserAccessToken: async () => {
          refreshCalls += 1;
          return {
            accessToken: "unexpected-access",
            refreshToken: "unexpected-refresh",
            accessTokenExpiresAt: "2026-05-22T03:00:00.000Z",
            refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
          };
        },
      },
    });

    gate.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual(["new-access", "new-access"]);
    expect(refreshCalls).toBe(1);
    expect(store.snapshot().developerToken.refreshToken).toBe("new-refresh");
  });

  test("reuses a just-refreshed access token during the forced refresh cooldown window", async () => {
    const snapshot = createSnapshot({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
      refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
    });
    snapshot.state.smartAssistant.lastRefreshedAt = "2026-05-22T00:00:10.000Z";
    if (snapshot.state.developer) {
      snapshot.state.developer.lastRefreshedAt = "2026-05-22T00:00:10.000Z";
    }
    const store = createStore(snapshot);
    let refreshCalls = 0;

    const token = await ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:20.000Z"),
      forceRefresh: true,
      openApiClient: {
        refreshUserAccessToken: async () => {
          refreshCalls += 1;
          throw new Error("should not refresh during reuse window");
        },
      },
    });

    expect(token).toBe("fresh-access");
    expect(refreshCalls).toBe(0);
  });

  test("marks authorization as expired when the refresh token is expired", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:00:00.000Z",
      refreshTokenExpiresAt: "2026-05-21T00:00:00.000Z",
    }));

    await expect(ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async () => {
          throw new Error("should not call remote");
        },
      },
    })).rejects.toThrow("飞书授权已过期，请重新授权");

    expect(store.snapshot().state.smartAssistant.authStatus).toBe("expired");
    expect(store.snapshot().state.smartAssistant.lastError).toBe("飞书授权已过期，请重新授权");
    expect(store.snapshot().state.smartAssistant.autoRefreshTask).toMatchObject({
      taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
      enabled: false,
      status: "failed",
    });
  });

  test("marks authorization as expired and asks for reauthorization when the refresh token is revoked", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:00:00.000Z",
    }));

    await expect(ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async () => {
          throw new DesktopFeishuOpenApiError({
            message: "Feishu API HTTP error 400 (code 20064): The refresh token has been revoked. Please note that a refresh token can only be used once.",
            status: 400,
            code: 20064,
          });
        },
      },
    })).rejects.toThrow("refresh_token 已被撤销，请重新发起授权流程以获取新的 refresh_token");

    expect(store.snapshot().state.smartAssistant.authStatus).toBe("expired");
    expect(store.snapshot().state.smartAssistant.lastError).toBe("refresh_token 已被撤销，请重新发起授权流程以获取新的 refresh_token");
    expect(store.snapshot().state.smartAssistant.autoRefreshTask).toMatchObject({
      taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
      enabled: false,
      status: "failed",
    });
  });

  test("reuses the persisted revoked-token failure instead of retrying the same refresh token", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:00:00.000Z",
    }));
    let refreshCalls = 0;

    const openApiClient = {
      refreshUserAccessToken: async () => {
        refreshCalls += 1;
        throw new DesktopFeishuOpenApiError({
          message: "Feishu API HTTP error 400 (code 20064): The refresh token has been revoked. Please note that a refresh token can only be used once.",
          status: 400,
          code: 20064,
        });
      },
    };

    await expect(ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient,
    })).rejects.toThrow("refresh_token 已被撤销，请重新发起授权流程以获取新的 refresh_token");

    await expect(ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:01:00.000Z"),
      openApiClient,
    })).rejects.toThrow("refresh_token 已被撤销，请重新发起授权流程以获取新的 refresh_token");

    expect(refreshCalls).toBe(1);
  });

  test("keeps the authorization state for transient refresh failures so auto refresh can retry later", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:00:00.000Z",
    }));

    await expect(ensureDesktopFeishuDeveloperAccessToken({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async () => {
          throw new Error("network down");
        },
      },
    })).rejects.toThrow("network down");

    expect(store.snapshot().state.smartAssistant.authStatus).toBe("authorized");
    expect(store.snapshot().state.smartAssistant.hasRefreshToken).toBe(true);
    expect(store.snapshot().state.smartAssistant.lastError).toBe("network down");
    expect(store.snapshot().state.smartAssistant.autoRefreshTask).toMatchObject({
      taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
      enabled: true,
      status: "failed",
      nextRunAt: "2026-05-22T00:05:00.000Z",
    });
  });

  test("treats stale auto refresh schedules as due when the access token is already near expiry", () => {
    const snapshot = createSnapshot({
      accessTokenExpiresAt: "2026-05-22T00:03:00.000Z",
    });
    snapshot.state.smartAssistant.autoRefreshTask = {
      taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
      enabled: true,
      status: "queued",
      nextRunAt: "2026-05-22T01:00:00.000Z",
    };
    if (snapshot.state.developer) {
      snapshot.state.developer.autoRefreshTask = {
        taskId: DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_TASK_ID,
        enabled: true,
        status: "queued",
        nextRunAt: "2026-05-22T01:00:00.000Z",
      };
    }

    expect(shouldRunDesktopFeishuDeveloperAutoRefreshTask(
      snapshot,
      new Date("2026-05-22T00:00:00.000Z"),
    )).toBe(true);
  });

  test("retries once with a forced refresh when the request fails with an expired token code", async () => {
    const store = createStore(createSnapshot({
      accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
    }));
    let refreshCalls = 0;
    const observedTokens: string[] = [];

    const result = await withDesktopFeishuDeveloperAccessTokenRetry({
      store,
      now: () => new Date("2026-05-22T00:00:00.000Z"),
      openApiClient: {
        refreshUserAccessToken: async () => {
          refreshCalls += 1;
          return {
            accessToken: "new-access",
            refreshToken: "new-refresh",
            accessTokenExpiresAt: "2026-05-22T03:00:00.000Z",
            refreshTokenExpiresAt: "2026-06-22T00:00:00.000Z",
          };
        },
      },
    }, async ({ accessToken, retried }) => {
      observedTokens.push(`${accessToken}:${retried ? "retry" : "first"}`);
      if (!retried) {
        throw new DesktopFeishuOpenApiError({
          message: "Feishu API HTTP error 400 (code 20006): access token expired",
          status: 400,
          code: 20006,
        });
      }
      return "ok";
    });

    expect(result).toBe("ok");
    expect(refreshCalls).toBe(1);
    expect(observedTokens).toEqual([
      "old-access:first",
      "new-access:retry",
    ]);
    expect(store.snapshot().developerToken.accessToken).toBe("new-access");
  });
});
