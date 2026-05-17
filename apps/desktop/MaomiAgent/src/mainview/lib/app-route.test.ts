import { describe, expect, test } from "bun:test";

import {
  getMainviewRouteOwner,
  isNativeMainviewRoute,
  parseRouteFromHash,
  resolveVisibleMainviewRoute,
} from "./app-route";
import { TITLEBAR_MENU_ITEMS } from "../config/titlebar";

describe("desktop route ownership", () => {
  test("keeps desktop routes on the native desktop shell", () => {
    expect(parseRouteFromHash("#logs")).toBe("logs");
    expect(parseRouteFromHash("#browser")).toBe("browser");
    expect(parseRouteFromHash("#shell")).toBe("shell");
    expect(getMainviewRouteOwner("logs")).toBe("native");
    expect(isNativeMainviewRoute("logs")).toBe(true);
    expect(getMainviewRouteOwner("settings")).toBe("native");
    expect(isNativeMainviewRoute("settings")).toBe(true);
    expect(getMainviewRouteOwner("workspace")).toBe("native");
    expect(isNativeMainviewRoute("workspace")).toBe(true);
    expect(getMainviewRouteOwner("chat")).toBe("native");
    expect(isNativeMainviewRoute("chat")).toBe(true);
    expect(getMainviewRouteOwner("browser")).toBe("native");
    expect(isNativeMainviewRoute("browser")).toBe(true);
    expect(getMainviewRouteOwner("shell")).toBe("legacy");
    expect(isNativeMainviewRoute("shell")).toBe(false);
  });

  test("parses only known desktop hash routes", () => {
    expect(parseRouteFromHash("#logs")).toBe("logs");
    expect(parseRouteFromHash("settings")).toBe("settings");
    expect(parseRouteFromHash("#missing-route")).toBeNull();
    expect(parseRouteFromHash("")).toBeNull();
  });

  test("maps the legacy shell route back to chat and keeps it out of the titlebar menu", () => {
    expect(resolveVisibleMainviewRoute("shell")).toBe("chat");
    expect(resolveVisibleMainviewRoute("tasks")).toBe("tasks");
    expect(TITLEBAR_MENU_ITEMS.some((item) => item.key === "shell")).toBe(false);
  });
});