import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "MaomiAgent";
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const WINDOWS_PORTABLE_LAUNCHER_ENTRYPOINT = join(projectRoot, "scripts", "portable-windows-launcher.ts");
const WINDOWS_PORTABLE_ICON_CANDIDATES = [
  join(
    projectRoot,
    "src",
    "mainview",
    "public",
    "branding",
    "generated",
    "icon-512.ico",
  ),
  join(
    projectRoot,
    "src",
    "mainview",
    "public",
    "branding",
    "generated",
    "icon.ico",
  ),
];

type PortableTargetOs = "win" | "linux" | "macos";
type PortableAssetFormat = "portable-zip" | "app-zip" | "dmg";
type MacosReleaseFormat = "app-zip" | "dmg";

type PortableTargetPlatform = {
  os: PortableTargetOs;
  arch: string;
};

type PortableArchiveInput = {
  sourceRoot: string;
  sourceEntries: string[];
  destinationPath: string;
};

type PortableArchiveCommand = {
  command: string[];
  cwd: string;
};

type PortableWindowsExecutableInput = {
  bundleRoot: string;
  hostPlatform?: NodeJS.Platform;
};

export function resolvePortableReleaseAssetName(input: {
  channel: string;
  os: PortableTargetOs;
  arch: string;
  format: PortableAssetFormat;
}): string {
  const platformPrefix = `${input.channel}-${input.os}-${input.arch}`;

  if (input.format === "portable-zip") {
    if (input.os === "macos") {
      throw new Error("macOS portable release assets must use app-zip or dmg formats.");
    }

    return `${platformPrefix}-${APP_NAME}-portable.zip`;
  }

  if (input.format === "app-zip") {
    if (input.os !== "macos") {
      throw new Error("Only macOS release assets may use the app-zip format.");
    }

    return `${platformPrefix}-${APP_NAME}.app.zip`;
  }

  if (input.os !== "macos") {
    throw new Error("Only macOS release assets may use the dmg format.");
  }

  return `${platformPrefix}-${APP_NAME}.dmg`;
}

export function createPortableWindowsLaunchEntry(relativeLauncherPath: string): string {
  return [
    "@echo off",
    "setlocal",
    `start "" "%~dp0${relativeLauncherPath}" %*`,
    "",
  ].join("\r\n");
}

export function createPortableLinuxLaunchEntry(relativeLauncherPath: string): string {
  return [
    "#!/usr/bin/env sh",
    "set -eu",
    'DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    `exec "$DIR/${relativeLauncherPath}" "$@"`,
    "",
  ].join("\n");
}

export function normalizeMacosReleaseFormat(value?: string): MacosReleaseFormat {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "dmg") {
    return "dmg";
  }

  return "app-zip";
}

export async function exportPortableAssets(input: {
  artifactRoot: string;
  bundleRoot: string;
  channel: string;
  targetPlatform: PortableTargetPlatform;
  macosReleaseFormat?: MacosReleaseFormat;
  nativeMacosDmgPath?: string;
  createArchive?: (input: PortableArchiveInput) => Promise<void>;
  createWindowsExecutable?: (input: PortableWindowsExecutableInput) => Promise<void>;
  createReleaseArchive?: (input: PortableArchiveInput) => Promise<void>;
}): Promise<{
  releaseRoot: string;
  npmRoot: string;
  releaseAssetPath: string;
  npmArchivePath: string;
}> {
  const artifactRoot = resolve(input.artifactRoot);
  const releaseRoot = join(artifactRoot, "release");
  const npmRoot = join(artifactRoot, "npm");
  const macosReleaseFormat = input.macosReleaseFormat ?? "app-zip";

  rmSync(releaseRoot, { recursive: true, force: true });
  rmSync(npmRoot, { recursive: true, force: true });
  mkdirSync(releaseRoot, { recursive: true });
  mkdirSync(npmRoot, { recursive: true });

  await writePortableLaunchEntry(input.bundleRoot, input.targetPlatform.os, {
    createWindowsExecutable: input.createWindowsExecutable,
  });

  const npmArchivePath = join(npmRoot, resolvePortableNpmArchiveName(input.targetPlatform));
  await (input.createArchive ?? createPortableArchive)({
    sourceRoot: dirname(input.bundleRoot),
    sourceEntries: [basename(input.bundleRoot)],
    destinationPath: npmArchivePath,
  });

  let releaseAssetPath = join(
    releaseRoot,
    resolvePortableReleaseAssetName({
      channel: input.channel,
      os: input.targetPlatform.os,
      arch: input.targetPlatform.arch,
      format: input.targetPlatform.os === "macos" ? "app-zip" : "portable-zip",
    }),
  );

  if (input.targetPlatform.os === "macos" && macosReleaseFormat === "dmg") {
    const dmgSourcePath = resolvePortableMacosDmgSourcePath(
      input.nativeMacosDmgPath,
      input.bundleRoot,
    );

    releaseAssetPath = join(
      releaseRoot,
      resolvePortableReleaseAssetName({
        channel: input.channel,
        os: input.targetPlatform.os,
        arch: input.targetPlatform.arch,
        format: "dmg",
      }),
    );
    cpSync(dmgSourcePath, releaseAssetPath, { force: true });
  } else {
    await (input.createReleaseArchive ?? input.createArchive ?? createPortableArchive)(
      resolvePortableReleaseArchiveInput({
        bundleRoot: input.bundleRoot,
        os: input.targetPlatform.os,
        destinationPath: releaseAssetPath,
      }),
    );
  }

  return {
    releaseRoot,
    npmRoot,
    releaseAssetPath,
    npmArchivePath,
  };
}

