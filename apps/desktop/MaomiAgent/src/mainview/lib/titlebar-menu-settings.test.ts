import { describe, expect, test } from "bun:test";

import { normalizeTitlebarMenuSettings } from "./titlebar-menu-settings";

describe("titlebar menu settings", () => {
  test("keeps git expanded in the default menu layout", () => {
    const settings = normalizeTitlebarMenuSettings();

    expect(settings.collapsedMenuKeys).not.toContain("git");
  });

  test("drops git from legacy collapsed menu settings", () => {
    const settings = normalizeTitlebarMenuSettings({
      orderedMenuKeys: ["chat", "workspace", "git", "settings"],
      collapsedMenuKeys: ["git", "settings", "browser"],
    });

    expect(settings.collapsedMenuKeys).toEqual(["settings"]);
  });
});
