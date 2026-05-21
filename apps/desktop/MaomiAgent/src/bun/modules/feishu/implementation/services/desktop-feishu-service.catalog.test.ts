import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import type { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
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
    developerCredential: {
      appSecret: "",
    },
    developerToken: {
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
      refreshTokenExpiresAt: "",
    },
    docTreeCache: {
      roots: {},
      branches: {},
      contents: {},
    },
  };
}

function createService(snapshot = createStoreSnapshot()) {
  let current = snapshot;

  const store = {
    read: async () => current,
    write: async (next: DesktopFeishuStoreSnapshot) => {
      current = next;
    },
  };

  const actionExecutor = {
    executeSmartAssistantAction: async () => {
      throw new Error("not used in catalog test");
    },
  };

  const docRuntime = {
    getDocsCapabilities: async () => {
      throw new Error("not used in catalog test");
    },
    getDocTree: async () => {
      throw new Error("not used in catalog test");
    },
    getDocContent: async () => {
      throw new Error("not used in catalog test");
    },
    getDocMediaPreviewUrls: async () => {
      throw new Error("not used in catalog test");
    },
    getDocWhiteboardPreviewUrls: async () => {
      throw new Error("not used in catalog test");
    },
    openWorkspaceDoc: async () => {
      throw new Error("not used in catalog test");
    },
    getWorkspaceDocLocalDraft: async () => {
      throw new Error("not used in catalog test");
    },
    saveWorkspaceDocLocalDraft: async () => {
      throw new Error("not used in catalog test");
    },
    pullWorkspaceDoc: async () => {
      throw new Error("not used in catalog test");
    },
    pushWorkspaceDoc: async () => {
      throw new Error("not used in catalog test");
    },
  };

  const openApiClient = {
    exchangeOAuthCode: async () => ({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      accessTokenExpiresAt: "2026-05-21T02:00:00.000Z",
      refreshTokenExpiresAt: "2026-06-20T00:00:00.000Z",
    }),
  } as unknown as DesktopFeishuOpenApiClient;

  return new DesktopFeishuService(store, actionExecutor, docRuntime, openApiClient);
}

