import { describe, expect, test } from "bun:test";

import type { FeishuBotStateView, FeishuStateView } from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { ensureDesktopFeishuDeveloperAccessToken } from "./desktop-feishu-developer-token";

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
    transportMode: "webhook",
    catalog: {
      transportMode: "webhook",
      descriptors: [],
    },
    connectionStatus: "stopped",
    sessionMappingCount: 0,
    processedMessageCount: 0,
    queuedConversationCount: 0,
    updatedAt: "2026-05-22T00:00:00.000Z",
  };
}

function createSnapshot(overrides: Partial<DesktopFeishuStoreSnapshot["developerToken"]> = {}): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
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

function createStore(snapshot: DesktopFeishuStoreSnapshot) {
  let current = snapshot;
  return {
    read: async () => current,
    write: async (next: DesktopFeishuStoreSnapshot) => {
      current = next;
    },
    snapshot: () => current,
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
  });

  test("marks authorization as errored when the refresh token is expired", async () => {
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

    expect(store.snapshot().state.smartAssistant.authStatus).toBe("error");
    expect(store.snapshot().state.smartAssistant.lastError).toBe("飞书授权已过期，请重新授权");
  });
});
