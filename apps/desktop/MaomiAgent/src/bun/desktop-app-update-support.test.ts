import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
  buildDesktopGitHubApiUrl,
  buildDesktopLatestReleaseUrl,
  buildDesktopReleasesUrl,
  DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
  loadDesktopAppUpdateConfig,
  normalizeDesktopAppUpdateArch,
  normalizeDesktopAppUpdateChannel,
  normalizeDesktopAppUpdateOs,
  resolveDesktopAppUpdateConfig,
} from "./desktop-app-update/config";
import {
  parseDesktopAppPublicLatestRelease,
  selectDesktopAppPublicReleaseAssets,
} from "./desktop-app-update/public-contract";
import {
  WINDOWS_ONLY_DESKTOP_APP_UPDATE_MESSAGE,
  resolveDesktopAppUpdatePlatformExecutor,
} from "./desktop-app-update/platform-executor";

describe("desktop app update config support", () => {
  test("loads packaged GitHub repository update config", () => {
    const config = resolveDesktopAppUpdateConfig({
      packagedConfig: {
        owner: "octo-org",
        repo: "MaomiAgent",
        channel: "stable",
        os: "macos",
        arch: "arm64",
      },
      env: {},
    });

    expect(config).toEqual({
      provider: "github",
      owner: "octo-org",
      repo: "MaomiAgent",
      channel: DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
      os: "macos",
      arch: "arm64",
      includePrerelease: false,
    });
  });

  test("loads packaged preview config from update-config.json", async () => {
    const resourcesRoot = await mkdtemp(path.join(os.tmpdir(), "maomi-desktop-update-config-"));

    try {
      const appRoot = path.join(resourcesRoot, "app");
      await mkdir(appRoot, { recursive: true });
      await writeFile(
        path.join(appRoot, "update-config.json"),
        JSON.stringify({
          owner: "octo-org",
          repo: "MaomiAgent",
          channel: "preview",
          os: "win",
          arch: "x64",
        }),
        "utf8",
      );

      const config = await loadDesktopAppUpdateConfig(resourcesRoot, {});

      expect(config.owner).toBe("octo-org");
      expect(config.repo).toBe("MaomiAgent");
      expect(config.channel).toBe("preview");
      expect(config.includePrerelease).toBe(true);
      expect(config.os).toBe("win");
      expect(config.arch).toBe("x64");
    } finally {
      await rm(resourcesRoot, { recursive: true, force: true });
    }
  });

  test("builds documented GitHub release api routes", () => {
    expect(buildDesktopGitHubApiUrl({
      owner: "octo-org",
      repo: "MaomiAgent",
    }, "releases", "latest")).toBe(
      "https://api.github.com/repos/octo-org/MaomiAgent/releases/latest",
    );
    expect(buildDesktopLatestReleaseUrl({
      owner: "octo-org",
      repo: "MaomiAgent",
    })).toBe("https://api.github.com/repos/octo-org/MaomiAgent/releases/latest");
    expect(buildDesktopReleasesUrl({
      owner: "octo-org",
      repo: "MaomiAgent",
    })).toBe("https://api.github.com/repos/octo-org/MaomiAgent/releases");
  });

  test("normalizes preview aliases and platform identifiers", () => {
    expect(normalizeDesktopAppUpdateChannel("canary")).toBe("preview");
    expect(normalizeDesktopAppUpdateChannel("stable")).toBe("stable");
    expect(normalizeDesktopAppUpdateOs("win32")).toBe("win");
    expect(normalizeDesktopAppUpdateOs("darwin")).toBe("macos");
    expect(normalizeDesktopAppUpdateArch("amd64")).toBe("x64");
    expect(normalizeDesktopAppUpdateArch("aarch64")).toBe("arm64");
  });
});

describe("desktop app public contract support", () => {
  test("extracts the current platform assets from a GitHub release payload", () => {
    const payload = parseDesktopAppPublicLatestRelease({
      id: 42,
      tag_name: "v1.2.3",
      name: "MaomiAgent 1.2.3",
      body: "Release notes",
      assets: [
        {
          id: 11,
          name: "stable-macos-arm64-MaomiAgent.dmg",
          size: 1,
          browser_download_url: "https://example.test/maomi.dmg",
        },
        {
          id: 12,
          name: "stable-linux-x64-MaomiAgent.tar.zst",
          size: 2,
          browser_download_url: "https://example.test/linux.tar.zst",
        },
        {
          id: 13,
          name: "stable-macos-arm64-MaomiAgent.app.tar.zst",
          size: 3,
          browser_download_url: "https://example.test/macos.tar.zst",
        },
        {
          id: 14,
          name: "stable-macos-arm64-update.json",
          size: 4,
          browser_download_url: "https://example.test/update.json",
        },
      ],
    });

    const assets = selectDesktopAppPublicReleaseAssets(payload.assets, {
      os: "macos",
      arch: "arm64",
    });

    expect(payload.versionId).toBe(42);
    expect(payload.version).toBe("1.2.3.0");
    expect(payload.versionCode).toBe(10203000);
    expect(payload.title).toBe("MaomiAgent 1.2.3");
    expect(payload.releaseNotes).toBe("Release notes");
    expect(assets.bundleAsset?.assetId).toBe(13);
    expect(assets.bundleAsset?.downloadUrl).toBe("https://example.test/macos.tar.zst");
    expect(assets.bundleAsset?.os).toBe("macos");
    expect(assets.bundleAsset?.arch).toBe("arm64");
    expect(assets.updateInfoAsset?.assetId).toBe(14);
    expect(assets.installerAsset?.assetId).toBe(11);
  });

  test("infers preview payloads from the GitHub prerelease flag", () => {
    const payload = parseDesktopAppPublicLatestRelease({
      id: 99,
      tag_name: "v1.2.3_preview",
      prerelease: true,
      assets: [],
    });

    expect(payload.version).toBe("1.2.3.0_preview");
    expect(payload.isPrerelease).toBe(true);
  });
});

describe("desktop app update platform support", () => {
  test("returns a clear unsupported executor outside win32", () => {
    const executor = resolveDesktopAppUpdatePlatformExecutor("linux");

    expect(executor).toEqual({
      supported: false,
      message: WINDOWS_ONLY_DESKTOP_APP_UPDATE_MESSAGE,
    });
  });
});
