import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPackagedDesktopAppUpdateConfig,
  normalizeDesktopAppUpdateChannel,
  resolveDesktopAppUpdatePlatform,
} from "../src/bun/desktop-app-update/config";
import { stageElectrobunHostCli } from "./build-electrobun-host-cli";
import {
  exportPortableAssets,
  normalizeMacosReleaseFormat,
  resolveArtifactRootCleanupPaths,
  resolvePortableReleaseAssetName,
} from "./build-portable-release-assets";

const APP_NAME = "MaomiAgent";
const APP_IDENTIFIER = "com.maomiagent.desktop";
const APP_VERSION = resolveDesktopVersion();
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildFolder = process.env.MAOMI_DESKTOP_DEV_BUILD_FOLDER?.trim() || "build";
const artifactFolder = process.env.MAOMI_DESKTOP_ARTIFACT_FOLDER?.trim() || "artifacts";
const buildMode = process.env.MAOMI_DESKTOP_BUILD_MODE?.trim() === "release" ? "release" : "dev";
const ELECTROBUN_PACKAGE_ROOT = resolveElectrobunPackageRoot();
const ELECTROBUN_SHARED_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist");
const ELECTROBUN_WINDOWS_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist-win-x64");
const ELECTROBUN_ZIG_ASAR_X64 = join(
  ELECTROBUN_WINDOWS_DIST,
  "zig-asar",
  "x64",
  "libasar.dll",
);
const ELECTROBUN_ZIG_ASAR_ARM64 = join(
  ELECTROBUN_WINDOWS_DIST,
  "zig-asar",
  "arm64",
  "libasar.dll",
);
const WINDOWS_BUILD_ENVIRONMENT = "dev-win-x64";
const WINDOWS_APP_NAME = `${APP_NAME}-dev`;
const BUNDLED_RENDERER_DIST = join(projectRoot, "dist");
const BUNDLED_APP_DATA_DIR = join(projectRoot, "data");
const GENERATED_FOLDER = join(projectRoot, ".generated");
const GENERATED_UPDATE_CONFIG_PATH = join(GENERATED_FOLDER, "update-config.json");
const ELECTROBUN_STABLE_ENV = "stable";
const ELECTROBUN_GITHUB_RELEASES = "https://github.com/blackboardsh/electrobun/releases/download";
const ELECTROBUN_PACKAGE_VERSION = resolveElectrobunPackageVersion();

type DesktopTargetPlatform = ReturnType<typeof resolveDesktopAppUpdatePlatform>;

type BundleLayout = {
  bundleRoot: string;
  bundleContentsDir: string;
  bundleBinDir: string;
  bundleResourcesDir: string;
  bundleAppDir: string;
  bundleBunDir: string;
};

type NativePackagingFailureDecision =
  | {
    shouldContinuePortableExport: true;
    warningMessage: string;
    nativeMacosDmgPath?: string;
  }
  | {
    shouldContinuePortableExport: false;
    failureMessage: string;
  };

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  if (buildMode === "release") {
    const releaseChannel = resolveReleaseChannel();
    writeGeneratedUpdateConfig(releaseChannel);
    logReleaseStep(`starting ${releaseChannel} desktop release build for ${APP_VERSION}`);
    await prepareReleaseArtifacts(releaseChannel);
    console.log(`Prepared desktop release artifacts at ${join(projectRoot, artifactFolder)}`);
    return;
  }

  if (process.platform !== "win32") {
    writeGeneratedUpdateConfig("dev");
    await runCommand(["bun", "x", "electrobun", "build"], undefined, projectRoot);
    return;
  }

  const bundleRoot = await prepareWindowsBundle();
  console.log(`Prepared Windows desktop bundle at ${bundleRoot}`);
}

