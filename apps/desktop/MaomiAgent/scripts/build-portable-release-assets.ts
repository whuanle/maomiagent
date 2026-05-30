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

  mkdirSync(releaseRoot, { recursive: true });
  mkdirSync(npmRoot, { recursive: true });

  writePortableLaunchEntry(input.bundleRoot, input.targetPlatform.os);

  const npmArchivePath = join(npmRoot, resolvePortableNpmArchiveName(input.targetPlatform));
  await createZipArchive({
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
    const siblingDmgPath = join(dirname(input.bundleRoot), `${APP_NAME}.dmg`);
    if (!existsSync(siblingDmgPath)) {
      throw new Error(`Missing macOS dmg build output: ${siblingDmgPath}`);
    }

    releaseAssetPath = join(
      releaseRoot,
      resolvePortableReleaseAssetName({
        channel: input.channel,
        os: input.targetPlatform.os,
        arch: input.targetPlatform.arch,
        format: "dmg",
      }),
    );
    cpSync(siblingDmgPath, releaseAssetPath, { force: true });
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

  if (process.platform === "win32") {
    await runCommand(
      [
        "powershell",
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -LiteralPath '${escapePowerShellLiteral(input.sourceEntryName)}' -DestinationPath '${escapePowerShellLiteral(resolve(input.destinationPath))}' -Force`,
      ],
      input.sourceRoot,
    );
    return;
  }

  await runCommand(
    ["zip", "-y", "-r", "-9", resolve(input.destinationPath), input.sourceEntryName],
    input.sourceRoot,
  );
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
