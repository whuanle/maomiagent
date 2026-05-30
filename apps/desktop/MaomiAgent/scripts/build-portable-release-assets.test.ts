import { describe, expect, test } from "bun:test";

import {
  createPortableLinuxLaunchEntry,
  createPortableWindowsLaunchEntry,
  resolvePortableReleaseAssetName,
} from "./build-portable-release-assets";

describe("build-portable-release-assets", () => {
  test("resolves portable release asset names for supported targets", () => {
    expect(
      resolvePortableReleaseAssetName({
        channel: "stable",
        os: "win",
        arch: "x64",
        format: "portable-zip",
      }),
    ).toBe("stable-win-x64-MaomiAgent-portable.zip");

    expect(
      resolvePortableReleaseAssetName({
        channel: "stable",
        os: "linux",
        arch: "x64",
        format: "portable-zip",
      }),
    ).toBe("stable-linux-x64-MaomiAgent-portable.zip");

    expect(
      resolvePortableReleaseAssetName({
        channel: "stable",
        os: "macos",
        arch: "arm64",
        format: "app-zip",
      }),
    ).toBe("stable-macos-arm64-MaomiAgent.app.zip");
  });

  test("creates the Windows portable launcher wrapper", () => {
    expect(createPortableWindowsLaunchEntry("bin\\launcher.exe")).toContain(
      'start "" "%~dp0bin\\launcher.exe"',
    );
  });

  test("creates the Linux portable launcher wrapper", () => {
    expect(createPortableLinuxLaunchEntry("bin/launcher")).toContain(
      'exec "$DIR/bin/launcher" "$@"',
    );
  });
});