async function prepareReleaseArtifacts(channel: string): Promise<void> {
  const targetPlatform = resolveDesktopAppUpdatePlatform();
  const artifactRoot = join(projectRoot, artifactFolder);
  const macosReleaseFormat = normalizeMacosReleaseFormat(
    process.env.MAOMI_DESKTOP_MACOS_RELEASE_FORMAT,
  );
  const expectedNativeMacosDmgPath = resolveNativeMacosDmgArtifactPath(
    channel,
    targetPlatform,
    macosReleaseFormat,
  );
  let nativeMacosDmgPath: string | undefined;
  const nativeArtifactRootEntriesBeforePackaging = snapshotArtifactRootEntryNames(artifactRoot);
  let nativeArtifactCleanupPaths: string[] = [];

  try {
    await runNativeReleasePackaging();
    nativeMacosDmgPath = expectedNativeMacosDmgPath;
    nativeArtifactCleanupPaths = resolveArtifactRootCleanupPaths({
      artifactRoot,
      beforeEntryNames: nativeArtifactRootEntriesBeforePackaging,
      afterEntryNames: snapshotArtifactRootEntryNames(artifactRoot),
    });
  } catch (error) {
    const normalizedError = normalizeError(error);
    nativeArtifactCleanupPaths = resolveArtifactRootCleanupPaths({
      artifactRoot,
      beforeEntryNames: nativeArtifactRootEntriesBeforePackaging,
      afterEntryNames: snapshotArtifactRootEntryNames(artifactRoot),
    });

    const failureDecision = resolvePortableExportAfterNativePackagingFailure({
      targetPlatform,
      macosReleaseFormat,
      nativeMacosDmgPath: expectedNativeMacosDmgPath,
      hasNativeMacosDmgArtifact: expectedNativeMacosDmgPath
        ? existsSync(expectedNativeMacosDmgPath)
        : false,
      errorMessage: normalizedError,
    });

    if (!failureDecision.shouldContinuePortableExport) {
      throw new Error(failureDecision.failureMessage);
    }

    nativeMacosDmgPath = failureDecision.nativeMacosDmgPath;
    console.warn(failureDecision.warningMessage);
  }

  await preparePortableReleaseArtifacts(channel, targetPlatform, {
    macosReleaseFormat,
    nativeMacosDmgPath,
    nativeArtifactCleanupPaths,
  });
}

async function runNativeReleasePackaging(): Promise<void> {
  const hostCliEntrypoint = stageElectrobunHostCli({
    generatedFolder: GENERATED_FOLDER,
    electrobunPackageRoot: ELECTROBUN_PACKAGE_ROOT,
  });

  await runCommand(["bun", hostCliEntrypoint, "build", `--env=${ELECTROBUN_STABLE_ENV}`], undefined, projectRoot);
}

async function prepareWindowsBundle(): Promise<string> {
  const bundleRoot = join(projectRoot, buildFolder, WINDOWS_BUILD_ENVIRONMENT, WINDOWS_APP_NAME);
  await prepareBundleAt({
    bundleRoot,
    appVersion: APP_VERSION,
    channel: "dev",
    bundleRuntimeName: WINDOWS_APP_NAME,
    targetPlatform: {
      os: "win",
      arch: "x64",
    },
  });

  return bundleRoot;
}

async function preparePortableReleaseArtifacts(
  channel: string,
  targetPlatform: DesktopTargetPlatform,
  input: {
    macosReleaseFormat: ReturnType<typeof normalizeMacosReleaseFormat>;
    nativeMacosDmgPath?: string;
    nativeArtifactCleanupPaths: string[];
  },
): Promise<void> {
  logReleaseStep(`preparing portable artifact for ${formatTargetPlatform(targetPlatform)}`);
  const releasePlatformPrefix = formatPlatformPrefix(channel, targetPlatform.os, targetPlatform.arch);
  const releaseBuildRoot = join(projectRoot, buildFolder, releasePlatformPrefix);
  const bundleRoot = join(releaseBuildRoot, resolveReleaseBundleFolderName(targetPlatform.os));
  const artifactRoot = join(projectRoot, artifactFolder);

  rmSync(releaseBuildRoot, { recursive: true, force: true });
  mkdirSync(releaseBuildRoot, { recursive: true });

  await prepareBundleAt({
    bundleRoot,
    appVersion: APP_VERSION,
    channel,
    bundleRuntimeName: APP_NAME,
    targetPlatform,
  });

  const portableAssets = await exportPortableAssets({
    artifactRoot,
    bundleRoot,
    channel,
    targetPlatform,
    macosReleaseFormat: input.macosReleaseFormat,
    nativeMacosDmgPath: input.nativeMacosDmgPath,
  });
  removeArtifactRootEntries(input.nativeArtifactCleanupPaths);

  console.log(
    `[release] exported ${targetPlatform.os}-${targetPlatform.arch} portable release asset ${portableAssets.releaseAssetPath}`,
  );
  console.log(
    `[release] exported ${targetPlatform.os}-${targetPlatform.arch} npm asset ${portableAssets.npmArchivePath}`,
  );
}

