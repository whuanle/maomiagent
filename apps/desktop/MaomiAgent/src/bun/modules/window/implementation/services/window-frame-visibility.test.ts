import { describe, expect, test } from "bun:test";

import { resolveNearestWorkArea } from "./window-frame-visibility";

describe("resolveNearestWorkArea", () => {
  test("prefers the secondary display when the window is already on it", () => {
    const previousScreen = globalThis.Screen;
    const previousDisableWindowsScreenQuery = process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY;
    process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY = "1";

    Object.assign(globalThis, {
      Screen: {
        getAllDisplays() {
          return [
            {
              workArea: { x: 0, y: 0, width: 1920, height: 1080 },
              bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            },
            {
              workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
              bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
            },
          ];
        },
        getPrimaryDisplay() {
          return {
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          };
        },
      },
    });

    try {
      expect(resolveNearestWorkArea({
        x: 2200,
        y: 140,
        width: 1200,
        height: 800,
      })).toEqual({
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
      });
    } finally {
      if (previousDisableWindowsScreenQuery === undefined) {
        delete process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY;
      } else {
        process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY = previousDisableWindowsScreenQuery;
      }
      Object.assign(globalThis, {
        Screen: previousScreen,
      });
    }
  });
});
