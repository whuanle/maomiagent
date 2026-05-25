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

    expect(workbench).toContain("? await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)");
    expect(workbench).toContain("const result = await pullFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId)");
    expect(workbench).toContain("<FeishuDocVisualEditor");
    expect(workbench).toContain("mdx={draft}");
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