describe("DesktopFeishuService smart assistant catalog hydration", () => {
  test("hydrates smart assistant directory data for an unconfigured state", async () => {
    const service = createService();

    const state = await service.getState();

    expect(state.smartAssistant.domains.length).toBeGreaterThan(0);
    expect(state.smartAssistant.actions.length).toBeGreaterThan(0);
    expect(state.smartAssistant.connectionProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "developer_oauth" }),
      ]),
    );
    expect(state.smartAssistant.contextTemplates.length).toBeGreaterThan(0);
    expect(state.smartAssistant.policyItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "control_plane", status: "ready" }),
        expect.objectContaining({ key: "credential_proxy", status: "ready" }),
      ]),
    );
    expect(state.catalog.developerScopes).toEqual(
      expect.arrayContaining([
        "task:task:writeonly",
        "base:field:read",
        "base:record:create",
        "wiki:node:update",
      ]),
    );
    expect(state.catalog.developerTenantScopes).toEqual(
      expect.arrayContaining([
        "im:message",
        "im:message:send_as_bot",
      ]),
    );
    expect(state.catalog.supportedTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "create-doc" }),
      ]),
    );
  });

  test("hydrates the saved developer state with smart assistant catalog data", async () => {
    const service = createService();

    const state = await service.saveDeveloperConfig({
      appId: "cli_test_app",
      appSecret: "secret-1",
    });

    expect(state.mode).toBe("developer");
    expect(state.smartAssistant.enabled).toBe(true);
    expect(state.smartAssistant.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "docs.search", status: "ready" }),
        expect.objectContaining({ actionId: "calendar.create_event", status: "ready" }),
        expect.objectContaining({ actionId: "mail.send", status: "ready" }),
      ]),
    );
    expect(state.smartAssistant.domains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "docs", readyActionCount: expect.any(Number) }),
        expect.objectContaining({ key: "calendar", readyActionCount: expect.any(Number) }),
      ]),
    );
    expect(state.smartAssistant.runtimePolicy.controlPlane).toBe("ready");
    expect(state.smartAssistant.redirectUri).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
    expect(state.smartAssistant.redirectOrigin).toBe("http://127.0.0.1:35000");
    expect(state.developer?.redirectUri).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
    expect(state.developer?.redirectOrigin).toBe("http://127.0.0.1:35000");
    expect(state.catalog.developerScopes).toContain("search:message");
    expect(state.developer?.allowedTools).toContain("create-doc");
  });

  test("normalizes stored legacy loopback redirect URLs during hydration", async () => {
    const snapshot = createStoreSnapshot();
    snapshot.state.smartAssistant.redirectUri = "http://127.0.0.1/desktop/feishu/oauth/callback";
    snapshot.state.smartAssistant.redirectOrigin = "http://127.0.0.1";
    snapshot.state.developer = {
      appId: "cli_test_app",
      hasAppSecret: true,
      redirectUri: "http://localhost:39091/desktop/feishu/oauth/callback",
      redirectOrigin: "http://localhost:39091",
      authStatus: "idle",
      authMethod: "oauth",
      hasRefreshToken: false,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
    };
    const service = createService(snapshot);

    const state = await service.getState();

    expect(state.smartAssistant.redirectUri).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
    expect(state.smartAssistant.redirectOrigin).toBe("http://127.0.0.1:35000");
    expect(state.developer?.redirectUri).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
    expect(state.developer?.redirectOrigin).toBe("http://127.0.0.1:35000");
  });

  test("starts developer authorization with the fixed callback URL", async () => {
    const service = createService();
    await service.saveDeveloperConfig({
      appId: "cli_test_app",
      appSecret: "secret-1",
    });

    const result = await service.beginDeveloperAuthorization({
      appId: "cli_test_app",
      redirectUri: "http://127.0.0.1/desktop/feishu/oauth/callback",
    });
    const authUrl = new URL(result.authUrl);

    expect(authUrl.origin).toBe("https://open.feishu.cn");
    expect(authUrl.pathname).toBe("/open-apis/authen/v1/index");
    expect(authUrl.searchParams.get("app_id")).toBe("cli_test_app");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
    expect(result.item.smartAssistant.authStatus).toBe("pending");
    expect(result.item.smartAssistant.redirectUri).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
  });

  test("handles a developer OAuth callback and marks the assistant authorized", async () => {
    const service = createService();
    await service.saveDeveloperConfig({
      appId: "cli_test_app",
      appSecret: "secret-1",
    });
    await service.beginDeveloperAuthorization({
      appId: "cli_test_app",
    });

    const result = await service.handleOAuthCallback({
      code: "oauth-code-1",
      state: "state-1",
    });
    const state = await service.getState();

    expect(result.success).toBe(true);
    expect(result.html).toContain("飞书授权完成");
    expect(state.smartAssistant.authStatus).toBe("authorized");
    expect(state.smartAssistant.hasRefreshToken).toBe(true);
    expect(state.smartAssistant.accessTokenExpiresAt).toBe("2026-05-21T02:00:00.000Z");
    expect(state.smartAssistant.refreshTokenExpiresAt).toBe("2026-06-20T00:00:00.000Z");
    expect(state.developer?.authStatus).toBe("authorized");
    expect(state.developer?.hasRefreshToken).toBe(true);
    expect(state.developer?.accessTokenExpiresAt).toBe("2026-05-21T02:00:00.000Z");
    expect(state.developer?.refreshTokenExpiresAt).toBe("2026-06-20T00:00:00.000Z");
  });

  test("handles a developer OAuth callback error", async () => {
    const service = createService();

    const result = await service.handleOAuthCallback({
      error: "access_denied",
      errorDescription: "user cancelled",
    });
    const state = await service.getState();

    expect(result.success).toBe(false);
    expect(result.html).toContain("飞书授权失败");
    expect(state.smartAssistant.authStatus).toBe("error");
    expect(state.smartAssistant.lastError).toBe("user cancelled");
  });
});
