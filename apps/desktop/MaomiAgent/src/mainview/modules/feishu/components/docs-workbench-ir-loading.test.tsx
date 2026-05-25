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

  test("workbench prefers IR open and falls back to markdown content", async () => {
    const workbench = await source("src/mainview/modules/feishu/components/docs-workbench.tsx");

    expect(workbench).toContain("openFeishuDocIR(props.baseUrl, { workspaceId: props.workspaceId, docId })");
    expect(workbench).toContain("item = createDocContentViewFromIR(result.ir)");
    expect(workbench).toContain("item = await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)");
    expect(workbench).toContain("pullFeishuDocIR(props.baseUrl");
    expect(workbench).toContain("setCurrentDocIR(result.ir)");
  });
});
