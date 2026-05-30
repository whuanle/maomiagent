import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  createPortableLinuxLaunchEntry,
  createPortableWindowsLaunchEntry,
  exportPortableAssets,
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

  test("exports portable assets into clean artifact folders and writes the linux wrapper", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-assets-"));

    try {
      const artifactRoot = join(tempRoot, "artifacts");
      const bundleRoot = join(tempRoot, "build", "stable-linux-x64", "MaomiAgent");
      const staleReleasePath = join(
        artifactRoot,
        "release",
        "stable-linux-x64-MaomiAgent-portable.zip",
      );
      const staleNpmPath = join(artifactRoot, "npm", "linux-x64.zip");

      mkdirSync(join(bundleRoot, "bin"), { recursive: true });
      writeFileSync(join(bundleRoot, "bin", "launcher"), "#!/usr/bin/env sh\nexit 0\n");
      mkdirSync(join(bundleRoot, "Resources"), { recursive: true });
      writeFileSync(join(bundleRoot, "Resources", "version.json"), "{\"version\":\"0.1.0\"}\n");

      mkdirSync(join(artifactRoot, "release"), { recursive: true });
      mkdirSync(join(artifactRoot, "npm"), { recursive: true });
      writeFileSync(staleReleasePath, "stale-release");
      writeFileSync(staleNpmPath, "stale-npm");
      writeFileSync(join(artifactRoot, "release", "orphan.txt"), "remove-me");
      writeFileSync(join(artifactRoot, "npm", "orphan.txt"), "remove-me");

      const exportedAssets = await exportPortableAssets({
        artifactRoot,
        bundleRoot,
        channel: "stable",
        targetPlatform: {
          os: "linux",
          arch: "x64",
        },
      });

      expect(existsSync(exportedAssets.releaseRoot)).toBe(true);
      expect(existsSync(exportedAssets.npmRoot)).toBe(true);
      expect(existsSync(exportedAssets.releaseAssetPath)).toBe(true);
      expect(existsSync(exportedAssets.npmArchivePath)).toBe(true);
      expect(existsSync(join(artifactRoot, "release", "orphan.txt"))).toBe(false);
      expect(existsSync(join(artifactRoot, "npm", "orphan.txt"))).toBe(false);
      expect(statSync(exportedAssets.releaseAssetPath).size).toBeGreaterThan("stale-release".length);
      expect(statSync(exportedAssets.npmArchivePath).size).toBeGreaterThan("stale-npm".length);

      const launchEntryPath = join(bundleRoot, "MaomiAgent");
      expect(existsSync(launchEntryPath)).toBe(true);
      expect(readFileSync(launchEntryPath, "utf8")).toContain(
        'exec "$DIR/bin/launcher" "$@"',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