async function prepareBundleAt(input: {
  bundleRoot: string;
  appVersion: string;
  channel: string;
  bundleRuntimeName: string;
  targetPlatform: DesktopTargetPlatform;
}): Promise<void> {
  const layout = resolveBundleLayout(input.bundleRoot, input.targetPlatform.os);

  logReleaseStep(`preparing bundle layout at ${layout.bundleRoot}`);
  rmSync(input.bundleRoot, { force: true, recursive: true });
  mkdirSync(layout.bundleBinDir, { recursive: true });
  mkdirSync(layout.bundleBunDir, { recursive: true });

  await ensureElectrobunRuntimeAssets(input.targetPlatform);
  logReleaseStep(`copying platform runtime files for ${formatTargetPlatform(input.targetPlatform)}`);
  copyPlatformRuntimeFiles(layout, input.targetPlatform);
  logReleaseStep("building Bun entrypoint");
  await buildBundleEntrypoint(layout);
  logReleaseStep("copying bundled renderer assets");
  copyBundledRenderer(layout.bundleAppDir);
  logReleaseStep("copying bundled data assets");
  copyBundledDesktopData(layout.bundleContentsDir);

  if (input.targetPlatform.os === "linux") {
    logReleaseStep("copying Linux bundle icons");
    copyLinuxBundleIcons(layout);
  }
  if (input.targetPlatform.os === "macos") {
    logReleaseStep("writing macOS Info.plist");
    writeMacInfoPlist(layout.bundleContentsDir, input.bundleRuntimeName, input.appVersion);
  }

  logReleaseStep("writing bundle metadata");
  writeBundleMetadata({
    layout,
    appVersion: input.appVersion,
    channel: input.channel,
    bundleRuntimeName: input.bundleRuntimeName,
    targetPlatform: input.targetPlatform,
  });
}

function resolveBundleLayout(bundleRoot: string, os: string): BundleLayout {
  if (os === "macos") {
    const bundleContentsDir = join(bundleRoot, "Contents");
    const bundleBinDir = join(bundleContentsDir, "MacOS");
    const bundleResourcesDir = join(bundleContentsDir, "Resources");
    const bundleAppDir = join(bundleResourcesDir, "app");
    const bundleBunDir = join(bundleAppDir, "bun");

    return {
      bundleRoot,
      bundleContentsDir,
      bundleBinDir,
      bundleResourcesDir,
      bundleAppDir,
      bundleBunDir,
    };
  }

  if (os === "win" || os === "linux") {
    const bundleContentsDir = bundleRoot;
    const bundleBinDir = join(bundleRoot, "bin");
    const bundleResourcesDir = join(bundleRoot, "Resources");
    const bundleAppDir = join(bundleResourcesDir, "app");
    const bundleBunDir = join(bundleAppDir, "bun");

    return {
      bundleRoot,
      bundleContentsDir,
      bundleBinDir,
      bundleResourcesDir,
      bundleAppDir,
      bundleBunDir,
    };
  }

  throw new Error(`Unsupported desktop bundle target: ${os}`);
}

