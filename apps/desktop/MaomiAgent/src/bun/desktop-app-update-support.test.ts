import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
  buildDesktopAppUpdateApiUrl,
  buildDesktopLatestVersionUrl,
  DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
  DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL,
  DEFAULT_DESKTOP_APP_UPDATE_SOFTWARE_CODE,
  loadDesktopAppUpdateConfig,
  normalizeDesktopAppUpdatePublicBaseUrl,
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
  test("falls back to the configured public software api defaults when the packaged config is missing", () => {
    const config = resolveDesktopAppUpdateConfig({
      env: {},
    });

    expect(config).toEqual({
      publicBaseUrl: DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL,
      softwareCode: DEFAULT_DESKTOP_APP_UPDATE_SOFTWARE_CODE,
      channel: DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
      os: "win",
      arch: "x64",
    });
  });

  test("preserves an explicit empty packaged publicBaseUrl when loading update-config.json", async () => {
    const resourcesRoot = await mkdtemp(path.join(os.tmpdir(), "maomi-desktop-update-config-"));

    try {
      const appRoot = path.join(resourcesRoot, "app");
      await mkdir(appRoot, { recursive: true });
      await writeFile(
        path.join(appRoot, "update-config.json"),
        JSON.stringify({
          publicBaseUrl: "",
          softwareCode: "maomiagent",
          channel: "stable",
          os: "win",
          arch: "x64",
        }),
        "utf8",
      );

      const config = await loadDesktopAppUpdateConfig(resourcesRoot, {});

      expect(config.publicBaseUrl).toBe("");
      expect(config.softwareCode).toBe("maomiagent");
      expect(config.channel).toBe("stable");
      expect(config.os).toBe("win");
      expect(config.arch).toBe("x64");
    } finally {
      await rm(resourcesRoot, { recursive: true, force: true });
    }
  });

  test("normalizes a bare host into an https public software api base url", () => {
    expect(normalizeDesktopAppUpdatePublicBaseUrl(" api.anyai.wiki/ ")).toBe("https://api.anyai.wiki");
    expect(normalizeDesktopAppUpdatePublicBaseUrl("https://api.anyai.wiki/software/")).toBe(
      "https://api.anyai.wiki",
    );
    expect(normalizeDesktopAppUpdatePublicBaseUrl("https://api.anyai.wiki/api/software/")).toBe(
      "https://api.anyai.wiki",
    );
  });

  test("builds documented WoAI API routes for latest-version and file download requests", () => {
    expect(buildDesktopAppUpdateApiUrl("https://api.anyai.wiki", "files", "42", "download-url")).toBe(
      "https://api.anyai.wiki/api/software/files/42/download-url",
    );
    expect(buildDesktopLatestVersionUrl({
      publicBaseUrl: "https://api.anyai.wiki/software",
      softwareCode: "maomiagent",
      channel: "preview",
    })).toBe("https://api.anyai.wiki/api/software/apps/maomiagent/latest?channel=preview");
    expect(buildDesktopLatestVersionUrl({
      publicBaseUrl: "https://api.anyai.wiki/api/software",
      softwareCode: "maomiagent",
      channel: "stable",
    })).toBe("https://api.anyai.wiki/api/software/apps/maomiagent/latest?channel=stable");
  });
});

describe("desktop app public contract support", () => {
  test("extracts the current platform assets from the WoAI public latest payload", () => {
    const payload = parseDesktopAppPublicLatestRelease({
      VersionId: 42,
      Version: "1.2.3",
      VersionCode: 1002003900,
      Files: [
        {
          VersionFileId: 11,
          Os: "win",
          Arch: "x64",
          PackageType: "installer",
          FileExtension: "exe",
          FileName: "MaomiAgentSetup.exe",
          FileSize: 1,
        },
        {
          VersionFileId: 12,
          Os: "linux",
          Arch: "x64",
          PackageType: "bundle",
          FileExtension: "tar.zst",
          FileName: "stable-linux-x64-MaomiAgent.tar.zst",
          FileSize: 2,
        },
        {
          VersionFileId: 13,
          Os: "win",
          Arch: "x64",
          PackageType: "bundle",
          FileExtension: "tar.zst",
          FileName: "stable-win-x64-MaomiAgent.tar.zst",
          FileSize: 3,
        },
        {
          VersionFileId: 14,
          Os: "win",
          Arch: "x64",
          PackageType: "update-info",
          FileExtension: "json",
          FileName: "stable-win-x64-update.json",
          FileSize: 4,
        },
      ],
    });

    const assets = selectDesktopAppPublicReleaseAssets(payload.assets, {
      os: "win",
      arch: "x64",
    });

    expect(payload.versionId).toBe(42);
    expect(payload.version).toBe("1.2.3");
    expect(payload.versionCode).toBe(1002003900);
    expect(assets.bundleAsset?.assetId).toBe(13);
    expect(assets.bundleAsset?.os).toBe("win");
    expect(assets.bundleAsset?.arch).toBe("x64");
    expect(assets.updateInfoAsset?.assetId).toBe(14);
    expect(assets.installerAsset?.assetId).toBe(11);
  });

  test("infers preview payloads from the WoAI _preview suffix", () => {
    const payload = parseDesktopAppPublicLatestRelease({
      VersionId: 99,
      Version: "1.2.3.4_preview",
      VersionCode: 10203039,
      Files: [],
    });

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
