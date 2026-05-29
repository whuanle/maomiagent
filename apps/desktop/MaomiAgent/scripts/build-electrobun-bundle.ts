import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPackagedDesktopAppUpdateConfig,
  normalizeDesktopAppUpdateChannel,
  resolveDesktopAppUpdatePlatform,
} from "../src/bun/desktop-app-update/config";

const APP_NAME = "MaomiAgent";
const APP_IDENTIFIER = "com.maomiagent.desktop";
const APP_VERSION = resolveDesktopVersion();
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildFolder = process.env.MAOMI_DESKTOP_DEV_BUILD_FOLDER?.trim() || "build";
const artifactFolder = process.env.MAOMI_DESKTOP_ARTIFACT_FOLDER?.trim() || "artifacts";
const buildMode = process.env.MAOMI_DESKTOP_BUILD_MODE?.trim() === "release" ? "release" : "dev";
const ELECTROBUN_PACKAGE_ROOT = resolveElectrobunPackageRoot();
const ELECTROBUN_WINDOWS_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist-win-x64");
const ELECTROBUN_SHARED_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist");
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

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  if (buildMode === "release") {
    const releaseChannel = resolveReleaseChannel();
    writeGeneratedUpdateConfig(releaseChannel);
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
  if (process.platform !== "linux") {
    await runCommand(["bun", "x", "electrobun", "build", `--env=${ELECTROBUN_STABLE_ENV}`], undefined, projectRoot);
    return;
  }

  try {
    await runCommand(["bun", "x", "electrobun", "build", `--env=${ELECTROBUN_STABLE_ENV}`], undefined, projectRoot);
    return;
  } catch (error) {
    // The first Linux rollout only needs the bundle tarball. If Electrobun's
    // release installer packaging fails, fall back to exporting the bundle
    // directly so tag-driven GitHub Releases stay publishable.
    console.warn(
      `[release] Linux stable packaging failed, retrying with bundle-only export: ${normalizeError(error)}`,
    );
  }

  await prepareLinuxBundleOnlyReleaseArtifacts(channel);
}

async function prepareWindowsBundle(): Promise<string> {
  const bundleRoot = join(projectRoot, buildFolder, WINDOWS_BUILD_ENVIRONMENT, WINDOWS_APP_NAME);
  await prepareWindowsBundleAt({
    bundleRoot,
    appVersion: APP_VERSION,
    channel: "dev",
  });

  return bundleRoot;
}

async function prepareLinuxBundleOnlyReleaseArtifacts(channel: string): Promise<void> {
  const targetPlatform = resolveDesktopAppUpdatePlatform();
  if (targetPlatform.os !== "linux") {
    throw new Error(`Linux bundle-only fallback can only run on Linux, received ${targetPlatform.os}`);
  }

  await runCommand(["bun", "x", "electrobun", "build"], undefined, projectRoot);

  const devPlatformPrefix = formatPlatformPrefix("dev", targetPlatform.os, targetPlatform.arch);
  const releasePlatformPrefix = formatPlatformPrefix(channel, targetPlatform.os, targetPlatform.arch);
  const devBundleRoot = join(projectRoot, buildFolder, devPlatformPrefix, `${APP_NAME}-dev`);
  const releaseBuildRoot = join(projectRoot, buildFolder, releasePlatformPrefix);
  const releaseBundleRoot = join(releaseBuildRoot, APP_NAME);
  const tarPath = join(releaseBuildRoot, `${APP_NAME}.tar`);
  const compressedTarPath = `${tarPath}.zst`;
  const artifactRoot = join(projectRoot, artifactFolder);
  const artifactBundlePath = join(
    artifactRoot,
    `${releasePlatformPrefix}-${APP_NAME}.tar.zst`,
  );
  const zstdPath = join(resolveElectrobunPlatformDist(targetPlatform.os, targetPlatform.arch), "zig-zstd");

  if (!existsSync(devBundleRoot)) {
    throw new Error(`Linux fallback could not find the dev bundle at ${devBundleRoot}`);
  }
  if (!existsSync(zstdPath)) {
    throw new Error(`Linux fallback could not find zig-zstd at ${zstdPath}`);
  }

  rmSync(releaseBuildRoot, { recursive: true, force: true });
  mkdirSync(releaseBuildRoot, { recursive: true });
  cpSync(devBundleRoot, releaseBundleRoot, { recursive: true, force: true });
  rewriteReleaseBundleVersionFile(releaseBundleRoot, channel);

  await runCommand(["tar", "-cf", tarPath, APP_NAME], undefined, releaseBuildRoot);
  await runCommand(
    [zstdPath, "compress", "-i", tarPath, "-o", compressedTarPath, "--threads", "max"],
    undefined,
    projectRoot,
  );

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  cpSync(compressedTarPath, artifactBundlePath, { force: true });

  console.log(`[release] exported Linux bundle-only artifact ${artifactBundlePath}`);
}