function copyPlatformRuntimeFiles(
  layout: BundleLayout,
  targetPlatform: DesktopTargetPlatform,
): void {
  const platformDist = resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch);
  const executableNames = ["launcher", "bun", "bspatch", "zig-zstd"] as const;

  for (const executableName of executableNames) {
    const fileName = resolveExecutableName(executableName, targetPlatform.os);
    const destinationPath = join(layout.bundleBinDir, fileName);
    copyRequiredFile(join(platformDist, fileName), destinationPath);
    ensureExecutableFile(destinationPath, targetPlatform.os);
  }

  const libraryExtension = resolveLibraryExtension(targetPlatform.os);
  copyRequiredFile(
    join(platformDist, `libNativeWrapper${libraryExtension}`),
    join(layout.bundleBinDir, `libNativeWrapper${libraryExtension}`),
  );

  if (targetPlatform.os === "win") {
    copyRequiredFile(join(platformDist, "WebView2Loader.dll"), join(layout.bundleBinDir, "WebView2Loader.dll"));
    copyRequiredFile(ELECTROBUN_ZIG_ASAR_X64, join(layout.bundleBinDir, "libasar.dll"));
    copyRequiredFile(ELECTROBUN_ZIG_ASAR_ARM64, join(layout.bundleBinDir, "libasar-arm64.dll"));
  } else {
    copyRequiredFile(
      join(platformDist, `libasar${libraryExtension}`),
      join(layout.bundleBinDir, `libasar${libraryExtension}`),
    );
  }

  copyRequiredFile(resolveElectrobunMainJsPath(targetPlatform), join(layout.bundleResourcesDir, "main.js"));
}

async function ensureElectrobunRuntimeAssets(
  targetPlatform: DesktopTargetPlatform,
): Promise<void> {
  const requiredAssets = resolveElectrobunRuntimeAssets(targetPlatform);
  const missingAssets = requiredAssets.filter((filePath) => !existsSync(filePath));

  if (missingAssets.length === 0) {
    return;
  }

  logReleaseStep(
    `Electrobun runtime missing for ${formatTargetPlatform(targetPlatform)}: ${missingAssets
      .map(formatElectrobunRelativePath)
      .join(", ")}`,
  );
  await downloadElectrobunRuntimeAssets(targetPlatform);

  const unresolvedAssets = requiredAssets.filter((filePath) => !existsSync(filePath));
  if (unresolvedAssets.length > 0) {
    throw new Error(
      `Electrobun runtime download for ${formatTargetPlatform(targetPlatform)} is incomplete: ${unresolvedAssets
        .map(formatElectrobunRelativePath)
        .join(", ")}`,
    );
  }

  for (const executablePath of resolveElectrobunExecutableAssets(targetPlatform)) {
    ensureExecutableFile(executablePath, targetPlatform.os);
  }
}

async function downloadElectrobunRuntimeAssets(
  targetPlatform: DesktopTargetPlatform,
): Promise<void> {
  const platformDist = resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch);
  const archivePath = join(
    ELECTROBUN_PACKAGE_ROOT,
    `electrobun-core-${targetPlatform.os}-${targetPlatform.arch}.tar.gz`,
  );
  const archiveUrl = resolveElectrobunCoreRuntimeUrl(targetPlatform);

  logReleaseStep(`downloading Electrobun core runtime from ${archiveUrl}`);
  rmSync(archivePath, { force: true });
  await downloadFile({
    url: archiveUrl,
    destinationPath: archivePath,
  });

  try {
    logReleaseStep(`extracting Electrobun core runtime into ${platformDist}`);
    rmSync(platformDist, { recursive: true, force: true });
    mkdirSync(platformDist, { recursive: true });
    await extractTarGzArchive({
      archivePath,
      destinationPath: platformDist,
    });
  } finally {
    rmSync(archivePath, { force: true });
  }

  logReleaseStep(
    `Electrobun runtime extracted for ${formatTargetPlatform(targetPlatform)}: ${readdirSync(platformDist).join(", ")}`,
  );
}

async function buildBundleEntrypoint(
  layout: BundleLayout,
): Promise<void> {
  await runCommand(
    [
      "bun",
      "build",
      "./src/bun/index.ts",
      "--target",
      "bun",
      "--outdir",
      layout.bundleBunDir,
      "--external",
      "playwright",
    ],
    undefined,
    projectRoot,
  );
}

function copyLinuxBundleIcons(layout: BundleLayout): void {
  const iconSourcePath = join(
    projectRoot,
    "src",
    "mainview",
    "public",
    "branding",
    "generated",
    "icon-512.png",
  );

  if (!existsSync(iconSourcePath)) {
    return;
  }

  copyRequiredFile(iconSourcePath, join(layout.bundleResourcesDir, "appIcon.png"));
  copyRequiredFile(iconSourcePath, join(layout.bundleAppDir, "icon.png"));
}

