import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  createPortableLinuxLaunchEntry,
  createPortableWindowsLaunchEntry,
  exportPortableAssets,
  resolveArtifactRootCleanupPaths,
  resolvePortableArchiveCommand,
  resolvePortableMacosDmgSourcePath,
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
        createArchive: async (input) => {
          writeFileSync(input.destinationPath, `archive:${input.sourceEntryName}`);
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

  test("copies the native macOS dmg when nativeMacosDmgPath is provided", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-macos-native-dmg-"));

    try {
      const artifactRoot = join(tempRoot, "artifacts");
      const bundleRoot = join(tempRoot, "build", "stable-macos-arm64", "MaomiAgent.app");
      const nativeDmgPath = join(tempRoot, "native-artifacts", "stable-macos-arm64-MaomiAgent.dmg");

      mkdirSync(bundleRoot, { recursive: true });
      mkdirSync(dirname(nativeDmgPath), { recursive: true });
      writeFileSync(nativeDmgPath, "native-dmg");

      const exportedAssets = await exportPortableAssets({
        artifactRoot,
        bundleRoot,
        channel: "stable",
        targetPlatform: {
          os: "macos",
          arch: "arm64",
        },
        macosReleaseFormat: "dmg",
        nativeMacosDmgPath: nativeDmgPath,
        createArchive: async (input) => {
          writeFileSync(input.destinationPath, "macos-app-zip");
        },
      });

      expect(readFileSync(exportedAssets.releaseAssetPath, "utf8")).toBe("native-dmg");
      expect(basename(exportedAssets.releaseAssetPath)).toBe("stable-macos-arm64-MaomiAgent.dmg");
      expect(basename(exportedAssets.npmArchivePath)).toBe("macos-arm64-app.zip");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("falls back to a sibling macOS dmg when nativeMacosDmgPath is absent", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-macos-sibling-dmg-"));

    try {
      const artifactRoot = join(tempRoot, "artifacts");
      const bundleRoot = join(tempRoot, "build", "stable-macos-arm64", "MaomiAgent.app");
      const siblingDmgPath = join(dirname(bundleRoot), "MaomiAgent.dmg");

      mkdirSync(bundleRoot, { recursive: true });
      writeFileSync(siblingDmgPath, "sibling-dmg");

      const exportedAssets = await exportPortableAssets({
        artifactRoot,
        bundleRoot,
        channel: "stable",
        targetPlatform: {
          os: "macos",
          arch: "arm64",
        },
        macosReleaseFormat: "dmg",
        createArchive: async (input) => {
          writeFileSync(input.destinationPath, "macos-app-zip");
        },
      });

      expect(readFileSync(exportedAssets.releaseAssetPath, "utf8")).toBe("sibling-dmg");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("selects ditto for darwin app archives", () => {
    const command = resolvePortableArchiveCommand("darwin", {
      sourceRoot: join("tmp", "build"),
      sourceEntryName: "MaomiAgent.app",
      destinationPath: join("tmp", "artifacts", "macos-arm64-app.zip"),
    });

    expect(command.cwd).toBe(join("tmp", "build"));
    expect(command.command).toEqual([
      "ditto",
      "-c",
      "-k",
      "--keepParent",
      "MaomiAgent.app",
      resolve(join("tmp", "artifacts", "macos-arm64-app.zip")),
    ]);
  });

  test("resolves scoped artifact cleanup paths only for newly created root entries", () => {
    expect(
      resolveArtifactRootCleanupPaths({
        artifactRoot: join("tmp", "artifacts"),
        beforeEntryNames: ["keep.txt", "shared.log"],
        afterEntryNames: ["keep.txt", "shared.log", "stable-update.json", "stable-macos-arm64-MaomiAgent.dmg"],
      }),
    ).toEqual([
      join("tmp", "artifacts", "stable-update.json"),
      join("tmp", "artifacts", "stable-macos-arm64-MaomiAgent.dmg"),
    ]);
  });

  test("resolves native macOS dmg path before falling back to the sibling dmg", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-macos-dmg-source-"));

    try {
      const bundleRoot = join(tempRoot, "build", "stable-macos-arm64", "MaomiAgent.app");
      const nativeDmgPath = join(tempRoot, "native", "stable-macos-arm64-MaomiAgent.dmg");
      const siblingDmgPath = join(dirname(bundleRoot), "MaomiAgent.dmg");

      mkdirSync(bundleRoot, { recursive: true });
      mkdirSync(dirname(nativeDmgPath), { recursive: true });
      writeFileSync(nativeDmgPath, "native-dmg");
      writeFileSync(siblingDmgPath, "sibling-dmg");

      expect(resolvePortableMacosDmgSourcePath(nativeDmgPath, bundleRoot)).toBe(nativeDmgPath);

      rmSync(nativeDmgPath, { force: true });
      expect(resolvePortableMacosDmgSourcePath(undefined, bundleRoot)).toBe(siblingDmgPath);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
