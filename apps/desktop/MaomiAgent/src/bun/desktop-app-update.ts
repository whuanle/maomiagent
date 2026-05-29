import { createHash, type Hash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildDesktopLatestReleaseUrl,
  buildDesktopReleasesUrl,
  DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
  isDesktopAppUpdateConfigured,
  loadDesktopAppUpdateConfig,
  normalizeDesktopAppUpdateChannel,
} from "./desktop-app-update/config";
import {
  parseDesktopAppPublicLatestRelease,
  selectDesktopAppPublicReleaseAssets,
  type DesktopAppPublicLatestRelease,
} from "./desktop-app-update/public-contract";
import { resolveDesktopAppUpdatePlatformExecutor } from "./desktop-app-update/platform-executor";
import type {
  DesktopAppUpdateAsset,
  DesktopAppUpdateCheckResult,
  DesktopAppUpdateInstallInput,
  DesktopAppUpdateInstallResult,
} from "../shared/desktop-updater";
import { deriveWoaiVersionCode } from "../shared/woai-version";

type LocalVersionInfo = {
  version: string;
  versionCode: number;
  channel: string;
  resourcesRoot?: string;
  bundleRoot?: string;
};

type EmbeddedUpdateInfo = {
  version?: string;
  hash?: string;
};

const DEFAULT_VERSION = "0.1.0";
const GITHUB_RELEASE_HEADERS = {
  Accept: "application/vnd.github+json",
} as const;

export async function checkDesktopAppUpdate(): Promise<DesktopAppUpdateCheckResult> {
  const localInfo = await resolveLocalVersionInfo();
  const updateConfig = await loadDesktopAppUpdateConfig(localInfo.resourcesRoot);
  const currentChannel = normalizeDesktopAppUpdateChannel(
    updateConfig.channel || localInfo.channel,
  );
  const configured = isDesktopAppUpdateConfigured(updateConfig);
  const baseResult = createBaseCheckResult(localInfo, currentChannel, configured);

  if (!localInfo.bundleRoot || !localInfo.resourcesRoot) {
    return {
      ...baseResult,
      message: "The current runtime is not a packaged desktop bundle.",
    };
  }

  if (!configured) {
    return {
      ...baseResult,
      configured: false,
      message: "Desktop update source is not configured.",
    };
  }

  let release: DesktopAppPublicLatestRelease | undefined;
  try {
    release = await fetchLatestDesktopRelease(updateConfig.channel, updateConfig);
  } catch (error) {
    return {
      ...baseResult,
      configured: true,
      message: normalizeUpdateCheckError(error),
    };
  }

  if (!release) {
    return {
      ...baseResult,
      configured: true,
      message: "No published desktop version is available yet.",
    };
  }

  const remoteVersion = release.version;
  const remoteVersionCode = release.versionCode ?? resolveVersionCode(remoteVersion || "");
  if (!release.versionId || !remoteVersion || remoteVersionCode <= 0) {
    return {
      ...baseResult,
      configured: true,
      message: "The latest GitHub Release tag is not a supported desktop version.",
    };
  }

  if (remoteVersionCode <= localInfo.versionCode) {
    return {
      ...baseResult,
      configured: true,
      message: "You are already on the latest version.",
    };
  }

  const {
    bundleAsset,
    updateInfoAsset,
    installerAsset,
  } = selectDesktopAppPublicReleaseAssets(release.assets, {
    os: updateConfig.os,
    arch: updateConfig.arch,
  });
  const downloadAsset = resolveDownloadAsset(installerAsset, bundleAsset);
  const platformExecutor = resolveDesktopAppUpdatePlatformExecutor();
  const installSupported =
    platformExecutor.supported &&
    updateConfig.os === "win" &&
    Boolean(bundleAsset?.downloadUrl);

  if (!downloadAsset) {
    return {
      ...baseResult,
      configured: true,
      message: "The latest release does not contain a downloadable package for this platform.",
    };
  }

  return {
    ...baseResult,
    configured: true,
    installSupported,
    hasUpdate: true,
    message: installSupported
      ? "A newer desktop version is available."
      : "A newer desktop version is available for download.",
    releaseId: release.versionId,
    releaseVersion: remoteVersion,
    releaseVersionCode: remoteVersionCode,
    title: release.title,
    releaseNotes: release.releaseNotes,
    isForceUpdate: release.isForceUpdate,
    isPrerelease: release.isPrerelease,
    bundleAsset,
    installerAsset,
    updateInfoAsset,
    downloadAsset,
  };
}

