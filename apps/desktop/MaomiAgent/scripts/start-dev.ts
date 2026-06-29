import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startManagedViteDevServer,
  stopManagedViteDevServer,
} from "./vite-dev-server";
import {
  createPackagedDesktopAppUpdateConfig,
} from "../src/bun/desktop-app-update/config";
import {
  activateExistingInstance,
  requestExistingInstanceMainViewRefresh,
} from "../src/bun/single-instance";
import { DESKTOP_LOCAL_CONTROL_PORT } from "../src/shared/desktop-feishu-oauth";

const APP_NAME = "MaomiAgent";
const APP_IDENTIFIER = "com.maomiagent.desktop";
const APP_VERSION = "0.1.0";
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const useHmrDevServer = process.argv.includes("--hmr");
const devInstanceMode = useHmrDevServer ? "hmr" : "stable";
const defaultDevBuildFolder = useHmrDevServer ? "build-hmr" : "build-stable";
const ELECTROBUN_PACKAGE_ROOT = resolveElectrobunPackageRoot();
const ELECTROBUN_WINDOWS_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist-win-x64");
const ELECTROBUN_SHARED_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist");
const ELECTROBUN_PACKAGE_VERSION = resolveElectrobunPackageVersion();
const ELECTROBUN_GITHUB_RELEASES = "https://github.com/blackboardsh/electrobun/releases/download";
const ELECTROBUN_ZIG_ASAR_X64 = join(ELECTROBUN_WINDOWS_DIST, "zig-asar", "x64", "libasar.dll");
const ELECTROBUN_ZIG_ASAR_ARM64 = join(ELECTROBUN_WINDOWS_DIST, "zig-asar", "arm64", "libasar.dll");
const WINDOWS_DEV_ENVIRONMENT = "dev-win-x64";
const WINDOWS_DEV_APP_NAME = `${APP_NAME}-dev`;
const BUNDLED_RENDERER_DIST = join(projectRoot, "dist");
const devInstanceScope = createHash("sha256")
  .update(projectRoot.toLowerCase())
  .digest("hex")
  .slice(0, 12);
const DEV_APP_KEY = `${APP_IDENTIFIER}:dev:${devInstanceMode}:${devInstanceScope}`;
const DEV_LOCAL_CONTROL_PORT = DESKTOP_LOCAL_CONTROL_PORT;

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  if (await activateExistingInstance({
    appKey: DEV_APP_KEY,
    port: DEV_LOCAL_CONTROL_PORT,
  })) {
    if (useHmrDevServer) {
      await attachExistingHmrInstance();
      return;
    }

    const refreshed = await requestExistingInstanceMainViewRefresh({
      appKey: DEV_APP_KEY,
      port: DEV_LOCAL_CONTROL_PORT,
    });
    if (!refreshed) {
      console.warn(`Activated existing MaomiAgent ${devInstanceMode} dev instance, but could not refresh its main view.`);
    }
    console.log(`Activated existing MaomiAgent ${devInstanceMode} dev instance.`);
    return;
  }

  await runCommand(["bun", "run", "brand:generate"]);

  if (!useHmrDevServer) {
    await runCommand(["bun", "x", "vite", "build"]);
    await runDesktopDevApp();
    return;
  }

  const { devServerProcess, devServerUrl } = await startManagedHmrDevServer();

  try {
    await runDesktopDevApp(devServerUrl);
  } finally {
    stopManagedViteDevServer(devServerProcess);
  }
}

async function attachExistingHmrInstance(): Promise<void> {
  const { devServerProcess, devServerUrl } = await startManagedHmrDevServer();

  const refreshed = await requestExistingInstanceMainViewRefresh({
    appKey: DEV_APP_KEY,
    port: DEV_LOCAL_CONTROL_PORT,
    devServerUrl,
  });

  if (!refreshed) {
    stopManagedViteDevServer(devServerProcess);
    console.warn("Activated existing MaomiAgent hmr dev instance, but could not refresh its main view.");
    return;
  }

  console.log(`Activated existing MaomiAgent hmr dev instance and switched it to ${devServerUrl}.`);
  try {
    await devServerProcess.exited;
  } finally {
    stopManagedViteDevServer(devServerProcess);
  }
}

async function startManagedHmrDevServer(): Promise<{
  devServerProcess: ReturnType<typeof spawnCommand>;
  devServerUrl: string;
}> {
  const { devServerProcess, devServerUrl } = await startManagedViteDevServer({
    label: "HMR",
  });
  return { devServerProcess, devServerUrl };
}

