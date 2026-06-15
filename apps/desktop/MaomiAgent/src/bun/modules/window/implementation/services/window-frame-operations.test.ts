import { describe, expect, test } from "bun:test";

import {
  resolveCenteredFrameInWorkArea,
  resolveRestoreFrameForDrag,
  resizeFrameFromPointer,
} from "./window-frame-operations";

describe("window-frame-operations", () => {
  test("centers a restored window inside the current display work area", () => {
    expect(resolveCenteredFrameInWorkArea({
      workArea: {
        x: 2560,
        y: 0,
        width: 2560,
        height: 1440,
      },
      frame: {
        width: 1240,
        height: 840,
      },
    })).toEqual({
      x: 3220,
      y: 300,
      width: 1240,
      height: 840,
    });
  });

  test("resizes from the west edge while preserving the minimum width", () => {
    expect(resizeFrameFromPointer({
      edge: "w",
      startFrame: {
        x: 400,
        y: 180,
        width: 800,
        height: 600,
      },
      startScreenX: 400,
      startScreenY: 180,
      screenX: 950,
      screenY: 180,
    })).toEqual({
      x: 720,
      y: 180,
      width: 480,
      height: 600,
    });
  });

  test("restores drag from a maximized frame on the same display", () => {
    expect(resolveRestoreFrameForDrag({
      maximizedFrame: {
        x: 2560,
        y: 0,
        width: 2560,
        height: 1440,
      },
      restoreFrame: {
        x: 2800,
        y: 120,
        width: 1280,
        height: 860,
      },
      dragPointer: {
        offsetX: 1280,
        offsetY: 18,
        windowWidth: 2560,
      },
    })).toEqual({
      x: 3200,
      y: 0,
      width: 1280,
      height: 860,
    });
  });
});
