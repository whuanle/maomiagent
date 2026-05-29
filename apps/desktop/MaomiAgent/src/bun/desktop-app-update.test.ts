import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  checkDesktopAppUpdate,
  installDesktopAppUpdate,
} from "./desktop-app-update";

const originalFetch = globalThis.fetch;
const originalResourcesRoot = process.env.MAOMI_DESKTOP_RESOURCES_ROOT;
const tempRoots = new Set<string>();

afterEach(async () => {
  globalThis.fetch = originalFetch;

  if (typeof originalResourcesRoot === "string") {
    process.env.MAOMI_DESKTOP_RESOURCES_ROOT = originalResourcesRoot;
  } else {
    delete process.env.MAOMI_DESKTOP_RESOURCES_ROOT;
  }

  await Promise.all(
    [...tempRoots].map(async (tempRoot) => {
      tempRoots.delete(tempRoot);
      await rm(tempRoot, { recursive: true, force: true });
    }),
  );
});

async function createPackagedRuntimeFixture(input: {
  channel: string;
  os: string;
  arch: string;
}): Promise<{
  tempRoot: string;
  bundleRoot: string;
  resourcesRoot: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomi-desktop-updater-"));
  tempRoots.add(tempRoot);

  const bundleRoot = path.join(tempRoot, "bundle");
  const resourcesRoot = path.join(bundleRoot, "Resources");
  const appRoot = path.join(resourcesRoot, "app");
  await mkdir(appRoot, { recursive: true });
  await writeFile(
    path.join(resourcesRoot, "version.json"),
    JSON.stringify({
      version: "1.0.0.0",
      hash: "",
      channel: "stable",
      baseUrl: "",
      name: "MaomiAgent",
      identifier: "com.maomiagent.desktop",
    }),
    "utf8",
  );
  await writeFile(
    path.join(appRoot, "update-config.json"),
    JSON.stringify({
      provider: "github",
      owner: "octo-org",
      repo: "MaomiAgent",
      channel: input.channel,
      os: input.os,
      arch: input.arch,
      includePrerelease: input.channel === "preview",
    }),
    "utf8",
  );

  process.env.MAOMI_DESKTOP_RESOURCES_ROOT = resourcesRoot;

  return {
    tempRoot,
    bundleRoot,
    resourcesRoot,
  };
}

describe("desktop app updater runtime", () => {
  test("checks the latest GitHub release and returns a download-only update for macOS assets", async () => {
    await createPackagedRuntimeFixture({
      channel: "stable",
      os: "macos",
      arch: "arm64",
    });

    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({
        id: 7,
        tag_name: "v1.2.4",
        name: "MaomiAgent 1.2.4",
        body: "Release notes",
        assets: [
          {
            id: 90,
            name: "stable-macos-arm64-MaomiAgent.app.tar.zst",
            size: 10,
            browser_download_url: "https://example.test/macos.tar.zst",
          },
          {
            id: 91,
            name: "stable-macos-arm64-MaomiAgent.dmg",
            size: 11,
            browser_download_url: "https://example.test/maomi.dmg",
          },
        ],
      }), {
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const result = await checkDesktopAppUpdate();

    expect(requests).toEqual([
      "https://api.github.com/repos/octo-org/MaomiAgent/releases/latest",
    ]);
    expect(result).toMatchObject({
      configured: true,
      supported: true,
      installSupported: false,
      hasUpdate: true,
      currentChannel: "stable",
      releaseId: 7,
      releaseVersion: "1.2.4.0",
      releaseVersionCode: 10204000,
      message: "A newer desktop version is available for download.",
      installerAsset: {
        assetId: 91,
        fileName: "stable-macos-arm64-MaomiAgent.dmg",
      },
      downloadAsset: {
        assetId: 91,
        downloadUrl: "https://example.test/maomi.dmg",
      },
    });
  });

  test("uses the prerelease listing path and reports missing platform assets honestly", async () => {
    await createPackagedRuntimeFixture({
      channel: "preview",
      os: "linux",
      arch: "arm64",
    });

    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify([
        {
          id: 8,
          tag_name: "v1.2.5_preview",
          prerelease: true,
          draft: false,
          assets: [
            {
              id: 101,
              name: "stable-win-x64-MaomiAgent.tar.zst",
              size: 10,
              browser_download_url: "https://example.test/win.tar.zst",
            },
          ],
        },
      ]), {
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const result = await checkDesktopAppUpdate();

    expect(requests).toEqual([
      "https://api.github.com/repos/octo-org/MaomiAgent/releases?per_page=20",
    ]);
    expect(result.hasUpdate).toBe(false);
    expect(result.currentChannel).toBe("preview");
    expect(result.message).toBe(
      "The latest release does not contain a downloadable package for this platform.",
    );
  });

  test("downloads bundle metadata and the bundle directly from release asset urls", async () => {
    await createPackagedRuntimeFixture({
      channel: "stable",
      os: "win",
      arch: "x64",
    });

    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);

      if (url === "https://example.test/update.json") {
        return new Response(JSON.stringify({
          version: "1.2.4.0",
          hash: "",
        }), {
          headers: {
            "content-type": "application/json",
          },
        });
      }

      return new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: {
          "content-type": "application/octet-stream",
        },
      });
    }) as typeof fetch;

    await expect(installDesktopAppUpdate({
      releaseId: 7,
      bundleAssetId: 90,
      bundleFileSize: 4,
      bundleDownloadUrl: "https://example.test/bundle.tar.zst",
      targetVersion: "1.2.4.0",
      targetVersionCode: 10204000,
      updateInfoAssetId: 91,
      updateInfoDownloadUrl: "https://example.test/update.json",
    })).rejects.toThrow("Required decompressor is missing:");

    expect(requests).toEqual([
      "https://example.test/update.json",
      "https://example.test/bundle.tar.zst",
    ]);
  });
});