function writeMacInfoPlist(
  bundleContentsDir: string,
  bundleRuntimeName: string,
  appVersion: string,
): void {
  writeFileSync(
    join(bundleContentsDir, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>${APP_IDENTIFIER}</string>
    <key>CFBundleName</key>
    <string>${bundleRuntimeName}</string>
    <key>CFBundleVersion</key>
    <string>${appVersion}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>
`,
  );
}

function writeBundleMetadata(input: {
  layout: BundleLayout;
  appVersion: string;
  channel: string;
  bundleRuntimeName: string;
  targetPlatform: DesktopTargetPlatform;
}): void {
  const bunBinaryPath = join(
    input.layout.bundleBinDir,
    resolveExecutableName("bun", input.targetPlatform.os),
  );

  writeFileSync(
    join(input.layout.bundleResourcesDir, "version.json"),
    `${JSON.stringify({
      version: input.appVersion,
      hash: "",
      channel: input.channel,
      baseUrl: "",
      name: input.bundleRuntimeName,
      identifier: APP_IDENTIFIER,
    })}\n`,
  );
  writeFileSync(
    join(input.layout.bundleResourcesDir, "build.json"),
    `${JSON.stringify({
      defaultRenderer: "native",
      availableRenderers: ["native"],
      runtime: {},
      bunVersion: resolveEmbeddedBunVersion(bunBinaryPath),
    })}\n`,
  );
  writeFileSync(
    join(input.layout.bundleAppDir, "update-config.json"),
    `${JSON.stringify(
      createPackagedDesktopAppUpdateConfig({
        channel: input.channel,
        os: input.targetPlatform.os,
        arch: input.targetPlatform.arch,
      }),
      null,
      2,
    )}\n`,
  );
}

async function extractTarGzArchive(input: {
  archivePath: string;
  destinationPath: string;
}): Promise<void> {
  await runCommand(
    ["tar", "-xzf", basename(input.archivePath), "-C", basename(input.destinationPath)],
    undefined,
    ELECTROBUN_PACKAGE_ROOT,
  );
}

async function downloadFile(input: {
  url: string;
  destinationPath: string;
}): Promise<void> {
  mkdirSync(dirname(input.destinationPath), { recursive: true });

  const curlExecutable = process.platform === "win32" ? "curl.exe" : "curl";
  try {
    await runCommand(
      [
        curlExecutable,
        "-L",
        "--fail",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--retry-all-errors",
        "-o",
        basename(input.destinationPath),
        input.url,
      ],
      undefined,
      dirname(input.destinationPath),
    );
    return;
  } catch (error) {
    logReleaseStep(`curl download failed, retrying with fetch: ${normalizeError(error)}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}: ${input.url}`);
    }

    writeFileSync(input.destinationPath, Buffer.from(await response.arrayBuffer()));
  } finally {
    clearTimeout(timeout);
  }
}

function writeGeneratedUpdateConfig(channel: string): void {
  const targetPlatform = resolveDesktopAppUpdatePlatform();
  mkdirSync(GENERATED_FOLDER, { recursive: true });
  writeFileSync(
    GENERATED_UPDATE_CONFIG_PATH,
    `${JSON.stringify(
      createPackagedDesktopAppUpdateConfig({
        channel,
        os: targetPlatform.os,
        arch: targetPlatform.arch,
      }),
      null,
      2,
    )}\n`,
  );
}

function resolveReleaseChannel(): string {
  const normalized = normalizeDesktopAppUpdateChannel(process.env.MAOMI_RELEASE_CHANNEL);
  return normalized === "preview" ? "preview" : "stable";
}

function resolveReleaseBundleFolderName(os: string): string {
  return os === "macos" ? `${APP_NAME}.app` : APP_NAME;
}

function resolveNativeMacosDmgArtifactPath(
  channel: string,
  targetPlatform: DesktopTargetPlatform,
  macosReleaseFormat: ReturnType<typeof normalizeMacosReleaseFormat>,
): string | undefined {
  if (targetPlatform.os !== "macos" || macosReleaseFormat !== "dmg") {
    return undefined;
  }

  return join(
    projectRoot,
    artifactFolder,
    resolvePortableReleaseAssetName({
      channel,
      os: targetPlatform.os,
      arch: targetPlatform.arch,
      format: "dmg",
    }),
  );
}

export function resolvePortableExportAfterNativePackagingFailure(input: {
  targetPlatform: DesktopTargetPlatform;
  macosReleaseFormat: ReturnType<typeof normalizeMacosReleaseFormat>;
  nativeMacosDmgPath?: string;
  hasNativeMacosDmgArtifact: boolean;
  errorMessage: string;
}): NativePackagingFailureDecision {
  const platformLabel = `${input.targetPlatform.os}-${input.targetPlatform.arch}`;
  const normalizedError = input.errorMessage.trim() || "unknown error";

  if (input.targetPlatform.os === "macos" && input.macosReleaseFormat === "dmg") {
    if (input.hasNativeMacosDmgArtifact && input.nativeMacosDmgPath) {
      return {
        shouldContinuePortableExport: true,
        nativeMacosDmgPath: input.nativeMacosDmgPath,
        warningMessage: `[release] Native ${platformLabel} packaging failed, continuing with portable dmg export using existing artifact ${input.nativeMacosDmgPath}: ${normalizedError}`,
      };
    }

    return {
      shouldContinuePortableExport: false,
      failureMessage: `Native ${platformLabel} desktop release packaging failed and portable dmg export cannot continue because no native dmg artifact is available${input.nativeMacosDmgPath ? ` at ${input.nativeMacosDmgPath}` : ""}. Original error: ${normalizedError}`,
    };
  }

  return {
    shouldContinuePortableExport: true,
    warningMessage: `[release] Native ${platformLabel} packaging failed, continuing with portable release export: ${normalizedError}`,
  };
}

function resolveElectrobunPlatformDist(os: string, arch: string): string {
  return join(ELECTROBUN_PACKAGE_ROOT, `dist-${os}-${arch}`);
}

function resolveElectrobunMainJsPath(targetPlatform: DesktopTargetPlatform): string {
  const platformMainPath = join(
    resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch),
    "main.js",
  );
  if (existsSync(platformMainPath)) {
    return platformMainPath;
  }

  return join(ELECTROBUN_SHARED_DIST, "main.js");
}

function resolveExecutableName(baseName: string, os: string): string {
  return os === "win" ? `${baseName}.exe` : baseName;
}

function resolveLibraryExtension(os: string): string {
  if (os === "win") {
    return ".dll";
  }
  if (os === "macos") {
    return ".dylib";
  }
  if (os === "linux") {
    return ".so";
  }

  throw new Error(`Unsupported desktop library target: ${os}`);
}

function resolveElectrobunRuntimeAssets(
  targetPlatform: DesktopTargetPlatform,
): string[] {
  const platformDist = resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch);
  const runtimeAssets = [
    ...resolveElectrobunExecutableAssets(targetPlatform),
    join(platformDist, `libNativeWrapper${resolveLibraryExtension(targetPlatform.os)}`),
    resolveElectrobunMainJsPath(targetPlatform),
  ];

  if (targetPlatform.os === "win") {
    runtimeAssets.push(join(platformDist, "WebView2Loader.dll"));
    runtimeAssets.push(ELECTROBUN_ZIG_ASAR_X64);
    runtimeAssets.push(ELECTROBUN_ZIG_ASAR_ARM64);
  } else {
    runtimeAssets.push(join(platformDist, `libasar${resolveLibraryExtension(targetPlatform.os)}`));
  }

  return runtimeAssets;
}

function resolveElectrobunExecutableAssets(
  targetPlatform: DesktopTargetPlatform,
): string[] {
  const platformDist = resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch);
  return ["launcher", "bun", "bspatch", "zig-zstd"].map((executableName) =>
    join(platformDist, resolveExecutableName(executableName, targetPlatform.os))
  );
}

function resolveElectrobunCoreRuntimeUrl(
  targetPlatform: DesktopTargetPlatform,
): string {
  const platformName = targetPlatform.os === "macos"
    ? "darwin"
    : targetPlatform.os === "win"
      ? "win"
      : "linux";
  return `${ELECTROBUN_GITHUB_RELEASES}/v${ELECTROBUN_PACKAGE_VERSION}/electrobun-core-${platformName}-${targetPlatform.arch}.tar.gz`;
}

function ensureExecutableFile(filePath: string, os: string): void {
  if (os === "win") {
    return;
  }

  chmodSync(filePath, 0o755);
}

function formatPlatformPrefix(channel: string, os: string, arch: string): string {
  return `${channel}-${os}-${arch}`;
}

function snapshotArtifactRootEntryNames(artifactRoot: string): string[] {
  if (!existsSync(artifactRoot)) {
    return [];
  }

  return readdirSync(artifactRoot);
}

function removeArtifactRootEntries(paths: readonly string[]): void {
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true });
  }
}

function resolveElectrobunPackageRoot(): string {
  let currentDirectory = projectRoot;

  while (true) {
    const candidate = join(currentDirectory, "node_modules", "electrobun");
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }

    currentDirectory = parentDirectory;
  }

  throw new Error("Could not resolve the installed electrobun package.");
}

function resolveElectrobunPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(join(ELECTROBUN_PACKAGE_ROOT, "package.json"), "utf8")) as {
    version?: string;
  };
  const version = packageJson.version?.trim();
  if (!version) {
    throw new Error("Could not resolve the installed electrobun package version.");
  }

  return version;
}

function formatTargetPlatform(targetPlatform: DesktopTargetPlatform): string {
  return `${targetPlatform.os}-${targetPlatform.arch}`;
}

function formatElectrobunRelativePath(filePath: string): string {
  return filePath.startsWith(ELECTROBUN_PACKAGE_ROOT)
    ? `electrobun/${relative(ELECTROBUN_PACKAGE_ROOT, filePath)}`
    : relative(projectRoot, filePath);
}

function logReleaseStep(message: string): void {
  console.log(`[release] ${message}`);
}

function copyRequiredFile(sourcePath: string, destinationPath: string): void {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required desktop bundle asset: ${sourcePath}`);
  }

  cpSync(sourcePath, destinationPath, { force: true, recursive: true });
}

