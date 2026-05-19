import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import {
  resolveDesktopFeishuOAuthCallbackOrigin,
  resolveDesktopFeishuOAuthCallbackUrl,
} from "../../../../../shared/desktop-feishu-oauth";
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

  return new DesktopFeishuService(store, actionExecutor, docRuntime);
}

function createServiceHarness(snapshot = createStoreSnapshot()) {
  let current = snapshot;
  let writeCount = 0;

  const store = {
    read: async () => current,
    write: async (next: DesktopFeishuStoreSnapshot) => {
      writeCount += 1;
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

  return {
    service: new DesktopFeishuService(store, actionExecutor, docRuntime),
    readSnapshot() {
      return current;
    },
    getWriteCount() {
      return writeCount;
    },
  };
}

describe("DesktopFeishuService smart assistant catalog hydration", () => {
  test("hydrates smart assistant directory data for an unconfigured state", async () => {
    const service = createService();

    const state = await service.getState();

    expect(state.smartAssistant.domains.length).toBeGreaterThan(0);
    expect(state.smartAssistant.actions.length).toBeGreaterThan(0);
    expect(state.smartAssistant.connectionProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "personal_docs_mcp" }),
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
    expect(state.developer?.redirectUri).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(state.developer?.redirectOrigin).toBe(resolveDesktopFeishuOAuthCallbackOrigin());
    expect(state.smartAssistant.redirectUri).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(state.smartAssistant.redirectOrigin).toBe(resolveDesktopFeishuOAuthCallbackOrigin());
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
    expect(state.catalog.developerScopes).toContain("search:message");
    expect(state.developer?.allowedTools).toContain("create-doc");
  });

  test("normalizes legacy callback values on read and rewrites the store", async () => {
    const snapshot = createStoreSnapshot();
    snapshot.state.mode = "developer";
    snapshot.state.developer = {
      appId: "cli_test_app",
      hasAppSecret: true,
      redirectUri: "http://127.0.0.1/desktop/feishu/oauth/callback",
      redirectOrigin: "http://127.0.0.1",
      authStatus: "idle",
      authMethod: "oauth",
      hasRefreshToken: false,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
    };
    snapshot.state.smartAssistant = {
      ...snapshot.state.smartAssistant,
      enabled: true,
      appId: "cli_test_app",
      hasAppSecret: true,
      redirectUri: "http://localhost:39091/desktop/feishu/oauth/callback",
      redirectOrigin: "http://localhost:39091",
    };

    const harness = createServiceHarness(snapshot);

    const state = await harness.service.getState();

    expect(state.developer?.redirectUri).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(state.developer?.redirectOrigin).toBe(resolveDesktopFeishuOAuthCallbackOrigin());
    expect(state.smartAssistant.redirectUri).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(state.smartAssistant.redirectOrigin).toBe(resolveDesktopFeishuOAuthCallbackOrigin());
    expect(harness.readSnapshot().state.developer?.redirectUri).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(harness.readSnapshot().state.developer?.redirectOrigin).toBe(resolveDesktopFeishuOAuthCallbackOrigin());
    expect(harness.readSnapshot().state.smartAssistant.redirectUri).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(harness.readSnapshot().state.smartAssistant.redirectOrigin).toBe(resolveDesktopFeishuOAuthCallbackOrigin());
    expect(harness.getWriteCount()).toBe(1);
  });
});