export async function installDesktopAppUpdate(
  input: DesktopAppUpdateInstallInput,
): Promise<DesktopAppUpdateInstallResult> {
  const platformExecutor = resolveDesktopAppUpdatePlatformExecutor();
  if (!platformExecutor.supported) {
    throw new Error(platformExecutor.message);
  }

  const localInfo = await resolveLocalVersionInfo();
  if (!localInfo.bundleRoot || !localInfo.resourcesRoot) {
    throw new Error("The current runtime is not a packaged desktop bundle.");
  }

  const bundleDownloadUrl = normalizeText(input.bundleDownloadUrl);
  if (!bundleDownloadUrl) {
    throw new Error("Update bundle download URL is required.");
  }

  const stagingRoot = await createUpdateStagingRoot();
  const archivePath = path.join(
    stagingRoot,
    resolveDownloadFileName(bundleDownloadUrl, `${input.targetVersion}.tar.zst`),
  );
  const expectedBundleHash = input.updateInfoDownloadUrl
    ? await fetchExpectedBundleHash(input.updateInfoDownloadUrl)
    : "";

  try {
    await downloadToFile(bundleDownloadUrl, archivePath);

    const archiveStat = await stat(archivePath);
    if (input.bundleFileSize > 0 && archiveStat.size !== input.bundleFileSize) {
      throw new Error(
        `Downloaded bundle size mismatch. Expected ${input.bundleFileSize}, received ${archiveStat.size}.`,
      );
    }

    if (expectedBundleHash) {
      const actualHash = await computeFileDigest(archivePath, "sha256");
      if (actualHash.toLowerCase() !== expectedBundleHash.toLowerCase()) {
        throw new Error("Downloaded bundle checksum mismatch.");
      }
    }

    const extractRoot = path.join(stagingRoot, "bundle-extract");
    await mkdir(extractRoot, { recursive: true });

    const zstdPath = path.join(localInfo.bundleRoot, "bin", "zig-zstd.exe");
    if (!existsSync(zstdPath)) {
      throw new Error(`Required decompressor is missing: ${zstdPath}`);
    }

    await extractCompressedBundle(archivePath, extractRoot, zstdPath);

    const stagedBundleRoot = await resolveSingleExtractedDirectory(extractRoot);
    const launcherPath = path.join(localInfo.bundleRoot, "bin", "launcher.exe");
    if (!existsSync(launcherPath)) {
      throw new Error(`Current launcher is missing: ${launcherPath}`);
    }

    const applyScriptPath = path.join(stagingRoot, "apply-update.ps1");
    await writeFile(applyScriptPath, buildWindowsApplyUpdateScript(), "utf8");
    launchDetachedApplyScript({
      scriptPath: applyScriptPath,
      currentPid: process.pid,
      sourceBundlePath: stagedBundleRoot,
      targetBundlePath: localInfo.bundleRoot,
      launcherPath,
    });

    return {
      scheduled: true,
      closeRequested: true,
      targetVersion: input.targetVersion,
      targetVersionCode: input.targetVersionCode,
      message: "The update package is ready. The app will close and restart to finish installation.",
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function fetchLatestDesktopRelease(
  channel: string,
  config: Parameters<typeof buildDesktopLatestReleaseUrl>[0],
): Promise<DesktopAppPublicLatestRelease | undefined> {
  if (normalizeDesktopAppUpdateChannel(channel) === "preview") {
    const url = new URL(buildDesktopReleasesUrl(config));
    url.searchParams.set("per_page", "20");

    const response = await fetch(url.toString(), {
      headers: GITHUB_RELEASE_HEADERS,
    });
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`GitHub Release update check failed (${response.status}).`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return undefined;
    }

    return payload
      .map(parseDesktopAppPublicLatestRelease)
      .find((release) => release.versionId && !release.isDraft && release.isPrerelease);
  }

  const response = await fetch(buildDesktopLatestReleaseUrl(config), {
    headers: GITHUB_RELEASE_HEADERS,
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`GitHub Release update check failed (${response.status}).`);
  }

  return parseDesktopAppPublicLatestRelease(await response.json());
}

async function resolveLocalVersionInfo(): Promise<LocalVersionInfo> {
  const resourcesRoot = resolveResourcesRoot();
  const versionInfoPath = resourcesRoot ? path.join(resourcesRoot, "version.json") : "";
  const fallbackVersion = normalizeText(process.env.MAOMI_DESKTOP_VERSION) || DEFAULT_VERSION;

  if (!resourcesRoot || !versionInfoPath || !existsSync(versionInfoPath)) {
    return {
      version: fallbackVersion,
      versionCode: resolveVersionCode(fallbackVersion),
      channel: DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
    };
  }

  const payload = JSON.parse(await readFile(versionInfoPath, "utf8")) as Record<string, unknown>;
  const version = readText(payload, ["version"]) || fallbackVersion;
  const channel = normalizeDesktopAppUpdateChannel(
    readText(payload, ["channel"]) || DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
  );

  return {
    version,
    versionCode: resolveVersionCode(version),
    channel,
    resourcesRoot,
    bundleRoot: path.resolve(resourcesRoot, ".."),
  };
}

function resolveResourcesRoot(): string | undefined {
  const configuredResourcesRoot = normalizeText(process.env.MAOMI_DESKTOP_RESOURCES_ROOT);
  if (configuredResourcesRoot && existsSync(path.join(configuredResourcesRoot, "version.json"))) {
    return configuredResourcesRoot;
  }

  const candidates = [
    path.resolve(import.meta.dir, "..", ".."),
    path.resolve(process.execPath, "..", "..", "Resources"),
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "version.json")));
}

