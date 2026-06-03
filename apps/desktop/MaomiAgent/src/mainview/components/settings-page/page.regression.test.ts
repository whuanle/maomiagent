import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workspaceRoot = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8");
}

describe("settings page navigation", () => {
  test("defines four settings menus including a separate avatar section", async () => {
    const page = await source("src/mainview/components/settings-page/page.tsx");

    expect(page).toContain('type SettingsPageSection = "preferences" | "avatar" | "menu" | "runtime";');
    expect(page).toContain('props.t("设置页.标题.桌面偏好")');
    expect(page).toContain('props.t("设置页.标题.对话头像设置")');
    expect(page).toContain('props.t("设置页.标题.标题栏菜单")');
    expect(page).toContain('props.t("设置页.标题.运行时消息")');
    expect(page).toContain('activeSection === "avatar"');
  });

  test("renders desktop preferences and avatar settings in separate branches", async () => {
    const page = await source("src/mainview/components/settings-page/page.tsx");

    expect(page).toContain(') : activeSection === "avatar" ? (');
    expect(page).toContain('<AvatarSettingsPanel');
    expect(page).toContain('<DesktopPreferencesPanel');
  });
});