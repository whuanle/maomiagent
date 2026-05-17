import { describe, expect, test } from "bun:test";

import {
  deriveWoaiVersionCode,
  isWoaiPreviewVersion,
  normalizeWoaiVersion,
  parseWoaiVersion,
} from "./woai-version";

describe("normalizeWoaiVersion", () => {
  test("normalizes three-part, four-part, and preview versions", () => {
    expect(normalizeWoaiVersion("0.0.1")).toBe("0.0.1.0");
    expect(normalizeWoaiVersion("v0.0.0.1")).toBe("0.0.0.1");
    expect(normalizeWoaiVersion("1.2.3_preview")).toBe("1.2.3.0_preview");
    expect(normalizeWoaiVersion("1.2.3.4_preview")).toBe("1.2.3.4_preview");
  });

  test("rejects unsupported version formats", () => {
    expect(normalizeWoaiVersion("1.0")).toBe("");
    expect(normalizeWoaiVersion("release-1.0.0")).toBe("");
    expect(normalizeWoaiVersion("1.2.3-beta.1")).toBe("");
  });
});

describe("parseWoaiVersion", () => {
  test("returns parsed numeric parts and preview metadata", () => {
    expect(parseWoaiVersion("1.2.3.4_preview")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      build: 4,
      isPreview: true,
      normalized: "1.2.3.4_preview",
    });
    expect(isWoaiPreviewVersion("1.2.3.4_preview")).toBe(true);
    expect(isWoaiPreviewVersion("1.2.3.4")).toBe(false);
  });
});

describe("deriveWoaiVersionCode", () => {
  test("matches the WoAI ordering examples", () => {
    expect(deriveWoaiVersionCode("1.2.3.4")).toBe(10203040);
    expect(deriveWoaiVersionCode("1.2.3.4_preview")).toBe(10203039);
    expect(deriveWoaiVersionCode("1.2.3.5_preview")).toBeGreaterThan(
      deriveWoaiVersionCode("1.2.3.4")!,
    );
  });
});
