import { describe, expect, it } from "bun:test";

import { resolveDesktopExternalNavigationTarget } from "./external-link-delegation";

describe("resolveDesktopExternalNavigationTarget", () => {
  it("returns external https targets", () => {
    expect(resolveDesktopExternalNavigationTarget({
      href: "https://example.com/docs",
      currentLocationHref: "http://127.0.0.1:5173/chat",
    })).toBe("https://example.com/docs");
  });

  it("keeps same-origin routes inside the app", () => {
    expect(resolveDesktopExternalNavigationTarget({
      href: "/settings/models",
      currentLocationHref: "http://127.0.0.1:5173/chat",
    })).toBeNull();
  });

  it("allows mailto links to open externally", () => {
    expect(resolveDesktopExternalNavigationTarget({
      href: "mailto:support@example.com",
      currentLocationHref: "http://127.0.0.1:5173/chat",
    })).toBe("mailto:support@example.com");
  });

  it("ignores anchors and unsupported protocols", () => {
    expect(resolveDesktopExternalNavigationTarget({
      href: "#section-2",
      currentLocationHref: "http://127.0.0.1:5173/chat",
    })).toBeNull();
    expect(resolveDesktopExternalNavigationTarget({
      href: "javascript:alert(1)",
      currentLocationHref: "http://127.0.0.1:5173/chat",
    })).toBeNull();
  });
});