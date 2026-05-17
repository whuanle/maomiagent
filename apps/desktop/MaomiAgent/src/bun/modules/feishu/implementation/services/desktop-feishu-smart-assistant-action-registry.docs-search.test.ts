import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuDocRuntime } from "./desktop-feishu-doc-runtime";
import { DesktopFeishuSmartAssistantActionRegistry } from "./desktop-feishu-smart-assistant-action-registry";

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

function createDoc(input: {
  docId: string;
  title: string;
  markdown: string;
}): FeishuDocContentView {
  return {
    docId: input.docId,
    title: input.title,
    markdown: input.markdown,
    length: input.markdown.length,
    totalLength: input.markdown.length,
    offset: 0,
    analysis: {
      riskyBlocks: [],
      riskySync: false,
      syncMode: null,
      riskyBlockMode: "safe",
    },
  };
}

function createStoreSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
    docs: {
      "doc-roadmap": createDoc({
        docId: "doc-roadmap",
        title: "产品路线图",
        markdown: "# 产品路线图\n\n这里整理飞书智能助手迁移清单。",
      }),
      "doc-release": createDoc({
        docId: "doc-release",
        title: "发布计划",
        markdown: "# 发布计划\n\n路线图里的文档搜索动作已经开始接入。",
      }),
      "doc-random": createDoc({
        docId: "doc-random",
        title: "无关记录",
        markdown: "# 无关记录\n\n这里没有命中关键字。",
      }),
    },
    auth: {
      smartAssistant: {},
    },
  };
}

describe("DesktopFeishuSmartAssistantActionRegistry docs.search", () => {
  test("uses doc runtime data instead of generic routing for docs.search", async () => {
    let snapshot = createStoreSnapshot();
    const store = {
      read: async () => snapshot,
      write: async (next: DesktopFeishuStoreSnapshot) => {
        snapshot = next;
      },
    };
    const runtime = new DesktopFeishuDocRuntime(store);
    const registry = new DesktopFeishuSmartAssistantActionRegistry(
      {
        listProviderRuntimes: () => [],
      },
      runtime,
    );

    const result = await registry.execute({
      actionId: "docs.search",
      query: "路线图",
    });

    expect(result.executed).toBe(true);
    expect(result.summary.headline).toBe("搜索到 2 篇匹配文档");
    expect(result.result).toEqual(
      expect.objectContaining({
        stage: "completed",
        totalMatches: 2,
        matches: expect.arrayContaining([
          expect.objectContaining({ docId: "doc-roadmap" }),
          expect.objectContaining({ docId: "doc-release" }),
        ]),
      }),
    );
  });
});
