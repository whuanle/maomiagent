import { describe, expect, it } from "bun:test";

import {
  buildConversationMindmapPreviewData,
  looksLikeMermaidMindmapSource,
} from "./conversation-mindmap-preview";

const SAMPLE_MINDMAP = `
%%{init: {"theme": "base"}}%%
mindmap
  root((EasilyNET IdentityServer 开发计划))
    开发里程碑
      Phase 1: 基础架构搭建
      Phase 2: OAuth 2.1 核心协议实现
    项目概述
      目标: 构建现代化认证服务器
      技术选型
      React Admin UI
    OAuth 2.1 协议实现
      Authorization Endpoint
      PKCE 支持
      Refresh Token
    核心架构设计
      分层架构设计
      核心模块划分
      扩展层设计
`.trim();

function flattenMindmap(node: { text: string; children?: Array<any> }, bucket: string[] = []) {
  bucket.push(node.text);
  for (const child of node.children ?? []) {
    flattenMindmap(child, bucket);
  }
  return bucket;
}

describe("conversation mindmap preview data", () => {
  it("detects Mermaid mindmap source even when init directives are present", () => {
    expect(looksLikeMermaidMindmapSource(SAMPLE_MINDMAP)).toBe(true);
    expect(looksLikeMermaidMindmapSource("graph TD\nA-->B")).toBe(false);
  });

  it("builds viewer data with a dedicated root node and nested branches", () => {
    const result = buildConversationMindmapPreviewData(SAMPLE_MINDMAP);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    const primaryNodes = result.data.children ?? [];
    const nestedLeafNodes = primaryNodes.flatMap((node) => node.children ?? []);

    expect(result.data.text).toBe("EasilyNET IdentityServer 开发计划");
    expect(primaryNodes.length).toBeGreaterThan(1);
    expect(nestedLeafNodes.length).toBeGreaterThan(4);
    expect(primaryNodes.some((node) => node.text === "开发里程碑")).toBe(true);
    expect(primaryNodes.some((node) => node.text === "核心架构设计")).toBe(true);
  });

  it("extracts labels from Mermaid node shape syntax", () => {
    const result = buildConversationMindmapPreviewData(`mindmap\n  root((中心主题))\n    topic[模块化架构设计]\n      child(插件式数据访问层)`);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    const labels = flattenMindmap(result.data);
    expect(labels).toContain("中心主题");
    expect(labels).toContain("模块化架构设计");
    expect(labels).toContain("插件式数据访问层");
  });

  it("preserves multiline node content for the viewer", () => {
    const result = buildConversationMindmapPreviewData(`mindmap\n  root((中心主题))\n    topic[第一行<br/>第二行]`);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.data.children?.[0]?.text).toBe("第一行");
    expect(result.data.children?.[0]?.multiLineContent).toEqual(["第二行"]);
  });
});