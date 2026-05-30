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
  resolvePortableWindowsExecutableCommand,
} from "./build-portable-release-assets";
import { resolvePortableExportAfterNativePackagingFailure } from "./build-electrobun-bundle";

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

  test("resolves the Windows portable executable compile command", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-windows-exe-command-"));

    try {
      const bundleRoot = join(tempRoot, "build", "stable-win-x64", "MaomiAgent");
      mkdirSync(join(bundleRoot, "Resources"), { recursive: true });
      writeFileSync(
        join(bundleRoot, "Resources", "version.json"),
        JSON.stringify({ version: "0.0.2.0" }),
      );

      const command = resolvePortableWindowsExecutableCommand({
        bundleRoot,
        hostPlatform: "win32",
      });

      expect(command.cwd).toContain(join("apps", "desktop", "MaomiAgent"));
      expect(command.command).toContain("bun");
      expect(command.command).toContain("--compile");
      expect(command.command).toContain("--windows-hide-console");
      expect(command.command).toContain("--windows-title");
      expect(command.command).toContain("MaomiAgent");
      expect(command.command).toContain("--windows-version");
      expect(command.command).toContain("0.0.2.0");
      expect(command.command).toContain(join(bundleRoot, "MaomiAgent.exe"));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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
          writeFileSync(input.destinationPath, `archive:${input.sourceEntries.join(",")}`);
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

  test("exports windows portable assets with both cmd and exe launchers", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-windows-assets-"));

    try {
      const artifactRoot = join(tempRoot, "artifacts");
      const bundleRoot = join(tempRoot, "build", "stable-win-x64", "MaomiAgent");

      mkdirSync(join(bundleRoot, "bin"), { recursive: true });
      mkdirSync(join(bundleRoot, "Resources"), { recursive: true });
      writeFileSync(join(bundleRoot, "bin", "launcher.exe"), "launcher");
      writeFileSync(
        join(bundleRoot, "Resources", "version.json"),
        JSON.stringify({ version: "0.0.2.0" }),
      );

      const exportedAssets = await exportPortableAssets({
        artifactRoot,
        bundleRoot,
        channel: "stable",
        targetPlatform: {
          os: "win",
          arch: "x64",
        },
        createArchive: async (input) => {
          writeFileSync(input.destinationPath, `archive:${input.sourceEntries.join(",")}`);
        },
        createWindowsExecutable: async ({ bundleRoot: targetBundleRoot }) => {
          writeFileSync(join(targetBundleRoot, "MaomiAgent.exe"), "portable-exe");
        },
      });

      expect(existsSync(exportedAssets.releaseAssetPath)).toBe(true);
      expect(existsSync(exportedAssets.npmArchivePath)).toBe(true);
      expect(readFileSync(join(bundleRoot, "MaomiAgent.cmd"), "utf8")).toContain(
        'start "" "%~dp0bin\\launcher.exe"',
      );
      expect(readFileSync(join(bundleRoot, "MaomiAgent.exe"), "utf8")).toBe("portable-exe");
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
      sourceEntries: ["MaomiAgent.app"],
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

  test("uses root bundle contents for the Windows release archive", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-portable-windows-release-archive-"));

    try {
      const artifactRoot = join(tempRoot, "artifacts");
      const bundleRoot = join(tempRoot, "build", "stable-win-x64", "MaomiAgent");
      const releaseArchiveCalls: Array<{
        sourceRoot: string;
        sourceEntries: string[];
      }> = [];

      mkdirSync(join(bundleRoot, "bin"), { recursive: true });
      mkdirSync(join(bundleRoot, "Resources"), { recursive: true });
      writeFileSync(join(bundleRoot, "bin", "launcher.exe"), "launcher");
      writeFileSync(join(bundleRoot, "Resources", "version.json"), JSON.stringify({ version: "0.0.2.0" }));

      await exportPortableAssets({
        artifactRoot,
        bundleRoot,
        channel: "stable",
        targetPlatform: {
          os: "win",
          arch: "x64",
        },
        createArchive: async (input) => {
          writeFileSync(input.destinationPath, `archive:${input.sourceEntries.join(",")}`);
        },
        createReleaseArchive: async (input) => {
          releaseArchiveCalls.push({
            sourceRoot: input.sourceRoot,
            sourceEntries: input.sourceEntries,
          });
          writeFileSync(input.destinationPath, `release:${input.sourceEntries.join(",")}`);
        },
        createWindowsExecutable: async ({ bundleRoot: targetBundleRoot }) => {
          writeFileSync(join(targetBundleRoot, "MaomiAgent.exe"), "portable-exe");
        },
      });

      expect(releaseArchiveCalls).toHaveLength(1);
      expect(releaseArchiveCalls[0]).toEqual({
        sourceRoot: bundleRoot,
        sourceEntries: ["MaomiAgent.cmd", "MaomiAgent.exe", "Resources", "bin"],
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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

  test("continues portable export after native packaging failure on windows", () => {
    expect(
      resolvePortableExportAfterNativePackagingFailure({
        targetPlatform: { os: "win", arch: "x64" },
        macosReleaseFormat: "app-zip",
        hasNativeMacosDmgArtifact: false,
        errorMessage: "native packaging failed",
      }),
    ).toEqual({
      shouldContinuePortableExport: true,
      warningMessage:
        "[release] Native win-x64 packaging failed, continuing with portable release export: native packaging failed",
    });
  });

  test("continues portable export after native packaging failure on linux", () => {
    expect(
      resolvePortableExportAfterNativePackagingFailure({
        targetPlatform: { os: "linux", arch: "x64" },
        macosReleaseFormat: "app-zip",
        hasNativeMacosDmgArtifact: false,
        errorMessage: "native packaging failed",
      }),
    ).toEqual({
      shouldContinuePortableExport: true,
      warningMessage:
        "[release] Native linux-x64 packaging failed, continuing with portable release export: native packaging failed",
    });
  });

  test("continues portable export after native packaging failure on macOS app-zip releases", () => {
    expect(
      resolvePortableExportAfterNativePackagingFailure({
        targetPlatform: { os: "macos", arch: "arm64" },
        macosReleaseFormat: "app-zip",
        hasNativeMacosDmgArtifact: false,
        errorMessage: "native packaging failed",
      }),
    ).toEqual({
      shouldContinuePortableExport: true,
      warningMessage:
        "[release] Native macos-arm64 packaging failed, continuing with portable release export: native packaging failed",
    });
  });

  test("stops portable export after native packaging failure on macOS dmg releases without a native dmg", () => {
    expect(
      resolvePortableExportAfterNativePackagingFailure({
        targetPlatform: { os: "macos", arch: "arm64" },
        macosReleaseFormat: "dmg",
        nativeMacosDmgPath: join("tmp", "artifacts", "stable-macos-arm64-MaomiAgent.dmg"),
        hasNativeMacosDmgArtifact: false,
        errorMessage: "native packaging failed",
      }),
    ).toEqual({
      shouldContinuePortableExport: false,
      failureMessage:
        "Native macos-arm64 desktop release packaging failed and portable dmg export cannot continue because no native dmg artifact is available at tmp\\artifacts\\stable-macos-arm64-MaomiAgent.dmg. Original error: native packaging failed",
    });
  });

  test("continues portable export after native packaging failure on macOS dmg releases when the native dmg exists", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-native-packaging-dmg-decision-"));

    try {
      const nativeDmgPath = join(tempRoot, "stable-macos-arm64-MaomiAgent.dmg");
      writeFileSync(nativeDmgPath, "native-dmg");

      expect(
        resolvePortableExportAfterNativePackagingFailure({
          targetPlatform: { os: "macos", arch: "arm64" },
          macosReleaseFormat: "dmg",
          nativeMacosDmgPath: nativeDmgPath,
          hasNativeMacosDmgArtifact: existsSync(nativeDmgPath),
          errorMessage: "native packaging failed",
        }),
      ).toEqual({
        shouldContinuePortableExport: true,
        nativeMacosDmgPath: nativeDmgPath,
        warningMessage: `[release] Native macos-arm64 packaging failed, continuing with portable dmg export using existing artifact ${nativeDmgPath}: native packaging failed`,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
