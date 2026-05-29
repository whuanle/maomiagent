import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_SERVER_HOST, resolveAvailablePort } from "./dev-server-port";
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
const DEV_SERVER_START_TIMEOUT_MS = 30_000;
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const useHmrDevServer = process.argv.includes("--hmr");
const devInstanceMode = useHmrDevServer ? "hmr" : "stable";
const defaultDevBuildFolder = useHmrDevServer ? "build-hmr" : "build-stable";
const ELECTROBUN_PACKAGE_ROOT = resolveElectrobunPackageRoot();
const ELECTROBUN_WINDOWS_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist-win-x64");
const ELECTROBUN_SHARED_DIST = join(ELECTROBUN_PACKAGE_ROOT, "dist");
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
    stopCommand(devServerProcess);
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
    stopCommand(devServerProcess);
    console.warn("Activated existing MaomiAgent hmr dev instance, but could not refresh its main view.");
    return;
  }

  console.log(`Activated existing MaomiAgent hmr dev instance and switched it to ${devServerUrl}.`);
  try {
    await devServerProcess.exited;
  } finally {
    stopCommand(devServerProcess);
  }
}

async function startManagedHmrDevServer(): Promise<{
  devServerProcess: ReturnType<typeof spawnCommand>;
  devServerUrl: string;
}> {
  const devServerPort = await resolveAvailablePort();
  const devServerUrl = `http://${DEV_SERVER_HOST}:${devServerPort}`;
  console.log(`Starting MaomiAgent HMR dev server at ${devServerUrl}.`);
  const devServerProcess = spawnCommand([
    "bun",
    "x",
    "vite",
    "--host",
    DEV_SERVER_HOST,
    "--port",
    String(devServerPort),
    "--strictPort",
  ]);

  let devServerExitCode: number | null = null;
  void devServerProcess.exited.then((exitCode) => {
    devServerExitCode = exitCode;
  });

  await waitForDevServer(devServerUrl, () => devServerExitCode);

  return {
    devServerProcess,
    devServerUrl,
  };
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

async function waitForDevServer(
  devServerUrl: string,
  getExitCode: () => number | null,
): Promise<void> {
  const deadline = Date.now() + DEV_SERVER_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const exitCode = getExitCode();
    if (exitCode !== null) {
      throw new Error(`Vite dev server exited before it became ready (code ${exitCode}).`);
    }

    try {
      const response = await fetch(devServerUrl, { method: "HEAD" });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Retry until the managed dev server is reachable or times out.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for the Vite dev server at ${devServerUrl}.`);
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
