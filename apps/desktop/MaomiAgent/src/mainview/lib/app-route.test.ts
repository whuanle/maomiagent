import { describe, expect, test } from "bun:test";

import {
  getMainviewRouteOwner,
  isNativeMainviewRoute,
  parseRouteFromHash,
  resolveVisibleMainviewRoute,
  shouldKeepMainviewRouteMounted,
  shouldMountMainviewRoute,
} from "./app-route";
import { TITLEBAR_MENU_ITEMS } from "../config/titlebar";

describe("desktop route ownership", () => {
  test("keeps desktop routes on the native desktop shell", () => {
    expect(parseRouteFromHash("#logs")).toBe("logs");
    expect(parseRouteFromHash("#ui-designer")).toBe("ui-designer");
    expect(parseRouteFromHash("#shell")).toBe("shell");
    expect(getMainviewRouteOwner("logs")).toBe("native");
    expect(isNativeMainviewRoute("logs")).toBe(true);
    expect(getMainviewRouteOwner("settings")).toBe("native");
    expect(isNativeMainviewRoute("settings")).toBe(true);
    expect(getMainviewRouteOwner("workspace")).toBe("native");
    expect(isNativeMainviewRoute("workspace")).toBe(true);
    expect(getMainviewRouteOwner("chat")).toBe("native");
    expect(isNativeMainviewRoute("chat")).toBe(true);
    expect(getMainviewRouteOwner("ui-designer")).toBe("native");
    expect(isNativeMainviewRoute("ui-designer")).toBe(true);
    expect(getMainviewRouteOwner("shell")).toBe("legacy");
    expect(isNativeMainviewRoute("shell")).toBe(false);
  });

  test("parses only known desktop hash routes", () => {
    expect(parseRouteFromHash("#logs")).toBe("logs");
    expect(parseRouteFromHash("#ui-designer")).toBe("ui-designer");
    expect(parseRouteFromHash("settings")).toBe("settings");
    expect(parseRouteFromHash("#browser")).toBeNull();
    expect(parseRouteFromHash("#missing-route")).toBeNull();
    expect(parseRouteFromHash("")).toBeNull();
  });

  test("maps hidden routes back to chat and keeps shell out of the titlebar menu", () => {
    expect(resolveVisibleMainviewRoute("shell")).toBe("chat");
    expect(resolveVisibleMainviewRoute("browser")).toBe("chat");
    expect(resolveVisibleMainviewRoute("tasks")).toBe("tasks");
    expect(TITLEBAR_MENU_ITEMS.some((item) => item.key === "shell")).toBe(false);
  });

  test("keeps chat mounted while other menu pages remain on-demand", () => {
    expect(shouldKeepMainviewRouteMounted("chat")).toBe(true);
    expect(shouldKeepMainviewRouteMounted("workspace")).toBe(false);
    expect(shouldMountMainviewRoute("chat", "workspace")).toBe(true);
    expect(shouldMountMainviewRoute("workspace", "workspace")).toBe(true);
    expect(shouldMountMainviewRoute("logs", "workspace")).toBe(false);
  });
});