function resolvePortableNpmArchiveName(targetPlatform: PortableTargetPlatform): string {
  if (targetPlatform.os === "macos") {
    return `macos-${targetPlatform.arch}-app.zip`;
  }

  return `${targetPlatform.os}-${targetPlatform.arch}.zip`;
}

async function writePortableLaunchEntry(
  bundleRoot: string,
  os: PortableTargetOs,
  options?: {
    createWindowsExecutable?: (input: PortableWindowsExecutableInput) => Promise<void>;
  },
): Promise<void> {
  if (os === "win") {
    writeFileSync(
      join(bundleRoot, `${APP_NAME}.cmd`),
      createPortableWindowsLaunchEntry("bin\\launcher.exe"),
    );
    await (options?.createWindowsExecutable ?? createPortableWindowsExecutable)({
      bundleRoot,
    });
    return;
  }

  if (os === "linux") {
    const launchEntryPath = join(bundleRoot, APP_NAME);
    writeFileSync(
      launchEntryPath,
      createPortableLinuxLaunchEntry("bin/launcher"),
    );
    chmodSync(launchEntryPath, 0o755);
  }
}

export function resolvePortableWindowsExecutableCommand(
  input: PortableWindowsExecutableInput,
): PortableArchiveCommand {
  const hostPlatform = input.hostPlatform ?? process.platform;
  if (hostPlatform !== "win32") {
    throw new Error("Portable Windows launcher executables must be built on Windows hosts.");
  }

  const command = [
    "bun",
    "build",
    WINDOWS_PORTABLE_LAUNCHER_ENTRYPOINT,
    "--compile",
    "--target=bun",
    "--outfile",
    join(input.bundleRoot, `${APP_NAME}.exe`),
    "--windows-hide-console",
    "--windows-title",
    APP_NAME,
    "--windows-description",
    `${APP_NAME} portable launcher`,
    "--windows-version",
    resolvePortableWindowsExecutableVersion(input.bundleRoot),
  ];

  const windowsIconPath = resolvePortableWindowsIconPath();
  if (windowsIconPath) {
    command.push("--windows-icon", windowsIconPath);
  }

  return {
    command,
    cwd: projectRoot,
  };
}

async function createPortableWindowsExecutable(input: PortableWindowsExecutableInput): Promise<void> {
  const compileCommand = resolvePortableWindowsExecutableCommand(input);
  await runCommand(compileCommand.command, compileCommand.cwd);
}