async function runDesktopDevApp(devServerUrl?: string): Promise<void> {
  if (process.platform !== "win32") {
    await runCommand(["bun", "x", "electrobun", "dev"], buildDevEnvironment(devServerUrl));
    return;
  }

  const bundlePaths = await prepareWindowsDevBundle();
  await runCommand(
    [bundlePaths.launcherPath],
    buildDevEnvironment(devServerUrl, bundlePaths.buildFolder),
    projectRoot,
  );
}

async function prepareWindowsDevBundle(): Promise<{
  launcherPath: string;
  buildFolder: string;
}> {
  const buildFolder = await resolveWindowsDevBuildFolder(defaultDevBuildFolder);
  const bundleRoot = join(projectRoot, buildFolder, WINDOWS_DEV_ENVIRONMENT, WINDOWS_DEV_APP_NAME);
  const bundleBinDir = join(bundleRoot, "bin");
  const bundleResourcesDir = join(bundleRoot, "Resources");
  const bundleAppDir = join(bundleResourcesDir, "app");
  const bundleBunDir = join(bundleAppDir, "bun");

  mkdirSync(bundleBinDir, { recursive: true });
  mkdirSync(bundleBunDir, { recursive: true });

  await ensureElectrobunWindowsRuntimeAssets();

  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "launcher.exe"), join(bundleBinDir, "launcher.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "bun.exe"), join(bundleBinDir, "bun.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "bspatch.exe"), join(bundleBinDir, "bspatch.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "zig-zstd.exe"), join(bundleBinDir, "zig-zstd.exe"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "libNativeWrapper.dll"), join(bundleBinDir, "libNativeWrapper.dll"));
  copyRequiredFile(join(ELECTROBUN_WINDOWS_DIST, "WebView2Loader.dll"), join(bundleBinDir, "WebView2Loader.dll"));
  copyRequiredFile(ELECTROBUN_ZIG_ASAR_X64, join(bundleBinDir, "libasar.dll"));
  copyRequiredFile(ELECTROBUN_ZIG_ASAR_ARM64, join(bundleBinDir, "libasar-arm64.dll"));
  copyRequiredFile(join(ELECTROBUN_SHARED_DIST, "main.js"), join(bundleResourcesDir, "main.js"));

  await runCommand(
    [join(bundleBinDir, "bun.exe"), "build", "./src/bun/index.ts", "--target", "bun", "--outdir", bundleBunDir],
    undefined,
    projectRoot,
  );

  copyBundledRenderer(bundleAppDir);

  writeFileSync(
    join(bundleResourcesDir, "version.json"),
    JSON.stringify({
      version: APP_VERSION,
      hash: "dev",
      channel: "dev",
      baseUrl: "",
      name: WINDOWS_DEV_APP_NAME,
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
    `${JSON.stringify(createPackagedDesktopAppUpdateConfig({
      channel: "dev",
      os: "win",
      arch: "x64",
    }), null, 2)}\n`,
  );
  return {
    buildFolder,
    launcherPath: join(bundleBinDir, "launcher.exe"),
  };
}

async function resolveWindowsDevBuildFolder(preferredBuildFolder: string): Promise<string> {
  const preferredBuildRoot = join(projectRoot, preferredBuildFolder);
  if (tryRemoveDevBuildFolder(preferredBuildRoot)) {
    return preferredBuildFolder;
  }

  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    await delay(250);
    if (tryRemoveDevBuildFolder(preferredBuildRoot)) {
      return preferredBuildFolder;
    }
  }

  const fallbackBuildFolder = `${preferredBuildFolder}-${Date.now().toString(36)}`;
  console.warn(
    `Could not clean locked dev build folder ${preferredBuildFolder}; using fallback ${fallbackBuildFolder}.`,
  );
  return fallbackBuildFolder;
}

function tryRemoveDevBuildFolder(buildRoot: string): boolean {
  try {
    rmSync(buildRoot, { force: true, recursive: true });
    return true;
  } catch (error) {
    if (!isBusyCleanupError(error)) {
      throw error;
    }
    return false;
  }
}

function isBusyCleanupError(error: unknown): error is { code: string } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown };
  return record.code === "EACCES" || record.code === "EBUSY" || record.code === "EPERM";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
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
  const packageJson = JSON.parse(
    readFileSync(join(ELECTROBUN_PACKAGE_ROOT, "package.json"), "utf8"),
  ) as { version?: string };
  const version = packageJson.version?.trim();
  if (!version) {
    throw new Error("Could not resolve the installed electrobun package version.");
  }
  return version;
}

