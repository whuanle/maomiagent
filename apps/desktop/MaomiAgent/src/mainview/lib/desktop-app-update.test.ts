import { afterEach, describe, expect, test } from "bun:test";

import type {
  DesktopAppUpdateCheckResult,
  DesktopAppUpdateInstallInput,
  DesktopAppUpdateInstallResult,
} from "../../shared/desktop-updater";
import {
  canInstallDesktopAppUpdate,
  checkDesktopAppUpdate,
  installDesktopAppUpdate,
  resolveDesktopAppUpdateDownloadAsset,
} from "./desktop-app-update";

const originalWindow = globalThis.window;

type TestWindow = Window & typeof globalThis;

function installTestWindow(windowValue: Partial<TestWindow>) {
  Object.defineProperty(globalThis, "window", {
    value: windowValue,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (typeof originalWindow === "undefined") {
    delete (globalThis as { window?: Window }).window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("desktop app update bridge", () => {
  const installableResult: DesktopAppUpdateCheckResult = {
    configured: true,
    supported: true,
    installSupported: true,
    hasUpdate: true,
    currentVersion: "1.0.0",
    currentVersionCode: 100,
    currentChannel: "stable",
    releaseId: 42,
    releaseVersion: "1.1.0",
    releaseVersionCode: 110,
    bundleAsset: {
      assetId: 7,
      packageType: "bundle",
      packageFormat: "zip",
      fileName: "maomi-bundle.zip",
      fileSize: 2048,
      downloadUrl: "https://example.test/bundle.zip",
    },
  };

  const downloadableResult: DesktopAppUpdateCheckResult = {
    configured: true,
    supported: true,
    installSupported: false,
    hasUpdate: true,
    currentVersion: "1.0.0",
    currentVersionCode: 100,
    currentChannel: "stable",
    releaseId: 42,
    releaseVersion: "1.1.0",
    releaseVersionCode: 110,
    downloadAsset: {
      assetId: 9,
      packageType: "installer",
      packageFormat: "dmg",
      fileName: "stable-macos-arm64-MaomiAgent.dmg",
      fileSize: 1024,
      downloadUrl: "https://example.test/maomi.dmg",
    },
  };

  const installInput: DesktopAppUpdateInstallInput = {
    releaseId: 42,
    bundleAssetId: 7,
    bundleFileSize: 2048,
    bundleDownloadUrl: "https://example.test/bundle.zip",
    targetVersion: "1.1.0",
    targetVersionCode: 110,
    updateInfoAssetId: 9,
    updateInfoDownloadUrl: "https://example.test/update.json",
  };

  const installResult: DesktopAppUpdateInstallResult = {
    scheduled: true,
    closeRequested: false,
    targetVersion: "1.1.0",
    targetVersionCode: 110,
    message: "Ready to install.",
  };

  test("rejects with a stable error when the desktop update bridge is unavailable", async () => {
    installTestWindow({});

    await expect(checkDesktopAppUpdate()).rejects.toThrow(
      "Desktop app update bridge is unavailable.",
    );
    await expect(installDesktopAppUpdate(installInput)).rejects.toThrow(
      "Desktop app update bridge is unavailable.",
    );
  });

  test("returns true only when install metadata is complete", () => {
    expect(canInstallDesktopAppUpdate(installableResult)).toBe(true);
    expect(canInstallDesktopAppUpdate(null)).toBe(false);
    expect(canInstallDesktopAppUpdate({ ...installableResult, hasUpdate: false })).toBe(false);
    expect(canInstallDesktopAppUpdate({ ...installableResult, installSupported: false })).toBe(false);
    expect(canInstallDesktopAppUpdate({ ...installableResult, releaseId: undefined })).toBe(false);
    expect(canInstallDesktopAppUpdate({ ...installableResult, releaseVersion: undefined })).toBe(false);
    expect(canInstallDesktopAppUpdate({ ...installableResult, releaseVersionCode: undefined })).toBe(false);
    expect(canInstallDesktopAppUpdate({ ...installableResult, bundleAsset: undefined })).toBe(false);
  });

  test("returns false when bundle install metadata is incomplete at runtime", () => {
    expect(
      canInstallDesktopAppUpdate({
        ...installableResult,
        bundleAsset: {
          ...installableResult.bundleAsset!,
          assetId: undefined as unknown as number,
        },
      }),
    ).toBe(false);
    expect(
      canInstallDesktopAppUpdate({
        ...installableResult,
        bundleAsset: {
          ...installableResult.bundleAsset!,
          fileSize: Number.NaN,
        },
      }),
    ).toBe(false);
  });

  test("prefers the resolved download asset only when it includes a download url", () => {
    expect(resolveDesktopAppUpdateDownloadAsset(installableResult)?.downloadUrl).toBe(
      "https://example.test/bundle.zip",
    );
    expect(resolveDesktopAppUpdateDownloadAsset(downloadableResult)?.fileName).toBe(
      "stable-macos-arm64-MaomiAgent.dmg",
    );
    expect(resolveDesktopAppUpdateDownloadAsset({
      ...downloadableResult,
      downloadAsset: {
        ...downloadableResult.downloadAsset!,
        downloadUrl: "",
      },
    })).toBeUndefined();
  });

  test("forwards check results through the desktop update bridge", async () => {
    let calls = 0;

    installTestWindow({
      maomiDesktopAppUpdate: {
        checkDesktopAppUpdate: async () => {
          calls += 1;
          return installableResult;
        },
        installDesktopAppUpdate: async () => installResult,
      },
    });

    await expect(checkDesktopAppUpdate()).resolves.toEqual(installableResult);
    expect(calls).toBe(1);
  });

  test("forwards install input through the desktop update bridge", async () => {
    const calls: DesktopAppUpdateInstallInput[] = [];

    installTestWindow({
      maomiDesktopAppUpdate: {
        checkDesktopAppUpdate: async () => installableResult,
        installDesktopAppUpdate: async (input) => {
          calls.push(input);
          return installResult;
        },
      },
    });

    await expect(installDesktopAppUpdate(installInput)).resolves.toEqual(installResult);
    expect(calls).toEqual([installInput]);
  });
});
