import { createHash, type Hash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL,
  normalizeDesktopAppUpdatePublicBaseUrl,
} from "../src/bun/desktop-app-update/config";

const APP_NAME = "MaomiAgent";
const APP_IDENTIFIER = "com.maomiagent.desktop";
const APP_VERSION = resolveDesktopVersion();
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildFolder = process.env.MAOMI_DESKTOP_DEV_BUILD_FOLDER?.trim() || "build";
const artifactFolder = process.env.MAOMI_DESKTOP_ARTIFACT_FOLDER?.trim() || "artifacts";
const buildMode = process.env.MAOMI_DESKTOP_BUILD_MODE?.trim() === "release" ? "release" : "dev";
const releaseChannel = process.env.MAOMI_RELEASE_CHANNEL?.trim() || "stable";
const releaseBaseUrl = process.env.MAOMI_DESKTOP_UPDATE_BASE_URL?.trim() || "";
const packagedPublicSoftwareBaseUrl = resolvePackagedPublicSoftwareBaseUrl();
const ELECTROBUN_PACKAGE_ROOT = resolveElectrobunPackageRoot();
const ELECTROBUN_WINDOWS_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist-win-x64");
const ELECTROBUN_SHARED_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist");
const ELECTROBUN_ZSTD_X64 = join(ELECTROBUN_WINDOWS_DIST, "zig-zstd.exe");
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
const WINDOWS_RELEASE_ENVIRONMENT = `${releaseChannel}-win-x64`;
const WINDOWS_RELEASE_APP_NAME = APP_NAME;
const BUNDLED_RENDERER_DIST = join(projectRoot, "dist");

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    await runCommand(["bun", "x", "electrobun", "build"]);
    return;
  }

  if (buildMode === "release") {
    const releaseArtifacts = await prepareWindowsReleaseArtifacts();
    console.log(`Prepared Windows desktop release artifacts at ${releaseArtifacts.artifactDirectory}`);
    return;
  }

  const bundleRoot = await prepareWindowsBundle();
  console.log(`Prepared Windows desktop bundle at ${bundleRoot}`);
}

async function prepareWindowsBundle(): Promise<string> {
  const bundleRoot = join(projectRoot, buildFolder, WINDOWS_BUILD_ENVIRONMENT, WINDOWS_APP_NAME);
  await prepareWindowsBundleAt({
    bundleRoot,
    appVersion: APP_VERSION,
    channel: "dev",
    baseUrl: "",
    publicSoftwareBaseUrl: packagedPublicSoftwareBaseUrl,
  });

  return bundleRoot;
}

async function prepareWindowsReleaseArtifacts(): Promise<{ artifactDirectory: string }> {
  const bundleRoot = join(projectRoot, buildFolder, WINDOWS_RELEASE_ENVIRONMENT, WINDOWS_RELEASE_APP_NAME);
  const artifactDirectory = join(projectRoot, artifactFolder);

  rmSync(artifactDirectory, { force: true, recursive: true });
  mkdirSync(artifactDirectory, { recursive: true });

  await prepareWindowsBundleAt({
    bundleRoot,
    appVersion: APP_VERSION,
    channel: releaseChannel,
    baseUrl: releaseBaseUrl,
    publicSoftwareBaseUrl: packagedPublicSoftwareBaseUrl,
  });

  const tarPath = join(projectRoot, buildFolder, WINDOWS_RELEASE_ENVIRONMENT, `${WINDOWS_RELEASE_APP_NAME}.tar`);
  const compressedTarPath = join(artifactDirectory, `${WINDOWS_RELEASE_ENVIRONMENT}-${WINDOWS_RELEASE_APP_NAME}.tar.zst`);
  const zipPath = join(artifactDirectory, `${WINDOWS_RELEASE_ENVIRONMENT}-${WINDOWS_RELEASE_APP_NAME}.zip`);
  const updateInfoPath = join(artifactDirectory, `${WINDOWS_RELEASE_ENVIRONMENT}-update.json`);

  createTar(tarPath, dirname(bundleRoot), [WINDOWS_RELEASE_APP_NAME]);
  await runCommand(
    [ELECTROBUN_ZSTD_X64, "compress", "-i", tarPath, "-o", compressedTarPath, "--threads", "max"],
    undefined,
    dirname(bundleRoot),
  );
  rmSync(tarPath, { force: true });

  await createZipArchive(dirname(bundleRoot), WINDOWS_RELEASE_APP_NAME, zipPath);

  const bundleHash = await computeFileSha256(compressedTarPath);
  writeFileSync(
    updateInfoPath,
    `${JSON.stringify({
      version: APP_VERSION,
      hash: bundleHash,
      platform: "win",
      arch: "x64",
    }, null, 2)}\n`,
  );

  return { artifactDirectory };
}

async function prepareWindowsBundleAt(input: {
  bundleRoot: string;
  appVersion: string;
  channel: string;
  baseUrl: string;
  publicSoftwareBaseUrl?: string;
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
      baseUrl: input.baseUrl,
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
    `${JSON.stringify({
      publicBaseUrl: input.publicSoftwareBaseUrl || "",
      softwareCode: process.env.MAOMI_RELEASE_APP_CODE?.trim() || "maomiagent",
      channel: input.channel,
      os: "win",
      arch: "x64",
    }, null, 2)}\n`,
  );
}

function resolvePackagedPublicSoftwareBaseUrl(): string {
  if (Object.prototype.hasOwnProperty.call(process.env, "MAOMI_DESKTOP_PUBLIC_SOFTWARE_BASE_URL")) {
    return normalizeDesktopAppUpdatePublicBaseUrl(process.env.MAOMI_DESKTOP_PUBLIC_SOFTWARE_BASE_URL);
  }

  return DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL;
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

function createTar(tarPath: string, cwd: string, entries: string[]): void {
  const resolvedTarPath = process.platform === "win32"
    ? tarPath.replace(`${cwd}\\`, "")
    : tarPath;
  const result = Bun.spawnSync({
    cmd: ["tar", "-cf", resolvedTarPath, ...entries],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });

  if (result.exitCode === 0) {
    return;
  }

  throw new Error(`Failed to create tar archive: ${new TextDecoder().decode(result.stderr)}`);
}

async function createZipArchive(cwd: string, entryName: string, zipPath: string): Promise<void> {
  await runCommand(
    [
      "powershell.exe",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${entryName}' -DestinationPath '${zipPath}' -Force`,
    ],
    undefined,
    cwd,
  );
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

async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await updateHashFromFile(hash, filePath);
  return hash.digest("hex");
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