async function ensureElectrobunWindowsRuntimeAssets(): Promise<void> {
  const requiredAssets = [
    join(ELECTROBUN_WINDOWS_DIST, "launcher.exe"),
    join(ELECTROBUN_WINDOWS_DIST, "bun.exe"),
    join(ELECTROBUN_WINDOWS_DIST, "bspatch.exe"),
    join(ELECTROBUN_WINDOWS_DIST, "zig-zstd.exe"),
    join(ELECTROBUN_WINDOWS_DIST, "libNativeWrapper.dll"),
    join(ELECTROBUN_WINDOWS_DIST, "WebView2Loader.dll"),
    ELECTROBUN_ZIG_ASAR_X64,
    ELECTROBUN_ZIG_ASAR_ARM64,
    join(ELECTROBUN_WINDOWS_DIST, "main.js"),
  ];

  const missingAssets = requiredAssets.filter((filePath) => !existsSync(filePath));
  if (missingAssets.length === 0) {
    return;
  }

  console.log("Electrobun Windows runtime assets are missing; downloading...");
  const archiveUrl = `${ELECTROBUN_GITHUB_RELEASES}/v${ELECTROBUN_PACKAGE_VERSION}/electrobun-core-win-x64.tar.gz`;
  const archivePath = join(ELECTROBUN_PACKAGE_ROOT, "electrobun-core-win-x64.tar.gz");

  await downloadFile(archiveUrl, archivePath);

  try {
    rmSync(ELECTROBUN_WINDOWS_DIST, { recursive: true, force: true });
    mkdirSync(ELECTROBUN_WINDOWS_DIST, { recursive: true });
    await extractTarGzArchive(archivePath, ELECTROBUN_WINDOWS_DIST);
  } finally {
    rmSync(archivePath, { force: true });
  }

  const unresolvedAssets = requiredAssets.filter((filePath) => !existsSync(filePath));
  if (unresolvedAssets.length > 0) {
    throw new Error(
      `Electrobun Windows runtime download incomplete: ${unresolvedAssets.join(", ")}`,
    );
  }

  console.log("Electrobun Windows runtime assets downloaded successfully.");
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  mkdirSync(dirname(destinationPath), { recursive: true });

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
        basename(destinationPath),
        url,
      ],
      undefined,
      dirname(destinationPath),
    );
    return;
  } catch (error) {
    console.warn(
      `curl download failed, retrying with fetch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}: ${url}`);
    }
    writeFileSync(destinationPath, new Uint8Array(await response.arrayBuffer()));
  } finally {
    clearTimeout(timeout);
  }
}

async function extractTarGzArchive(archivePath: string, destinationPath: string): Promise<void> {
  await runCommand(
    ["tar", "-xzf", basename(archivePath), "-C", basename(destinationPath)],
    undefined,
    dirname(archivePath),
  );
}

function buildDevEnvironment(
  devServerUrl?: string,
  buildFolder = defaultDevBuildFolder,
): Record<string, string> {
  return {
    MAOMI_DESKTOP_DEV_APP_KEY: DEV_APP_KEY,
    MAOMI_DESKTOP_LOCAL_CONTROL_PORT: String(DEV_LOCAL_CONTROL_PORT),
    MAOMI_DESKTOP_DEV_BUILD_FOLDER: buildFolder,
    ...(devServerUrl ? { MAOMI_DESKTOP_DEV_SERVER_URL: devServerUrl } : {}),
  };
}

function copyRequiredFile(sourcePath: string, destinationPath: string): void {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required dev bundle asset: ${sourcePath}`);
  }

  cpSync(sourcePath, destinationPath, { force: true, recursive: true });
}

function copyBundledRenderer(bundleAppDir: string): void {
  const bundledIndex = join(BUNDLED_RENDERER_DIST, "index.html");
  if (!existsSync(bundledIndex)) {
    return;
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
    env: env ? { ...Bun.env, ...env } : undefined,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

function stopCommand(processHandle: ReturnType<typeof spawnCommand>): void {
  try {
    processHandle.kill();
  } catch {
    // Ignore cleanup failures while the child process is already stopping.
  }
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
