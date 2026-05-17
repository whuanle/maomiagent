import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
  DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL,
  DEFAULT_DESKTOP_APP_UPDATE_SOFTWARE_CODE,
  loadDesktopAppUpdateConfig,
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
  test("falls back to the repository-safe public URL defaults when the packaged config is missing", () => {
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
});

describe("desktop app public contract support", () => {
  test("extracts bundle and update-info assets from the WoAI public latest payload", () => {
    const payload = parseDesktopAppPublicLatestRelease({
      HasUpdate: true,
      ReleaseId: 42,
      Version: "1.2.3",
      Assets: [
        {
          AssetId: 11,
          PackageType: "installer",
          PackageFormat: "exe",
          FileName: "MaomiAgentSetup.exe",
          FileSize: 1,
        },
        {
          AssetId: 12,
          PackageType: "bundle",
          PackageFormat: "tar.zst",
          FileName: "stable-win-x64-MaomiAgent.tar.zst",
          FileSize: 2,
        },
        {
          AssetId: 13,
          PackageType: "update-info",
          PackageFormat: "json",
          FileName: "stable-win-x64-update.json",
          FileSize: 3,
        },
      ],
    });

    const assets = selectDesktopAppPublicReleaseAssets(payload.assets);

    expect(payload.hasUpdate).toBe(true);
    expect(payload.releaseId).toBe(42);
    expect(payload.version).toBe("1.2.3");
    expect(assets.bundleAsset?.assetId).toBe(12);
    expect(assets.updateInfoAsset?.assetId).toBe(13);
    expect(assets.installerAsset?.assetId).toBe(11);
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