import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workspaceRoot = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8");
}

describe("Feishu docs workbench IR loading bridge", () => {
  test("exposes document IR bridge helpers", async () => {
    const feishuLib = await source("src/mainview/lib/feishu.ts");
    const desktopFeishuLib = await source("src/mainview/lib/desktop-feishu.ts");
    const windowBridge = await source("src/mainview/lib/electrobun-window-bridge.ts");
    const bunIndex = await source("src/bun/index.ts");

    expect(feishuLib).toContain("export async function openFeishuDocIR");
    expect(feishuLib).toContain("export async function pullFeishuDocIR");
    expect(feishuLib).toContain("export async function pushFeishuDocIR");
    expect(desktopFeishuLib).toContain("openDesktopFeishuDocIR");
    expect(windowBridge).toContain("rpc.request.openDesktopFeishuDocIR(input)");
    expect(bunIndex).toContain("resolveDesktopFeishuQueryPort(host).openDocIR(input)");
    expect(bunIndex).toContain("resolveDesktopFeishuCommandPort(host).pullDocIR(input)");
    expect(bunIndex).toContain("resolveDesktopFeishuCommandPort(host).pushDocIR(input)");
  });

  test("workbench opens and pulls workspace markdown for visual preview", async () => {
    const workbench = await source("src/mainview/modules/feishu/components/docs-workbench.tsx");
    const page = await source("src/mainview/modules/feishu/page.tsx");
    const app = await source("src/mainview/App.tsx");
    const services = await source("src/mainview/services/app-service-container.ts");
    const bridge = await source("src/mainview/modules/chat/hooks/use-chat-workspace-pane-bridge.ts");
    const pane = await source("src/mainview/modules/chat/components/workspace-pane.tsx");

    expect(workbench).toContain("? await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)");
    expect(workbench).toContain("所有总结、改写和重新生成都必须基于这个原始文件");
    expect(workbench).toContain("const result = await pullFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId)");
    expect(workbench).toContain("<FeishuDocVisualEditor");
    expect(workbench).toContain("mdx={draft}");
    expect(workbench).not.toContain('className="feishu-docs-workspace-view-switch is-secondary"');
    expect(workbench).toContain("treeNodes: snapshotTreeNodes(treeNodes)");
    expect(page).toContain("initialTreeNodes={docsUiState.treeNodes}");
    expect(page).toContain("readSavedFeishuActiveWorkspaceId");
    expect(workbench).toContain("original_markdown_path:");
    expect(workbench).toContain("draftRelativePath: chatDoc.cache?.draftRelativePath");
    expect(workbench).not.toContain("当前依据：飞书原始结构 + 结构化基线");
    expect(workbench).not.toContain("推荐发布方式：先重新拉取远端基线");
    expect(workbench).not.toContain("未知块保留：");
    expect(workbench).not.toContain("const workspaceDiagnostic = useMemo(() => buildWorkspaceDiagnostic(currentDoc), [currentDoc])");
    expect(workbench).not.toContain("const hasPreviewAuth =");
    expect(workbench).not.toContain("mediaTokens.length === 0 || !hasPreviewAuth");
    expect(workbench).not.toContain("whiteboardTokens.length === 0 || !hasPreviewAuth");
    expect(workbench).not.toContain("resolvePublishRecommendationText(");
    expect(workbench).toContain("if (currentDoc?.cache?.hasLocalChanges)");
    expect(workbench).toContain("void fetchFeishuDocWhiteboardPreviewUrls(props.baseUrl, {");
    expect(workbench).toContain("createSession: true");
    expect(workbench).toContain('kind: "preview"');
    expect(workbench).toContain('kind: "feishu-doc"');
    expect(workbench).toContain('path: chatDoc.cache.originalRelativePath');
    expect(workbench).not.toContain('kind: "feishu-docs-workspace"');
    expect(app).toContain("registerAppServiceConversationLauncher");
    expect(app).toContain("pendingConversationOpenRef");
    expect(app).toContain("flushPendingConversationOpen");
    expect(app).toContain("ref={handleChatPageRef}");
    expect(bridge).toContain("pendingConversationOpensRef");
    expect(bridge).toContain("flushPendingConversationOpens");
    expect(bridge).toContain("if (request?.createSession)");
    expect(pane).toContain("openConversation: async (input) => {");
    expect(pane).toContain("const createdSession = await state.createSession()");
    expect(pane).toContain("Keep session creation and draft prefill resilient");
    expect(services).toContain('window.location.hash = "chat"');
    expect(workbench).not.toContain("if (props.workspaceId && !item.cache)");
    expect(workbench).not.toContain("openFeishuDocIR(props.baseUrl, { workspaceId: props.workspaceId, docId })");
    expect(workbench).not.toContain("pullFeishuDocIR(props.baseUrl");
  });

  test("workbench does not expose browser-open action without a reliable document url source", async () => {
    const workbench = await source("src/mainview/modules/feishu/components/docs-workbench.tsx");

    expect(workbench).not.toContain('const activeDocUrl = activeDoc?.url?.trim() ?? ""');
    expect(workbench).not.toContain('await openDesktopExternalUrl(activeDocUrl)');
    expect(workbench).not.toContain('icon={<ExportOutlined />}');
    expect(workbench).not.toContain('aria-label="在浏览器打开当前文档"');
  });
});
