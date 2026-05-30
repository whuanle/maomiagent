import { describe, expect, test } from "bun:test";

import {
  buildDesktopNativePackagingFailureMessage,
  formatDesktopReleaseTargetPlatform,
  resolveDesktopReleaseArtifactMode,
} from "./build-electrobun-release-policy";

describe("desktop Electrobun release policy", () => {
  test("only linux may fall back to bundle-only release artifacts", () => {
    expect(resolveDesktopReleaseArtifactMode({ os: "linux", arch: "x64" })).toBe("bundle-fallback");
    expect(resolveDesktopReleaseArtifactMode({ os: "win", arch: "x64" })).toBe("native-only");
    expect(resolveDesktopReleaseArtifactMode({ os: "macos", arch: "arm64" })).toBe("native-only");
  });

  test("formats target platforms consistently for release diagnostics", () => {
    expect(formatDesktopReleaseTargetPlatform({ os: "linux", arch: "x64" })).toBe("linux-x64");
    expect(formatDesktopReleaseTargetPlatform({ os: "macos", arch: "arm64" })).toBe("macos-arm64");
  });

  test("explains installer-only failures for windows and macOS", () => {
    expect(
      buildDesktopNativePackagingFailureMessage(
        { os: "win", arch: "x64" },
        "Command failed with exit code 1",
      ),
    ).toContain("Bundle-only fallback is disabled for win releases");
    expect(
      buildDesktopNativePackagingFailureMessage(
        { os: "macos", arch: "arm64" },
        "codesign failed",
      ),
    ).toContain("Native macos-arm64 desktop release packaging failed");
  });

  test("keeps linux bundle-only retry diagnostics explicit", () => {
    expect(
      buildDesktopNativePackagingFailureMessage(
        { os: "linux", arch: "x64" },
        "missing shared object",
      ),
    ).toContain("retrying with bundle-only export");
  });
});
