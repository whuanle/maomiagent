import { describe, expect, test } from "bun:test";

import {
  findContextMenuAllowTarget,
  shouldBlockDesktopContextMenu,
} from "./desktop-contextmenu-guard";

describe("desktop context menu guard", () => {
  function createTarget(input?: { parent?: ReturnType<typeof createTarget>; allow?: boolean }) {
    const target = {
      allow: input?.allow === true,
      parent: input?.parent ?? null,
      closest(selector: string) {
        if (selector !== "[data-allow-context-menu]") {
          return null;
        }

        if (target.allow) {
          return target;
        }

        return target.parent?.closest(selector) ?? null;
      },
    };

    return target;
  }

  test("blocks ordinary elements by default", () => {
    const element = createTarget();

    expect(shouldBlockDesktopContextMenu({
      defaultPrevented: false,
      target: element,
    })).toBe(true);
  });

  test("allows explicitly marked ancestors", () => {
    const wrapper = createTarget({ allow: true });
    const child = createTarget({ parent: wrapper });

    expect(findContextMenuAllowTarget(child)).toBe(wrapper);
    expect(shouldBlockDesktopContextMenu({
      defaultPrevented: false,
      target: child,
    })).toBe(false);
  });

  test("still blocks inputs and contenteditable nodes when unmarked", () => {
    const input = createTarget();
    const editable = createTarget();

    expect(shouldBlockDesktopContextMenu({
      defaultPrevented: false,
      target: input,
    })).toBe(true);
    expect(shouldBlockDesktopContextMenu({
      defaultPrevented: false,
      target: editable,
    })).toBe(true);
  });

  test("respects already prevented events", () => {
    const element = createTarget();

    expect(shouldBlockDesktopContextMenu({
      defaultPrevented: true,
      target: element,
    })).toBe(false);
  });
});