function copyBundledRenderer(bundleAppDir: string): void {
  const bundledIndex = join(BUNDLED_RENDERER_DIST, "index.html");
  if (!existsSync(bundledIndex)) {
    throw new Error(`Missing bundled renderer entrypoint: ${bundledIndex}`);
  }

  const bundleMainViewDir = join(bundleAppDir, "views", "mainview");
  mkdirSync(bundleMainViewDir, { recursive: true });
  copyRequiredFile(bundledIndex, join(bundleMainViewDir, "index.html"));

  const bundledAssetsDir = join(BUNDLED_RENDERER_DIST, "assets");
  if (existsSync(bundledAssetsDir)) {
    copyRequiredFile(bundledAssetsDir, join(bundleMainViewDir, "assets"));
  }

  const bundledBrandingDir = join(BUNDLED_RENDERER_DIST, "branding");
  if (existsSync(bundledBrandingDir)) {
    copyRequiredFile(bundledBrandingDir, join(bundleMainViewDir, "branding"));
  }
}

export function copyBundledDesktopData(
  bundleContentsDir: string,
  sourceDataDir = BUNDLED_APP_DATA_DIR,
): void {
  if (!existsSync(sourceDataDir)) {
    return;
  }

  copyRequiredFile(sourceDataDir, join(bundleContentsDir, "data"));
}

function resolveDesktopVersion(): string {
  const version = process.env.MAOMI_DESKTOP_VERSION?.trim() || process.env.MAOMI_RELEASE_VERSION?.trim();
  return version || "0.1.0";
}

function resolveEmbeddedBunVersion(bunPath: string): string {
  const result = Bun.spawnSync({
    cmd: [bunPath, "--version"],
    cwd: projectRoot,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    return Bun.version;
  }

  const version = new TextDecoder().decode(result.stdout).trim();
  return version || Bun.version;
}

function spawnCommand(
  command: string[],
  env?: Record<string, string>,
  cwd = process.cwd(),
) {
  return Bun.spawn({
    cmd: command,
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

async function runCommand(
  command: string[],
  env?: Record<string, string>,
  cwd?: string,
): Promise<void> {
  const processHandle = spawnCommand(command, env, cwd);
  const exitCode = await processHandle.exited;

  if (exitCode === 0) {
    return;
  }

  throw new Error(`Command failed with exit code ${exitCode}: ${command.join(" ")}`);
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return String(error);
}
