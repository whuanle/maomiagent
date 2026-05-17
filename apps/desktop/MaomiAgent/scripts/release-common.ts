import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ReleasePlatformOs = "win" | "macos" | "linux";
export type ReleasePlatformArch = "x64" | "arm64";
export type ReleaseAssetKind = "update-info" | "bundle" | "installer" | "patch";

export type ReleaseManifestAsset = {
  fileName: string;
  objectKey: string;
  contentType: string;
  packageType: ReleaseAssetKind;
  packageFormat: string;
  size: number;
  sha256: string;
  hash?: string;
  fromHash?: string;
};

export type ReleaseManifestPlatform = {
  os: ReleasePlatformOs;
  arch: ReleasePlatformArch;
  platformPrefix: string;
  hash: string;
  updateInfo: ReleaseManifestAsset;
  bundle: ReleaseManifestAsset;
  installers: ReleaseManifestAsset[];
  patches: ReleaseManifestAsset[];
};

export type ReleaseManifest = {
  schemaVersion: 1;
  generatedAt: string;
  publishedAt: string;
  appCode: string;
  channel: string;
  version: string;
  versionCode: number;
  notes: string;
  versionManifestObjectKey: string;
  latestManifestObjectKey: string;
  platforms: ReleaseManifestPlatform[];
};

export type ReleaseUploadPlanItem = {
  sourcePath: string;
  objectKey: string;
  contentType: string;
  cacheControl: string;
  size: number;
  sha256: string;
  kind: "artifact" | "version-manifest" | "latest-manifest";
};

export type ReleaseUploadPlan = {
  schemaVersion: 1;
  generatedAt: string;
  manifestPath: string;
  items: ReleaseUploadPlanItem[];
};

export type ParsedArtifactFileName = {
  channel: string;
  os: ReleasePlatformOs;
  arch: ReleasePlatformArch;
  platformPrefix: string;
  artifactName: string;
};

const MANIFEST_FILE_NAME = "release-manifest.json";
const UPLOAD_PLAN_FILE_NAME = "release-upload-plan.json";
const DEFAULT_OBJECT_PREFIX = "software";
const DEFAULT_RELEASE_CHANNEL = "stable";
const DEFAULT_APP_CODE = "maomiagent";
const PLATFORM_FILE_NAME_RE = /^(?<channel>.+)-(?<os>win|macos|linux)-(?<arch>x64|arm64)-(?<artifactName>.+)$/u;
const VERSION_RE = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<pre>[0-9A-Za-z.-]+))?$/u;

export const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const desktopPackageJsonPath = resolve(projectRoot, "package.json");

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function readDesktopPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(desktopPackageJsonPath, "utf8")) as {
    version?: unknown;
  };
  const version = normalizeText(packageJson.version);
  if (!version) {
    throw new Error(`Could not resolve desktop package version from ${desktopPackageJsonPath}`);
  }
  return version;
}

export async function resolveReleaseVersion(): Promise<string> {
  const requested = normalizeText(
    process.env.MAOMI_RELEASE_VERSION ?? process.env.MAOMI_DESKTOP_VERSION,
  );
  if (requested) {
    return requested.replace(/^[vV]/u, "");
  }
  return readDesktopPackageVersion();
}

export function resolveReleaseAppCode(): string {
  return normalizeText(process.env.MAOMI_RELEASE_APP_CODE) || DEFAULT_APP_CODE;
}

export function resolveReleaseChannel(): string {
  return normalizeText(process.env.MAOMI_RELEASE_CHANNEL) || DEFAULT_RELEASE_CHANNEL;
}

export function resolveObjectPrefix(): string {
  return normalizePathSegment(process.env.MAOMI_RELEASE_OBJECT_PREFIX) || DEFAULT_OBJECT_PREFIX;
}

export async function resolveReleaseNotes(): Promise<string> {
  const direct = normalizeText(process.env.MAOMI_RELEASE_NOTES);
  if (direct) {
    return direct;
  }

  const notesFilePath = normalizeText(process.env.MAOMI_RELEASE_NOTES_FILE);
  if (!notesFilePath) {
    return "";
  }

  return normalizeText(await readFile(resolve(projectRoot, notesFilePath), "utf8"));
}

export function resolvePublishedAt(): string {
  const configured = normalizeText(process.env.MAOMI_RELEASE_PUBLISHED_AT);
  return configured || new Date().toISOString();
}

export function resolveArtifactDirectory(): string {
  const configured = normalizeText(process.env.MAOMI_DESKTOP_ARTIFACT_FOLDER);
  return resolve(projectRoot, configured || "artifacts");
}

export function resolveManifestPath(artifactDirectory: string): string {
  return resolve(artifactDirectory, MANIFEST_FILE_NAME);
}

export function resolveUploadPlanPath(artifactDirectory: string): string {
  return resolve(artifactDirectory, UPLOAD_PLAN_FILE_NAME);
}

