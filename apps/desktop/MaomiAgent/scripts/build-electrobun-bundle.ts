import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPackagedDesktopAppUpdateConfig,
  normalizeDesktopAppUpdateChannel,
  resolveDesktopAppUpdatePlatform,
} from "../src/bun/desktop-app-update/config";
import {
  buildDesktopNativePackagingFailureMessage,
  resolveDesktopReleaseArtifactMode,
} from "./build-electrobun-release-policy";
import { stageElectrobunHostCli } from "./build-electrobun-host-cli";

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

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

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
  logReleaseStep(`attempting native Electrobun packaging for ${channel}`);
  try {
    await runNativeReleasePackaging();
    return;
  } catch (error) {
    const normalizedError = normalizeError(error);
    const fallbackMode = resolveDesktopReleaseArtifactMode(targetPlatform);
    const failureMessage = buildDesktopNativePackagingFailureMessage(targetPlatform, normalizedError);

    if (fallbackMode === "native-only") {
      throw new Error(failureMessage);
    }

    console.warn(failureMessage);
  }

  logReleaseStep(`switching to bundle-only export for ${formatTargetPlatform(targetPlatform)}`);
  await prepareBundleOnlyReleaseArtifacts(channel, targetPlatform);
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

async function prepareBundleOnlyReleaseArtifacts(
  channel: string,
  targetPlatform: DesktopTargetPlatform,
): Promise<void> {
  logReleaseStep(`preparing bundle-only artifact for ${formatTargetPlatform(targetPlatform)}`);
  const releasePlatformPrefix = formatPlatformPrefix(channel, targetPlatform.os, targetPlatform.arch);
  const releaseBuildRoot = join(projectRoot, buildFolder, releasePlatformPrefix);
  const bundleRoot = join(releaseBuildRoot, resolveReleaseBundleFolderName(targetPlatform.os));
  const tarPath = join(releaseBuildRoot, `${basename(bundleRoot)}.tar`);
  const compressedTarPath = `${tarPath}.zst`;
  const artifactRoot = join(projectRoot, artifactFolder);
  const artifactBundlePath = join(
    artifactRoot,
    `${releasePlatformPrefix}-${basename(compressedTarPath)}`,
  );
  const zstdPath = join(
    resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch),
    resolveExecutableName("zig-zstd", targetPlatform.os),
  );

  rmSync(releaseBuildRoot, { recursive: true, force: true });
  mkdirSync(releaseBuildRoot, { recursive: true });

  await prepareBundleAt({
    bundleRoot,
    appVersion: APP_VERSION,
    channel,
    bundleRuntimeName: APP_NAME,
    targetPlatform,
  });

  logReleaseStep(`creating tar archive ${basename(tarPath)}`);
  await createTarArchive({
    tarPath,
    cwd: releaseBuildRoot,
    entries: [basename(bundleRoot)],
  });
  logReleaseStep(`compressing bundle archive ${basename(compressedTarPath)}`);
  await runCommand(
    [
      zstdPath,
      "compress",
      "-i",
      basename(tarPath),
      "-o",
      basename(compressedTarPath),
      "--threads",
      "max",
    ],
    undefined,
    releaseBuildRoot,
  );

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  cpSync(compressedTarPath, artifactBundlePath, { force: true });

  console.log(`[release] exported ${targetPlatform.os}-${targetPlatform.arch} bundle-only artifact ${artifactBundlePath}`);
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

async function createTarArchive(input: {
  tarPath: string;
  cwd: string;
  entries: string[];
}): Promise<void> {
  const resolvedTarPath = process.platform === "win32"
    ? relative(input.cwd, input.tarPath)
    : input.tarPath;

  await runCommand(["tar", "-cf", resolvedTarPath, ...input.entries], undefined, input.cwd);
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