async function prepareWindowsBundleAt(input: {
  bundleRoot: string;
  appVersion: string;
  channel: string;
}): Promise<void> {
  const bundleRoot = input.bundleRoot;
  const bundleBinDir = join(bundleRoot, "bin");
  const bundleResourcesDir = join(bundleRoot, "Resources");
  const bundleAppDir = join(bundleResourcesDir, "app");
  const bundleBunDir = join(bundleAppDir, "bun");

  rmSync(bundleRoot, { force: true, recursive: true });
  mkdirSync(bundleBinDir, { recursive: true });
  mkdirSync(bundleBunDir, { recursive: true });

  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "launcher.exe"), join(bundleBinDir, "launcher.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "bun.exe"), join(bundleBinDir, "bun.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "bspatch.exe"), join(bundleBinDir, "bspatch.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "zig-zstd.exe"), join(bundleBinDir, "zig-zstd.exe"));
  copyRequiredFile(
    join(ELECTROBUN_WINDOWS_DIST, "libNativeWrapper.dll"),
    join(bundleBinDir, "libNativeWrapper.dll"),
  );
  copyRequiredFile(
    join(ELECTROBUN_WINDOWS_DIST, "WebView2Loader.dll"),
    join(bundleBinDir, "WebView2Loader.dll"),
  );
  copyRequiredFile(ELECTROBUN_ZIG_ASAR_X64, join(bundleBinDir, "libasar.dll"));
  copyRequiredFile(ELECTROBUN_ZIG_ASAR_ARM64, join(bundleBinDir, "libasar-arm64.dll"));
  copyRequiredFile(join(ELECTROBUN_SHARED_DIST, "main.js"), join(bundleResourcesDir, "main.js"));

  await runCommand(
    [
      join(bundleBinDir, "bun.exe"),
      "build",
      "./src/bun/index.ts",
      "--target",
      "bun",
      "--outdir",
      bundleBunDir,
      "--external",
      "playwright",
    ],
    undefined,
    projectRoot,
  );

  copyBundledRenderer(bundleAppDir);

  writeFileSync(
    join(bundleResourcesDir, "version.json"),
    JSON.stringify({
      version: input.appVersion,
      hash: "",
      channel: input.channel,
      baseUrl: "",
      name: basename(bundleRoot),
      identifier: APP_IDENTIFIER,
    }),
  );
  writeFileSync(
    join(bundleResourcesDir, "build.json"),
    JSON.stringify({
      defaultRenderer: "native",
      availableRenderers: ["native"],
      runtime: {},
      bunVersion: resolveEmbeddedBunVersion(join(bundleBinDir, "bun.exe")),
    }),
  );
  writeFileSync(
    join(bundleAppDir, "update-config.json"),
    `${JSON.stringify(
      createPackagedDesktopAppUpdateConfig({
        channel: input.channel,
        os: "win",
        arch: "x64",
      }),
      null,
      2,
    )}\n`,
  );
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

function rewriteReleaseBundleVersionFile(bundleRoot: string, channel: string): void {
  const versionFilePath = join(bundleRoot, "Resources", "version.json");
  const payload = existsSync(versionFilePath)
    ? JSON.parse(readFileSync(versionFilePath, "utf8")) as Record<string, unknown>
    : {};

  writeFileSync(
    versionFilePath,
    `${JSON.stringify({
      ...payload,
      version: APP_VERSION,
      hash: "",
      channel,
      baseUrl: "",
      name: APP_NAME,
      identifier: APP_IDENTIFIER,
    })}\n`,
  );
}

function resolveElectrobunPlatformDist(os: string, arch: string): string {
  return join(ELECTROBUN_PACKAGE_ROOT, `dist-${os}-${arch}`);
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