export function resolveReleaseVersionCode(version: string): number {
  const explicit = normalizeText(process.env.MAOMI_RELEASE_VERSION_CODE);
  if (explicit) {
    const numeric = Number.parseInt(explicit, 10);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
      throw new Error(`Invalid MAOMI_RELEASE_VERSION_CODE: ${explicit}`);
    }
    return numeric;
  }

  const match = VERSION_RE.exec(version);
  if (!match?.groups) {
    throw new Error(
      `Could not derive versionCode from version ${version}. Set MAOMI_RELEASE_VERSION_CODE explicitly.`,
    );
  }

  const major = Number.parseInt(match.groups.major, 10);
  const minor = Number.parseInt(match.groups.minor, 10);
  const patch = Number.parseInt(match.groups.patch, 10);
  const prereleaseWeight = derivePrereleaseWeight(match.groups.pre);
  const versionCode = (major * 1_000_000_000) + (minor * 1_000_000) + (patch * 1_000) + prereleaseWeight;

  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
    throw new Error(`Derived versionCode is invalid for version ${version}`);
  }

  return versionCode;
}

function derivePrereleaseWeight(prerelease: string | undefined): number {
  if (!prerelease) {
    return 900;
  }

  const parts = prerelease
    .split(/[.-]/u)
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean);

  const label = parts[0] || "pre";
  const sequence = Number.parseInt(parts[1] || "0", 10);
  const base = label === "dev"
    ? 100
    : label === "alpha"
      ? 200
      : label === "beta"
        ? 300
        : label === "rc"
          ? 400
          : label === "canary"
            ? 500
            : 600;
  return Math.min(base + Math.max(sequence, 0), 899);
}

export function parseArtifactFileName(fileName: string): ParsedArtifactFileName {
  const match = PLATFORM_FILE_NAME_RE.exec(fileName);
  if (!match?.groups) {
    throw new Error(`Unsupported release artifact name: ${fileName}`);
  }

  return {
    channel: match.groups.channel,
    os: match.groups.os as ReleasePlatformOs,
    arch: match.groups.arch as ReleasePlatformArch,
    platformPrefix: `${match.groups.channel}-${match.groups.os}-${match.groups.arch}`,
    artifactName: match.groups.artifactName,
  };
}

export function inferAssetKind(fileName: string): ReleaseAssetKind {
  if (fileName === "update.json") {
    return "update-info";
  }
  if (fileName.endsWith(".tar.zst")) {
    return "bundle";
  }
  if (fileName.endsWith(".patch")) {
    return "patch";
  }
  return "installer";
}

export function inferPackageFormat(fileName: string): string {
  if (fileName.endsWith(".tar.zst")) {
    return "tar.zst";
  }
  if (fileName.endsWith(".json")) {
    return "json";
  }
  if (fileName.endsWith(".patch")) {
    return "patch";
  }
  if (fileName.endsWith(".zip")) {
    return "zip";
  }
  if (fileName.endsWith(".exe")) {
    return "exe";
  }
  if (fileName.endsWith(".dmg")) {
    return "dmg";
  }
  if (fileName.endsWith(".AppImage")) {
    return "AppImage";
  }
  const [, extension = "bin"] = /\.([^.]+)$/u.exec(fileName) ?? [];
  return extension;
}

export function inferContentType(fileName: string): string {
  if (fileName.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (fileName.endsWith(".zip")) {
    return "application/zip";
  }
  if (fileName.endsWith(".tar.zst")) {
    return "application/zstd";
  }
  return "application/octet-stream";
}

export async function listReleaseArtifactFilePaths(artifactDirectory: string): Promise<string[]> {
  const entries = await readdir(artifactDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(artifactDirectory, entry.name))
    .filter((filePath) => {
      const normalized = filePath.toLowerCase();
      return !normalized.endsWith(`\\${MANIFEST_FILE_NAME}`)
        && !normalized.endsWith(`\\${UPLOAD_PLAN_FILE_NAME}`)
        && !normalized.endsWith(`/${MANIFEST_FILE_NAME}`)
        && !normalized.endsWith(`/${UPLOAD_PLAN_FILE_NAME}`);
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

export async function readFileMetadata(filePath: string): Promise<{ size: number; sha256: string }> {
  const [fileStat, fileBytes] = await Promise.all([
    stat(filePath),
    Bun.file(filePath).arrayBuffer(),
  ]);

  return {
    size: fileStat.size,
    sha256: createSha256(fileBytes),
  };
}

export function createSha256(bytes: ArrayBuffer | Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return hash.digest("hex");
}

export function buildArtifactObjectKey(
  prefix: string,
  appCode: string,
  channel: string,
  os: ReleasePlatformOs,
  arch: ReleasePlatformArch,
  version: string,
  fileName: string,
): string {
  return joinObjectKey(prefix, appCode, channel, os, arch, `v${version}`, fileName);
}

export function buildVersionManifestObjectKey(prefix: string, appCode: string, channel: string, version: string): string {
  return joinObjectKey(prefix, appCode, channel, `v${version}`, MANIFEST_FILE_NAME);
}

export function buildLatestManifestObjectKey(prefix: string, appCode: string, channel: string): string {
  return joinObjectKey(prefix, appCode, channel, "latest", MANIFEST_FILE_NAME);
}

export function joinObjectKey(...segments: Array<string | undefined>): string {
  return segments
    .map((segment) => normalizePathSegment(segment))
    .filter(Boolean)
    .join("/");
}

export function normalizePathSegment(value: unknown): string {
  return normalizeText(value)
    .replace(/\\+/gu, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function getManifestFileName(): string {
  return MANIFEST_FILE_NAME;
}

export function getUploadPlanFileName(): string {
  return UPLOAD_PLAN_FILE_NAME;
}