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
    const feishuLib = await source("src/mainview/lib/feishu.ts");
    const desktopFeishuLib = await source("src/mainview/lib/desktop-feishu.ts");
    const windowBridge = await source("src/mainview/lib/electrobun-window-bridge.ts");
    const bunIndex = await source("src/bun/index.ts");
    const workbench = await source("src/mainview/modules/feishu/components/docs-workbench.tsx");
    const draftBuilder = await source("src/mainview/modules/feishu/components/feishu-doc-chat-draft.ts");
    const page = await source("src/mainview/modules/feishu/page.tsx");
    const app = await source("src/mainview/App.tsx");
    const services = await source("src/mainview/services/app-service-container.ts");
    const bridge = await source("src/mainview/modules/chat/hooks/use-chat-workspace-pane-bridge.ts");
    const pane = await source("src/mainview/modules/chat/components/workspace-pane.tsx");

    expect(workbench).toContain("? await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)");
    expect(workbench).toContain('buildFeishuDocChatDraftBatchText');
    expect(workbench).toContain('buildFeishuDocChatDraftText');
    expect(workbench).toContain('collectNodeAndDescendantKeys');
    expect(workbench).toContain('FEISHU_DOC_WRITER_AGENT_ID');
    expect(workbench).toContain("draftText: buildFeishuDocChatDraftText({");
    expect(workbench).toContain("draftText: buildFeishuDocChatDraftBatchText(preparedDocs.map((item) => ({");
    expect(workbench).toContain('selectedAgentId: FEISHU_DOC_WRITER_AGENT_ID');
    expect(workbench).toContain("const result = await pullFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId)");
    expect(workbench).toContain('import { FeishuDocPermissionInspectModal } from "./feishu-doc-permission-inspect-modal"');
    expect(workbench).toContain("inspectFeishuWorkspaceDocPermissions(props.baseUrl, props.workspaceId, currentDoc.docId)");
    expect(workbench).toContain('props.t("飞书页.文档.按钮.权限自检")');
    expect(workbench).toContain("whiteboardRecovery.permissionDeniedCount");
    expect(workbench).toContain("preloadSubtree: options?.preloadSubtree");
    expect(workbench).toContain("const nextNodes = result.subtree?.length");
    expect(workbench).toContain("mapTreeSnapshotNodes(result.subtree)");
    expect(workbench).toContain("await hydrateTreeBranches(normalizedRootDocId, nextNodes, {");
    expect(workbench).toContain("<FeishuDocVisualEditor");
    expect(workbench).toContain("mdx={draft}");
    expect(workbench).not.toContain('className="feishu-docs-workspace-view-switch is-secondary"');
    expect(workbench).toContain("treeNodes: snapshotTreeNodes(treeNodes)");
    expect(workbench).toContain("checkedTreeKeys,");
    expect(page).toContain("initialTreeNodes={docsUiState.treeNodes}");
    expect(page).toContain("initialCheckedTreeKeys={docsUiState.checkedTreeKeys}");
    expect(page).toContain("readSavedFeishuActiveWorkspaceId");
    expect(draftBuilder).toContain("original_markdown_path:");
    expect(draftBuilder).toContain("本次任务请使用“飞书文档助手”智能体处理。");
    expect(draftBuilder).toContain('    "---",');
    expect(draftBuilder).toContain('    "注意：",');
    expect(draftBuilder).not.toContain("请在上方填写你的问题或任务。");
    expect(draftBuilder).not.toContain("doc_token:");
    expect(draftBuilder).not.toContain("create_target:");
    expect(draftBuilder).not.toContain("workflow:");
    expect(workbench).toContain("draftRelativePath: chatDoc.cache?.draftRelativePath");
    expect(workbench).toContain("const chatPreviewPath = chatDoc.cache?.draftRelativePath ?? chatDoc.cache?.originalRelativePath");
    expect(workbench).toContain("const chatPreviewFallbackPath = chatDoc.cache?.draftRelativePath");
    expect(workbench).not.toContain("当前依据：飞书原始结构 + 结构化基线");
    expect(workbench).not.toContain("推荐发布方式：先重新拉取远端基线");
    expect(workbench).not.toContain("未知块保留：");
    expect(workbench).not.toContain("const workspaceDiagnostic = useMemo(() => buildWorkspaceDiagnostic(currentDoc), [currentDoc])");
    expect(workbench).not.toContain("const hasPreviewAuth =");
    expect(workbench).not.toContain("mediaTokens.length === 0 || !hasPreviewAuth");
    expect(workbench).not.toContain("whiteboardTokens.length === 0 || !hasPreviewAuth");
    expect(workbench).not.toContain("resolvePublishRecommendationText(");
    expect(workbench).toContain("if (currentDoc?.cache?.hasLocalChanges)");
    expect(workbench).toContain("boardSnapshots={currentDoc.boardSnapshots}");
    expect(workbench).not.toContain("fetchFeishuDocWhiteboardPreviewUrls");
    expect(workbench).toContain("createSession: true");
    expect(workbench).toContain('treeSelectionMode === "include_subtree"');
    expect(workbench).toContain('props.t("飞书页.文档.按钮.仅当前")');
    expect(workbench).toContain('props.t("飞书页.文档.按钮.含子文档")');
    expect(workbench).toContain('props.t("飞书页.文档.按钮.补选子文档")');
    expect(workbench).toContain('props.t("飞书页.文档.按钮.取消子文档")');
    expect(workbench).toContain("void loadTree(treeRootDocId, { forceRefresh: true, preloadSubtree: true })");
    expect(workbench).toContain("void loadTree(nextRoot, { forceRefresh: true, preloadSubtree: true })");
    expect(workbench).toContain('void loadTree(treeRootDocId.trim(), { preloadSubtree: true })');
    expect(workbench).toContain('kind: "preview"');
    expect(workbench).toContain('kind: "feishu-doc"');
    expect(workbench).toContain("path: chatPreviewPath");
    expect(workbench).toContain("fallbackPath: chatPreviewFallbackPath");
    expect(workbench).toContain("checkable");
    expect(workbench).toContain("checkStrictly");
    expect(workbench).not.toContain('kind: "feishu-docs-workspace"');
    expect(app).toContain("registerAppServiceConversationLauncher");
    expect(app).toContain("pendingConversationOpenRef");
    expect(app).toContain("flushPendingConversationOpen");
    expect(app).toContain("ref={handleChatPageRef}");
    expect(bridge).toContain("pendingConversationOpensRef");
    expect(bridge).toContain("flushPendingConversationOpens");
    expect(bridge).toContain("if (request?.createSession)");
    expect(pane).toContain("openConversation: async (input) => {");
    expect(pane).toContain("const createdSession = await state.createSession({");
    expect(pane).toContain("selectedAgentId: input.selectedAgentId");
    expect(pane).toContain("Keep session creation and draft prefill resilient");
    expect(services).toContain('window.location.hash = "chat"');
    expect(workbench).not.toContain("if (props.workspaceId && !item.cache)");
    expect(workbench).not.toContain("openFeishuDocIR(props.baseUrl, { workspaceId: props.workspaceId, docId })");
    expect(workbench).not.toContain("pullFeishuDocIR(props.baseUrl");
    expect(feishuLib).toContain("export async function inspectFeishuWorkspaceDocPermissions");
    expect(desktopFeishuLib).toContain("inspectDesktopFeishuWorkspaceDocPermissions");
    expect(windowBridge).toContain("rpc.request.inspectDesktopFeishuWorkspaceDocPermissions({ workspaceId, docId })");
    expect(bunIndex).toContain("resolveDesktopFeishuQueryPort(host).inspectWorkspaceDocPermissions({ workspaceId, docId })");
  });

  test("workbench does not expose browser-open action without a reliable document url source", async () => {
    const workbench = await source("src/mainview/modules/feishu/components/docs-workbench.tsx");

    expect(workbench).not.toContain('const activeDocUrl = activeDoc?.url?.trim() ?? ""');
    expect(workbench).not.toContain('await openDesktopExternalUrl(activeDocUrl)');
    expect(workbench).not.toContain('icon={<ExportOutlined />}');
    expect(workbench).not.toContain('aria-label="在浏览器打开当前文档"');
  });
});
