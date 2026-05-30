import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const APP_NAME = "MaomiAgent";

type PortableTargetOs = "win" | "linux" | "macos";
type PortableAssetFormat = "portable-zip" | "app-zip" | "dmg";
type MacosReleaseFormat = "app-zip" | "dmg";

type PortableTargetPlatform = {
  os: PortableTargetOs;
  arch: string;
};

type PortableArchiveInput = {
  sourceRoot: string;
  sourceEntryName: string;
  destinationPath: string;
};

type PortableArchiveCommand = {
  command: string[];
  cwd: string;
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

  writePortableLaunchEntry(input.bundleRoot, input.targetPlatform.os);

  const npmArchivePath = join(npmRoot, resolvePortableNpmArchiveName(input.targetPlatform));
  await (input.createArchive ?? createPortableArchive)({
    sourceRoot: dirname(input.bundleRoot),
    sourceEntryName: basename(input.bundleRoot),
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
    cpSync(npmArchivePath, releaseAssetPath, { force: true });
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

function writePortableLaunchEntry(bundleRoot: string, os: PortableTargetOs): void {
  if (os === "win") {
    writeFileSync(
      join(bundleRoot, `${APP_NAME}.cmd`),
      createPortableWindowsLaunchEntry("bin\\launcher.exe"),
    );
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

async function createZipArchive(input: {
  sourceRoot: string;
  sourceEntryName: string;
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

export function resolvePortableArchiveCommand(
  hostPlatform: NodeJS.Platform,
  input: PortableArchiveInput,
): PortableArchiveCommand {
  if (hostPlatform === "win32") {
    return {
      command: [
        "powershell",
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -LiteralPath '${escapePowerShellLiteral(input.sourceEntryName)}' -DestinationPath '${escapePowerShellLiteral(resolve(input.destinationPath))}' -Force`,
      ],
      cwd: input.sourceRoot,
    };
  }

  if (hostPlatform === "darwin" && input.sourceEntryName.endsWith(".app")) {
    return {
      command: [
        "ditto",
        "-c",
        "-k",
        "--keepParent",
        input.sourceEntryName,
        resolve(input.destinationPath),
      ],
      cwd: input.sourceRoot,
    };
  }

  return {
    command: ["zip", "-y", "-r", "-9", resolve(input.destinationPath), input.sourceEntryName],
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
