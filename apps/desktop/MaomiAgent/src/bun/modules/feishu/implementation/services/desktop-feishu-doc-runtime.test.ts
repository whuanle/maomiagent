import { describe, expect, test } from "bun:test";

import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuDocRuntime } from "./desktop-feishu-doc-runtime";

function createSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: {
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
        docsMcp: {
          mcpId: "desktop.feishu.smart-assistant",
          name: "maomi_feishu_assistant_docs",
          endpoint: "desktop://feishu-assistant/docs",
          transport: "http-streamable",
          enabled: true,
          updatedAt: new Date(0).toISOString(),
        },
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
    },
    bot: {
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
    },
    docs: {
      doc_alpha: {
        docId: "doc_alpha",
        title: "Alpha Document",
        markdown: "# Alpha",
        length: 7,
        totalLength: 7,
        offset: 0,
        updatedAt: "2026-05-17T12:00:00.000Z",
        blocks: [],
        analysis: {
          riskyBlocks: [],
          riskySync: false,
          syncMode: null,
          riskyBlockMode: "safe",
        },
      } as any,
    },
    auth: {
      smartAssistant: {
        appSecret: "secret-1",
      },
    },
  };
}

describe("DesktopFeishuDocRuntime", () => {
  test("returns the full docs capabilities shape expected by the workbench", async () => {
    const store = {
      read: async () => createSnapshot(),
      write: async () => undefined,
    };

    const runtime = new DesktopFeishuDocRuntime(store);
    const capabilities = await runtime.getDocsCapabilities();

    expect(capabilities.mode).toBe("developer");
    expect(capabilities.accessKind).toBe("developer_oauth");
    expect(capabilities.managedMcpId).toBe("desktop.feishu.smart-assistant");
    expect(capabilities.availableTools).toContain("fetch-doc");
    expect(capabilities.canBrowseTree).toBe(true);
    expect(capabilities.canReadDocs).toBe(true);
    expect(capabilities.canWriteDocs).toBe(true);
  });

  test("returns document tree nodes using the current shared contract", async () => {
    const store = {
      read: async () => createSnapshot(),
      write: async () => undefined,
    };

    const runtime = new DesktopFeishuDocRuntime(store);
    const tree = await runtime.getDocTree({
      root: "my_library",
    });

    expect(tree.root).toBe("my_library");
    expect(tree.hasMore).toBe(false);
    expect(tree.nodes).toEqual([{
      id: "doc_alpha",
      docId: "doc_alpha",
      title: "Alpha Document",
      updateTime: "2026-05-17T12:00:00.000Z",
      hasChild: false,
    }]);
  });
});
