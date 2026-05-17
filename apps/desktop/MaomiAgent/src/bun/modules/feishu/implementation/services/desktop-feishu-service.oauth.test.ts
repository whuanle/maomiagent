import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import { resolveDesktopFeishuOAuthCallbackUrl } from "../../../../../shared/desktop-feishu-oauth";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuService } from "./desktop-feishu-service";

function createState(): FeishuStateView {
  return {
    personalDocs: {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    },
    smartAssistant: {
      enabled: false,
      appId: "",
      hasAppSecret: false,
      redirectUri: "",
      redirectOrigin: "",
      authStatus: "idle",
      authMethod: "oauth",
      hasRefreshToken: false,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
      docsMcp: null,
      runtimePolicy: {
        controlPlane: "planned",
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
    mode: "none",
    personal: null,
    developer: null,
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
    updatedAt: new Date(0).toISOString(),
  };
}

function createStoreSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
    docs: {} as Record<string, FeishuDocContentView>,
    auth: {
      smartAssistant: {},
    },
  };
}

function createServiceHarness(snapshot = createStoreSnapshot()) {
  let current = snapshot;

  const store = {
    read: async () => current,
    write: async (next: DesktopFeishuStoreSnapshot) => {
      current = next;
    },
  };

  const actionExecutor = {
    executeSmartAssistantAction: async () => {
      throw new Error("not used in oauth test");
    },
  };

  const docRuntime = {
    getDocsCapabilities: async () => {
      throw new Error("not used in oauth test");
    },
    getDocTree: async () => {
      throw new Error("not used in oauth test");
    },
    getDocContent: async () => {
      throw new Error("not used in oauth test");
    },
    getDocMediaPreviewUrls: async () => {
      throw new Error("not used in oauth test");
    },
    getDocWhiteboardPreviewUrls: async () => {
      throw new Error("not used in oauth test");
    },
    openWorkspaceDoc: async () => {
      throw new Error("not used in oauth test");
    },
    getWorkspaceDocLocalDraft: async () => {
      throw new Error("not used in oauth test");
    },
    saveWorkspaceDocLocalDraft: async () => {
      throw new Error("not used in oauth test");
    },
    pullWorkspaceDoc: async () => {
      throw new Error("not used in oauth test");
    },
    pushWorkspaceDoc: async () => {
      throw new Error("not used in oauth test");
    },
  };

  return {
    service: new DesktopFeishuService(store, actionExecutor, docRuntime),
    readSnapshot: () => current,
  };
}