function createBaseCheckResult(
  localInfo: LocalVersionInfo,
  currentChannel: string,
  configured: boolean,
): DesktopAppUpdateCheckResult {
  return {
    configured,
    supported: true,
    installSupported: false,
    hasUpdate: false,
    currentVersion: localInfo.version,
    currentVersionCode: localInfo.versionCode,
    currentChannel,
  };
}

function resolveDownloadAsset(
  installerAsset?: DesktopAppUpdateAsset,
  bundleAsset?: DesktopAppUpdateAsset,
): DesktopAppUpdateAsset | undefined {
  if (installerAsset?.downloadUrl) {
    return installerAsset;
  }
  if (bundleAsset?.downloadUrl) {
    return bundleAsset;
  }
  return installerAsset ?? bundleAsset;
}

function normalizeUpdateCheckError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "GitHub Release update check failed.";
}

async function fetchExpectedBundleHash(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download update metadata (${response.status}).`);
  }

  const payload = JSON.parse(await response.text()) as EmbeddedUpdateInfo;
  return normalizeText(payload.hash);
}

async function downloadToFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download update bundle (${response.status}).`);
  }

  await Bun.write(filePath, await response.arrayBuffer());
}

async function extractCompressedBundle(
  archivePath: string,
  extractRoot: string,
  zstdPath: string,
): Promise<void> {
  const tarPath = path.join(path.dirname(archivePath), "bundle.tar");

  try {
    runCommandSync([zstdPath, "decompress", "-i", archivePath, "-o", tarPath, "--threads", "max"]);
    runCommandSync(["tar", "-xf", tarPath, "-C", extractRoot]);
  } finally {
    await unlink(tarPath).catch(() => undefined);
  }
}