export function resolvePortableWindowsIconPath(
  iconCandidates: readonly string[] = WINDOWS_PORTABLE_ICON_CANDIDATES,
): string | undefined {
  for (const iconPath of iconCandidates) {
    if (!iconPath.toLowerCase().endsWith(".ico")) {
      continue;
    }
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  return undefined;
}

function resolvePortableReleaseArchiveInput(
  input: {
    bundleRoot: string;
    os: PortableTargetOs;
    destinationPath: string;
  },
): PortableArchiveInput {
  if (input.os === "macos") {
    return {
      sourceRoot: dirname(input.bundleRoot),
      sourceEntries: [basename(input.bundleRoot)],
      destinationPath: input.destinationPath,
    };
  }

  return {
    sourceRoot: input.bundleRoot,
    sourceEntries: readdirSync(input.bundleRoot).sort(),
    destinationPath: input.destinationPath,
  };
}

async function createZipArchive(input: {
  sourceRoot: string;
  sourceEntries: string[];
  destinationPath: string;
}): Promise<void> {
  rmSync(input.destinationPath, { force: true });
  const archiveCommand = resolvePortableArchiveCommand(process.platform, input);
  await runCommand(archiveCommand.command, archiveCommand.cwd);
}

async function runCommand(command: string[], cwd: string): Promise<void> {
  const processHandle = Bun.spawn({
    cmd: command,
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await processHandle.exited;

  if (exitCode === 0) {
    return;
  }

  throw new Error(`Command failed with exit code ${exitCode}: ${command.join(" ")}`);
}

function escapePowerShellLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function resolvePortableWindowsExecutableVersion(bundleRoot: string): string {
  const versionMetadataPath = join(bundleRoot, "Resources", "version.json");

  if (!existsSync(versionMetadataPath)) {
    return "0.0.0.0";
  }

  try {
    const versionMetadata = JSON.parse(readFileSync(versionMetadataPath, "utf8")) as {
      version?: string;
    };
    return normalizePortableWindowsExecutableVersion(versionMetadata.version);
  } catch {
    return "0.0.0.0";
  }
}

function normalizePortableWindowsExecutableVersion(version?: string): string {
  const numericSegments = (version ?? "")
    .match(/\d+/g)
    ?.slice(0, 4)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0) ?? [];

  while (numericSegments.length < 4) {
    numericSegments.push("0");
  }

  return numericSegments.join(".");
}

export function resolvePortableArchiveCommand(
  hostPlatform: NodeJS.Platform,
  input: PortableArchiveInput,
): PortableArchiveCommand {
  const resolvedDestinationPath = resolve(input.destinationPath);

  if (hostPlatform === "win32") {
    const escapedEntries = input.sourceEntries
      .map((entry) => `'${escapePowerShellLiteral(entry)}'`)
      .join(", ");

    return {
      command: [
        "powershell",
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -LiteralPath ${escapedEntries} -DestinationPath '${escapePowerShellLiteral(resolvedDestinationPath)}' -Force`,
      ],
      cwd: input.sourceRoot,
    };
  }

  if (
    hostPlatform === "darwin"
    && input.sourceEntries.length === 1
    && input.sourceEntries[0]?.endsWith(".app")
  ) {
    return {
      command: [
        "ditto",
        "-c",
        "-k",
        "--keepParent",
        input.sourceEntries[0],
        resolvedDestinationPath,
      ],
      cwd: input.sourceRoot,
    };
  }

  return {
    command: ["zip", "-y", "-r", "-9", resolvedDestinationPath, ...input.sourceEntries],
    cwd: input.sourceRoot,
  };
}

export function resolvePortableMacosDmgSourcePath(
  nativeMacosDmgPath: string | undefined,
  bundleRoot: string,
): string {
  if (nativeMacosDmgPath && existsSync(nativeMacosDmgPath)) {
    return nativeMacosDmgPath;
  }

  const siblingDmgPath = join(dirname(bundleRoot), `${APP_NAME}.dmg`);
  if (existsSync(siblingDmgPath)) {
    return siblingDmgPath;
  }

  if (nativeMacosDmgPath) {
    throw new Error(
      `Missing macOS dmg build output: ${nativeMacosDmgPath}. Checked sibling fallback at ${siblingDmgPath}.`,
    );
  }

  throw new Error(`Missing macOS dmg build output: ${siblingDmgPath}`);
}

export function resolveArtifactRootCleanupPaths(input: {
  artifactRoot: string;
  beforeEntryNames: readonly string[];
  afterEntryNames: readonly string[];
}): string[] {
  const previousEntries = new Set(input.beforeEntryNames);

  return input.afterEntryNames
    .filter((entryName) => !previousEntries.has(entryName))
    .map((entryName) => join(input.artifactRoot, entryName));
}

async function createPortableArchive(input: PortableArchiveInput): Promise<void> {
  await createZipArchive(input);
}