describe("DesktopFeishuService oauth flow", () => {
  test("builds the real authorize url and persists pending oauth state", async () => {
    const harness = createServiceHarness();

    await harness.service.saveDeveloperConfig({
      appId: "cli_test_app",
      appSecret: "secret-1",
    });
    const result = await harness.service.beginDeveloperAuthorization({
      appId: "cli_test_app",
    });

    const url = new URL(result.authUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("cli_test_app");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("state")).toBeTruthy();

    const snapshot = harness.readSnapshot();
    expect(snapshot.auth.smartAssistant.appSecret).toBe("secret-1");
    expect(snapshot.auth.smartAssistant.pendingState).toBe(
      url.searchParams.get("state") ?? undefined,
    );
    expect(snapshot.auth.smartAssistant.pendingRedirectUri).toBe(
      resolveDesktopFeishuOAuthCallbackUrl(),
    );
    expect(snapshot.state.smartAssistant.authStatus).toBe("pending");
  });

  test("handles callback success and stores tokens privately", async () => {
    const originalFetch = globalThis.fetch;
    const harness = createServiceHarness();

    try {
      await harness.service.saveDeveloperConfig({
        appId: "cli_test_app",
        appSecret: "secret-1",
      });
      const begin = await harness.service.beginDeveloperAuthorization({
        appId: "cli_test_app",
      });
      const pendingState = new URL(begin.authUrl).searchParams.get("state") ?? "";

      globalThis.fetch = (async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        expect(body.grant_type).toBe("authorization_code");
        expect(body.client_id).toBe("cli_test_app");
        expect(body.client_secret).toBe("secret-1");
        expect(body.code).toBe("oauth-code-1");
        expect(body.redirect_uri).toBe(resolveDesktopFeishuOAuthCallbackUrl());

        return new Response(JSON.stringify({
          code: 0,
          access_token: "access-token-1",
          expires_in: 7200,
          refresh_token: "refresh-token-1",
          refresh_token_expires_in: 604800,
          token_type: "Bearer",
          scope: "search:message offline_access",
        }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      }) as typeof fetch;

      const result = await harness.service.handleOAuthCallback({
        code: "oauth-code-1",
        state: pendingState,
      });

      expect(result.success).toBe(true);
      expect(result.html).toContain("授权成功");

      const snapshot = harness.readSnapshot();
      expect(snapshot.auth.smartAssistant.accessToken).toBe("access-token-1");
      expect(snapshot.auth.smartAssistant.refreshToken).toBe("refresh-token-1");
      expect(snapshot.auth.smartAssistant.tokenType).toBe("Bearer");
      expect(snapshot.state.smartAssistant.authStatus).toBe("authorized");
      expect(snapshot.state.smartAssistant.hasRefreshToken).toBe(true);
      expect(snapshot.state.smartAssistant.scopes).toEqual([
        "search:message",
        "offline_access",
      ]);
      expect(snapshot.auth.smartAssistant.pendingState).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handles callback failures and exposes the error state", async () => {
    const harness = createServiceHarness();

    await harness.service.saveDeveloperConfig({
      appId: "cli_test_app",
      appSecret: "secret-1",
    });
    const begin = await harness.service.beginDeveloperAuthorization({
      appId: "cli_test_app",
    });
    const pendingState = new URL(begin.authUrl).searchParams.get("state") ?? "";

    const result = await harness.service.handleOAuthCallback({
      error: "access_denied",
      errorDescription: "user denied authorization",
      state: pendingState,
    });

    expect(result.success).toBe(false);
    expect(result.html).toContain("授权失败");

    const snapshot = harness.readSnapshot();
    expect(snapshot.state.smartAssistant.authStatus).toBe("error");
    expect(snapshot.state.smartAssistant.lastError).toContain("access_denied");
    expect(snapshot.auth.smartAssistant.pendingState).toBeUndefined();
  });

  test("refreshes token with the stored refresh token and rotates it", async () => {
    const originalFetch = globalThis.fetch;
    const harness = createServiceHarness();

    try {
      await harness.service.saveDeveloperConfig({
        appId: "cli_test_app",
        appSecret: "secret-1",
      });
      const snapshot = harness.readSnapshot();
      snapshot.auth.smartAssistant.refreshToken = "refresh-token-1";
      snapshot.auth.smartAssistant.scopes = ["search:message", "offline_access"];
      snapshot.state.smartAssistant.authStatus = "authorized";
      snapshot.state.developer!.authStatus = "authorized";

      globalThis.fetch = (async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        expect(body.grant_type).toBe("refresh_token");
        expect(body.client_id).toBe("cli_test_app");
        expect(body.client_secret).toBe("secret-1");
        expect(body.refresh_token).toBe("refresh-token-1");

        return new Response(JSON.stringify({
          code: 0,
          access_token: "access-token-2",
          expires_in: 7200,
          refresh_token: "refresh-token-2",
          refresh_token_expires_in: 604800,
          token_type: "Bearer",
          scope: "search:message offline_access",
        }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      }) as typeof fetch;

      const state = await harness.service.refreshDeveloperToken();

      expect(state.smartAssistant.authStatus).toBe("authorized");
      expect(state.smartAssistant.hasRefreshToken).toBe(true);
      expect(harness.readSnapshot().auth.smartAssistant.refreshToken).toBe("refresh-token-2");
      expect(harness.readSnapshot().auth.smartAssistant.accessToken).toBe("access-token-2");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