function runCommandSync(command: string[]): void {
  const result = Bun.spawnSync({
    cmd: command,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode === 0) {
    return;
  }

  const stderr = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "";
  throw new Error(stderr || `Command failed: ${command.join(" ")}`);
}

async function resolveSingleExtractedDirectory(extractRoot: string): Promise<string> {
  const entries = await readdir(extractRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1) {
    throw new Error("The downloaded update bundle did not contain exactly one root directory.");
  }

  return path.join(extractRoot, directories[0]!.name);
}

async function createUpdateStagingRoot(): Promise<string> {
  const root = path.join(os.tmpdir(), "maomiagent-update", `${Date.now()}`);
  await mkdir(root, { recursive: true });
  return root;
}

function launchDetachedApplyScript(input: {
  scriptPath: string;
  currentPid: number;
  sourceBundlePath: string;
  targetBundlePath: string;
  launcherPath: string;
}): void {
  const command = [
    "$arguments = @(",
    "'-NoProfile'",
    "'-ExecutionPolicy'",
    "'Bypass'",
    "'-File'",
    `'${escapePowerShellSingleQuoted(input.scriptPath)}'`,
    "'-CurrentPid'",
    `'${String(input.currentPid)}'`,
    "'-SourceBundlePath'",
    `'${escapePowerShellSingleQuoted(input.sourceBundlePath)}'`,
    "'-TargetBundlePath'",
    `'${escapePowerShellSingleQuoted(input.targetBundlePath)}'`,
    "'-LauncherPath'",
    `'${escapePowerShellSingleQuoted(input.launcherPath)}'`,
    ");",
    "Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList $arguments",
  ].join(" ");

  Bun.spawn({
    cmd: ["powershell.exe", "-NoProfile", "-Command", command],
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
}

function buildWindowsApplyUpdateScript(): string {
  return [
    "param(",
    "  [int]$CurrentPid,",
    "  [string]$SourceBundlePath,",
    "  [string]$TargetBundlePath,",
    "  [string]$LauncherPath",
    ")",
    "$ErrorActionPreference = 'Stop'",
    "for ($i = 0; $i -lt 300; $i++) {",
    "  if (-not (Get-Process -Id $CurrentPid -ErrorAction SilentlyContinue)) {",
    "    break",
    "  }",
    "  Start-Sleep -Milliseconds 500",
    "}",
    "$targetParent = Split-Path -Parent $TargetBundlePath",
    "if (-not (Test-Path $targetParent)) {",
    "  New-Item -ItemType Directory -Path $targetParent -Force | Out-Null",
    "}",
    "if (Test-Path $TargetBundlePath) {",
    "  Remove-Item -Path $TargetBundlePath -Recurse -Force",
    "}",
    "Move-Item -Path $SourceBundlePath -Destination $TargetBundlePath -Force",
    "$launcherDirectory = Split-Path -Parent $LauncherPath",
    "Start-Process -FilePath $LauncherPath -WorkingDirectory $launcherDirectory",
  ].join("\n");
}

async function computeFileDigest(filePath: string, algorithm: "sha256"): Promise<string> {
  const hash = createHash(algorithm);
  await updateHashFromFile(hash, filePath);
  return hash.digest("hex");
}

async function updateHashFromFile(hash: Hash, filePath: string): Promise<void> {
  const reader = Bun.file(filePath).stream().getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (value) {
        hash.update(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function resolveVersionCode(version: string): number {
  return deriveWoaiVersionCode(version) ?? 0;
}

function resolveDownloadFileName(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const decoded = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    return sanitizeFileName(decoded || fallback);
  } catch {
    return sanitizeFileName(fallback);
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/gu, "-");
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}

function readText(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}
