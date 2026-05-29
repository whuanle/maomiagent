import { describe, expect, test } from "bun:test";

import {
  isDesktopZoomKeyboardShortcut,
  isDesktopZoomWheelShortcut,
} from "./desktop-zoom-guard";

describe("desktop zoom guard", () => {
  test("matches ctrl or command zoom keyboard shortcuts", () => {
    expect(isDesktopZoomKeyboardShortcut({
      altKey: false,
      code: "Equal",
      ctrlKey: true,
      key: "=",
      metaKey: false,
    })).toBe(true);

    expect(isDesktopZoomKeyboardShortcut({
      altKey: false,
      code: "Minus",
      ctrlKey: false,
      key: "-",
      metaKey: true,
    })).toBe(true);

    expect(isDesktopZoomKeyboardShortcut({
      altKey: false,
      code: "Digit0",
      ctrlKey: true,
      key: "0",
      metaKey: false,
    })).toBe(true);

    expect(isDesktopZoomKeyboardShortcut({
      altKey: false,
      code: "NumpadAdd",
      ctrlKey: true,
      key: "Add",
      metaKey: false,
    })).toBe(true);
  });

  test("ignores unrelated keyboard shortcuts", () => {
    expect(isDesktopZoomKeyboardShortcut({
      altKey: false,
      code: "KeyK",
      ctrlKey: true,
      key: "k",
      metaKey: false,
    })).toBe(false);

    expect(isDesktopZoomKeyboardShortcut({
      altKey: true,
      code: "Equal",
      ctrlKey: true,
      key: "=",
      metaKey: false,
    })).toBe(false);

    expect(isDesktopZoomKeyboardShortcut({
      altKey: false,
      code: "Equal",
      ctrlKey: false,
      key: "=",
      metaKey: false,
    })).toBe(false);
  });

  test("matches ctrl or command wheel zoom gestures", () => {
    expect(isDesktopZoomWheelShortcut({
      ctrlKey: true,
      metaKey: false,
    })).toBe(true);

    expect(isDesktopZoomWheelShortcut({
      ctrlKey: false,
      metaKey: true,
    })).toBe(true);

    expect(isDesktopZoomWheelShortcut({
      ctrlKey: false,
      metaKey: false,
    })).toBe(false);
  });
});
