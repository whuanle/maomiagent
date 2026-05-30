import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(import.meta.dir, "..", "..", "..", "..", "..");

async function source(path: string): Promise<string> {
  return readFile(`${appRoot}/${path}`, "utf8");
}

describe("AppUpdatePanel", () => {
  test("renders download-only guidance and removes install-first actions", async () => {
    const panel = await source("src/mainview/components/settings-page/components/app-update-panel.tsx");

    expect(panel).toContain("resolveDesktopAppUpdateDownloadAsset");
    expect(panel).toContain("openDesktopExternalUrl(downloadAsset.downloadUrl)");
    expect(panel).toContain('props.t("设置页.更新.提示.便携包与Npm")');
    expect(panel).toContain('props.t("设置页.更新.按钮.下载更新")');
    expect(panel).not.toContain('props.t("设置页.更新.按钮.下载安装")');
    expect(panel).not.toContain("installDesktopAppUpdate");
  });
});
