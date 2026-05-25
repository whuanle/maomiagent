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
    updatedAt: new Date(0).toISOString(),
  };
}

function createStoreSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
    botRuntime: {
      version: "1.0",
      bindings: [],
      processedMessages: [],
      pendingActions: [],
    },
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
      lastRootToken: "",
      lastRootUpdatedAt: "",
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
    refreshUserAccessToken: async () => ({
      accessToken: "refreshed-access-token",
      refreshToken: "refreshed-refresh-token",
      accessTokenExpiresAt: "2026-05-22T02:00:00.000Z",
      refreshTokenExpiresAt: "2026-06-21T00:00:00.000Z",
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
        "base:record:read",
        "calendar:calendar.event:create",
        "calendar:calendar.free_busy:read",
        "contact:contact.base:readonly",
        "docx:document:create",
        "docx:document:write_only",
        "docs:document.media:download",
        "drive:file:download",
        "im:message:readonly",
        "mail:user_mailbox.message:send",
        "minutes:minutes:readonly",
        "search:docs:read",
        "sheets:spreadsheet:read",
        "vc:meeting.search:read",
        "wiki:node:read",
        "wiki:node:create",
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

  test("exposes the last cached docs root token for workspace restore", async () => {
    const snapshot = createStoreSnapshot();
    snapshot.docTreeCache.lastRootToken = "GkfewPcB0ibJMMkXGZucdgR8nhh";
    snapshot.docTreeCache.lastRootUpdatedAt = "2026-05-23T00:00:00.000Z";
    snapshot.docTreeCache.roots = {
      older_root: {
        token: "older_root",
        kind: "wiki_node",
        rootNodeId: "older_root",
        title: "旧节点",
        loadedAt: "2026-05-22T00:00:00.000Z",
      },
      current_root: {
        token: "GkfewPcB0ibJMMkXGZucdgR8nhh",
        kind: "wiki_node",
        rootNodeId: "GkfewPcB0ibJMMkXGZucdgR8nhh",
        title: "测试节点1",
        loadedAt: "2026-05-23T00:00:00.000Z",
      },
    };
    const service = createService(snapshot);

    const state = await service.getState();

    expect(state.docsWorkspace).toEqual({
      lastRootToken: "GkfewPcB0ibJMMkXGZucdgR8nhh",
      lastRootTitle: "测试节点1",
      lastRootLoadedAt: "2026-05-23T00:00:00.000Z",
    });
  });

  test("hydrates pending action counts from bot runtime state", async () => {
    const service = createService({
      ...createStoreSnapshot(),
      botRuntime: {
        version: "1.0",
        bindings: [],
        processedMessages: [],
        pendingActions: [{
          pendingId: "pending_1",
          scopeKey: "tenant-1:oc_1:root",
          chatId: "oc_1",
          messageId: "om_1",
          domain: "calendar",
          actionId: "calendar.create_event",
          workspaceId: "workspace-a",
          summary: "准备创建会议",
          details: ["今天 9:00-10:00"],
          executeInput: {
            actionId: "calendar.create_event",
            workspaceId: "workspace-a",
            title: "AI 落地讨论",
            startAt: "2026-05-25T09:00:00+08:00",
            endAt: "2026-05-25T10:00:00+08:00",
          },
          createdAt: "2026-05-25T09:00:00.000Z",
          updatedAt: "2026-05-25T09:00:00.000Z",
          expiresAt: "2026-05-25T09:30:00.000Z",
        }],
      },
    });

    const state = await service.getBotState();

    expect(state.pendingActionCount).toBe(1);
    expect(state.latestPendingAction).toEqual(expect.objectContaining({
      pendingId: "pending_1",
      actionId: "calendar.create_event",
      summary: "准备创建会议",
    }));
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
    expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "offline_access",
        "docx:document:readonly",
        "wiki:node:read",
        "search:docs:read",
      ]),
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
    expect(state.smartAssistant.autoRefreshTask.taskId).toBe("desktop.feishu.developer-token-auto-refresh");
    expect(state.smartAssistant.autoRefreshTask.enabled).toBe(true);
    expect(state.smartAssistant.autoRefreshTask.status).toBe("queued");
    expect(state.smartAssistant.autoRefreshTask.nextRunAt).toEqual(expect.any(String));
    expect(state.developer?.authStatus).toBe("authorized");
    expect(state.developer?.hasRefreshToken).toBe(true);
    expect(state.developer?.accessTokenExpiresAt).toBe("2026-05-21T02:00:00.000Z");
    expect(state.developer?.refreshTokenExpiresAt).toBe("2026-06-20T00:00:00.000Z");
    expect(state.developer?.autoRefreshTask.taskId).toBe("desktop.feishu.developer-token-auto-refresh");
    expect(state.developer?.autoRefreshTask.status).toBe("queued");
  });

  test("explains which developer credential is missing during OAuth callback", async () => {
    const service = createService();
    await service.saveDeveloperConfig({
      appId: "cli_test_app",
    });
    await service.beginDeveloperAuthorization({
      appId: "cli_test_app",
    });

    const result = await service.handleOAuthCallback({
      code: "oauth-code-1",
    });
    const state = await service.getState();

    expect(result.success).toBe(false);
    expect(result.html).toContain("缺少飞书应用 App Secret");
    expect(state.smartAssistant.authStatus).toBe("error");
    expect(state.smartAssistant.lastError).toBe("缺少飞书应用 App Secret，请重新保存配置。");
  });

  test("refreshes the developer OAuth token with the stored refresh token", async () => {
    const snapshot = createStoreSnapshot();
    snapshot.developerCredential.appSecret = "secret-1";
    snapshot.developerToken = {
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      accessTokenExpiresAt: "2026-05-21T00:00:00.000Z",
      refreshTokenExpiresAt: "2026-06-20T00:00:00.000Z",
    };
    snapshot.state.mode = "developer";
    snapshot.state.developer = {
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
    };
    snapshot.state.smartAssistant.enabled = true;
    snapshot.state.smartAssistant.appId = "cli_test_app";
    snapshot.state.smartAssistant.hasAppSecret = true;
    snapshot.state.smartAssistant.authStatus = "authorized";
    snapshot.state.smartAssistant.hasRefreshToken = true;
    const service = createService(snapshot);

    const state = await service.refreshDeveloperToken();

    expect(state.smartAssistant.authStatus).toBe("authorized");
    expect(state.smartAssistant.accessTokenExpiresAt).toBe("2026-05-22T02:00:00.000Z");
    expect(state.smartAssistant.refreshTokenExpiresAt).toBe("2026-06-21T00:00:00.000Z");
    expect(state.smartAssistant.lastError).toBeUndefined();
    expect(state.smartAssistant.autoRefreshTask.taskId).toBe("desktop.feishu.developer-token-auto-refresh");
    expect(state.smartAssistant.autoRefreshTask.enabled).toBe(true);
    expect(state.smartAssistant.autoRefreshTask.status).toBe("success");
    expect(state.smartAssistant.autoRefreshTask.nextRunAt).toEqual(expect.any(String));
    expect(state.developer?.accessTokenExpiresAt).toBe("2026-05-22T02:00:00.000Z");
    expect(state.developer?.refreshTokenExpiresAt).toBe("2026-06-21T00:00:00.000Z");
    expect(state.developer?.autoRefreshTask.status).toBe("success");
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

  test("persists bot config fields and keeps saved secrets when later updates omit them", async () => {
    const service = createService();

    const saved = await service.saveBotConfig({
      appId: "cli_test_bot",
      appSecret: "secret-1",
      verificationToken: "verify-1",
      encryptKey: "encrypt-1",
      allowWorkspaceSwitch: true,
      workspaceSwitchScope: "restricted",
      allowedExecutionWorkspaceIds: ["workspace-a", "workspace-b"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
    });

    expect(saved).toMatchObject({
      enabled: true,
      appId: "cli_test_bot",
      appSecret: "secret-1",
      hasAppSecret: true,
      verificationToken: "verify-1",
      hasVerificationToken: true,
      encryptKey: "encrypt-1",
      hasEncryptKey: true,
      allowWorkspaceSwitch: true,
      workspaceSwitchScope: "restricted",
      allowedExecutionWorkspaceIds: ["workspace-a", "workspace-b"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
      connectionStatus: "disconnected",
    });
    expect(saved.savedAt).toEqual(expect.any(String));

    const updated = await service.saveBotConfig({
      appId: "cli_test_bot",
      allowWorkspaceSwitch: false,
      selectedChannelId: "channel-beta",
      selectedModelId: "model-beta",
    });

    expect(updated).toMatchObject({
      enabled: true,
      appId: "cli_test_bot",
      appSecret: "secret-1",
      hasAppSecret: true,
      verificationToken: "verify-1",
      hasVerificationToken: true,
      encryptKey: "encrypt-1",
      hasEncryptKey: true,
      allowWorkspaceSwitch: false,
      workspaceSwitchScope: "all",
      allowedExecutionWorkspaceIds: [],
      selectedChannelId: "channel-beta",
      selectedModelId: "model-beta",
      connectionStatus: "disconnected",
    });
  });

  test("clears saved bot credential fields when config is reset", async () => {
    const service = createService();

    await service.saveBotConfig({
      appId: "cli_test_bot",
      appSecret: "secret-1",
      verificationToken: "verify-1",
      encryptKey: "encrypt-1",
      allowWorkspaceSwitch: true,
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
    });

    const cleared = await service.clearBotConfig();

    expect(cleared).toMatchObject({
      enabled: false,
      appId: "",
      appSecret: "",
      hasAppSecret: false,
      verificationToken: "",
      hasVerificationToken: false,
      encryptKey: "",
      hasEncryptKey: false,
      selectedChannelId: undefined,
      selectedModelId: undefined,
      connectionStatus: "disconnected",
    });
  });

  test("hydrates legacy saved bot config as websocket state when credentials are already present", async () => {
    const snapshot = createStoreSnapshot();
    snapshot.bot = {
      ...snapshot.bot,
      enabled: false,
      appId: "cli_test_bot",
      hasAppSecret: true,
      allowWorkspaceSwitch: true,
      workspaceSwitchScope: "restricted",
      allowedExecutionWorkspaceIds: ["workspace-a"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
      transportMode: "webhook" as never,
      catalog: {
        transportMode: "webhook" as never,
        descriptors: [],
      },
      connectionStatus: "ready" as never,
    };
    const service = createService(snapshot);

    const state = await service.getBotState();

    expect(state).toMatchObject({
      enabled: true,
      appId: "cli_test_bot",
      transportMode: "websocket",
      catalog: {
        transportMode: "websocket",
        descriptors: [],
      },
      hasAppSecret: true,
      allowWorkspaceSwitch: true,
      workspaceSwitchScope: "restricted",
      allowedExecutionWorkspaceIds: ["workspace-a"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
      connectionStatus: "disconnected",
    });
  });

  test("hydrates legacy webhook event snapshots into websocket event state", async () => {
    const snapshot = createStoreSnapshot();
    snapshot.bot = {
      ...snapshot.bot,
      appId: "cli_test_bot",
      hasAppSecret: true,
      transportMode: "webhook" as never,
      catalog: {
        transportMode: "webhook" as never,
        descriptors: [],
      },
      connectionStatus: "ready" as never,
      latestWebhook: {
        status: "challenge",
        receivedAt: "2026-05-25T00:00:00.000Z",
        eventType: "im.message.receive_v1",
        eventId: "evt_123",
        messageId: "om_123",
        chatId: "oc_123",
        detail: "legacy webhook payload",
      },
    } as FeishuBotStateView & {
      latestWebhook: {
        status: string
        receivedAt: string
        eventType: string
        eventId: string
        messageId: string
        chatId: string
        detail: string
      }
    };
    const service = createService(snapshot);

    const state = await service.getBotState();

    expect(state.connectionStatus).toBe("disconnected");
    expect(state.transportMode).toBe("websocket");
    expect(state.catalog.transportMode).toBe("websocket");
    expect(state.latestEvent).toEqual({
      status: "received",
      receivedAt: "2026-05-25T00:00:00.000Z",
      eventType: "im.message.receive_v1",
      eventId: "evt_123",
      messageId: "om_123",
      chatId: "oc_123",
      detail: "legacy webhook payload",
    });
  });
});
