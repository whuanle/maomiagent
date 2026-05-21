import { describe, expect, test } from "bun:test";

import type { FeishuBotStateView, FeishuStateView } from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuDocRuntime } from "./desktop-feishu-doc-runtime";

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
      docsMcp: {
        mcpId: "desktop.feishu.smart-assistant",
        name: "maomi_feishu_assistant_docs",
        endpoint: "desktop://feishu-assistant/docs",
        transport: "http-streamable",
        enabled: true,
        updatedAt: new Date(0).toISOString(),
      },
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

function createRuntime(snapshot: DesktopFeishuStoreSnapshot) {
  return new DesktopFeishuDocRuntime({
    read: async () => snapshot,
    write: async (next) => {
      snapshot.state = next.state;
      snapshot.bot = next.bot;
      snapshot.docs = next.docs;
    },
  });
}

describe("DesktopFeishuDocRuntime", () => {
  test("loadDocTreeRoot delegates to the cache-aware loader", async () => {
    const runtime = new DesktopFeishuDocRuntime({
      getDocsCapabilities: async () => ({
        mode: "developer",
        accessKind: "developer_oauth",
        accessLabel: "智能助手 OAuth",
        managedMcpId: "desktop.feishu.smart-assistant",
        endpoint: "desktop://feishu-assistant/docs",
        availableTools: [],
        toolDetails: [],
        canSearchDocs: true,
        canListDocs: true,
        canFetchDocs: true,
        canUpdateDocs: true,
        canBrowseTree: true,
        canReadDocs: true,
        canWriteDocs: true,
      }),
      loadRoot: async () => ({
        rootToken: "root",
        rootKind: "wiki_node",
        nodes: [{ id: "child", token: "child", kind: "document", title: "Child", hasChild: false }],
        source: "remote",
        refreshing: false,
        stale: false,
        loadedAt: "2026-05-21T00:00:00.000Z",
      }),
      loadBranch: async () => ({
        rootToken: "root",
        parentToken: "child",
        nodes: [],
        source: "remote",
        refreshing: false,
        stale: false,
      }),
      getDocContent: async () => { throw new Error("not used"); },
    } as never);

    await expect(runtime.loadDocTreeRoot({ token: "root" })).resolves.toMatchObject({
      rootToken: "root",
      nodes: [expect.objectContaining({ title: "Child" })],
    });
  });

  test("loadDocTreeBranch delegates to the cache-aware loader", async () => {
    const runtime = new DesktopFeishuDocRuntime({
      getDocsCapabilities: async () => { throw new Error("not used"); },
      loadRoot: async () => { throw new Error("not used"); },
      loadBranch: async (input) => ({
        rootToken: input.rootToken,
        parentToken: input.parentToken,
        nodes: [{ id: "grandchild", token: "grandchild", kind: "document", title: "Grandchild", hasChild: false }],
        source: "remote",
        refreshing: false,
        stale: false,
        loadedAt: "2026-05-21T00:00:00.000Z",
      }),
      getDocContent: async () => { throw new Error("not used"); },
    } as never);

    await expect(runtime.loadDocTreeBranch({ rootToken: "root", parentToken: "child" })).resolves.toMatchObject({
      rootToken: "root",
      parentToken: "child",
      nodes: [expect.objectContaining({ title: "Grandchild" })],
    });
  });

  test("exposes document tree capabilities expected by the workbench", async () => {
    const runtime = createRuntime({
      state: createState(),
      bot: createBotState(),
      docs: {},
    });

    const capabilities = await runtime.getDocsCapabilities();

    expect(capabilities.canBrowseTree).toBe(true);
    expect(capabilities.canReadDocs).toBe(true);
    expect(capabilities.canWriteDocs).toBe(true);
    expect(capabilities.availableTools).toContain("docs.list_nodes");
  });

  test("returns FeishuDocTreeView nodes for the requested root document", async () => {
    const runtime = createRuntime({
      state: createState(),
      bot: createBotState(),
      docs: {},
    });

    const tree = await runtime.getDocTree({
      root: "document",
      docId: "doc_1",
    });

    expect(tree.root).toBe("document");
    expect(tree.parentDocId).toBe("doc_1");
    expect(tree.hasMore).toBe(false);
    expect(tree.nodes).toEqual([
      expect.objectContaining({
        id: "doc_1",
        docId: "doc_1",
        hasChild: false,
      }),
    ]);
  });
});
