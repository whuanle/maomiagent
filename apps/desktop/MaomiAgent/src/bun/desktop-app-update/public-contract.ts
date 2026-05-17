import type { DesktopAppUpdateAsset } from "../../shared/desktop-updater";

export type DesktopAppPublicLatestRelease = {
  versionId?: number;
  version?: string;
  versionCode?: number;
  title?: string;
  releaseNotes?: string;
  isForceUpdate?: boolean;
  isPrerelease?: boolean;
  minSupportedVersionCode?: number;
  assets: DesktopAppUpdateAsset[];
};

export type DesktopAppPublicReleaseAssets = {
  bundleAsset?: DesktopAppUpdateAsset;
  updateInfoAsset?: DesktopAppUpdateAsset;
  installerAsset?: DesktopAppUpdateAsset;
};

export function parseDesktopAppPublicLatestRelease(value: unknown): DesktopAppPublicLatestRelease {
  const payload = isRecord(value) ? value : {};
  const rawAssets = Array.isArray(payload.files)
    ? payload.files
    : Array.isArray(payload.Files)
      ? payload.Files
      : Array.isArray(payload.assets)
        ? payload.assets
        : Array.isArray(payload.Assets)
          ? payload.Assets
          : [];
  const version = readText(payload, ["version", "Version"]);

  return {
    versionId: readInteger(payload, ["versionId", "VersionId", "releaseId", "ReleaseId"]),
    version,
    versionCode: readInteger(payload, ["versionCode", "VersionCode"]),
    title: readText(payload, ["title", "Title"]),
    releaseNotes: readText(payload, ["releaseNotes", "ReleaseNotes"]),
    isForceUpdate: readBoolean(payload, ["isForceUpdate", "IsForceUpdate"]),
    isPrerelease: readBoolean(payload, ["isPrerelease", "IsPrerelease"]) || version.endsWith("_preview"),
    minSupportedVersionCode: readInteger(payload, ["minSupportedVersionCode", "MinSupportedVersionCode"]),
    assets: rawAssets.map(parseDesktopAppPublicAsset).filter(Boolean) as DesktopAppUpdateAsset[],
  };
}

export function selectDesktopAppPublicReleaseAssets(
  assets: DesktopAppUpdateAsset[],
  platform?: {
    os?: string;
    arch?: string;
  },
): DesktopAppPublicReleaseAssets {
  return {
    bundleAsset: selectDesktopAppPublicAsset(assets, "bundle", "tar.zst", platform),
    updateInfoAsset: selectDesktopAppPublicAsset(assets, "update-info", "json", platform),
    installerAsset: selectDesktopAppPublicAsset(assets, "installer", undefined, platform),
  };
}

function parseDesktopAppPublicAsset(value: unknown): DesktopAppUpdateAsset | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const assetId = readInteger(value, ["versionFileId", "VersionFileId", "assetId", "AssetId"]);
  const packageType = normalizeIdentifier(readText(value, ["packageType", "PackageType"]));
  const fileName = readText(value, ["fileName", "FileName"]);
  const fileSize = readInteger(value, ["fileSize", "FileSize"]);
  const packageFormat = normalizePackageFormat(
    readText(value, ["packageFormat", "PackageFormat", "fileExtension", "FileExtension"]),
    fileName,
  );
  if (!assetId || !packageType || !packageFormat || !fileName || !fileSize) {
    return undefined;
  }

  return {
    assetId,
    packageType,
    packageFormat,
    fileName,
    fileSize,
    os: normalizeIdentifier(readText(value, ["os", "Os"])),
    arch: normalizeIdentifier(readText(value, ["arch", "Arch"])),
    fileHash: readText(value, ["fileHash", "FileHash"]),
  };
}

function selectDesktopAppPublicAsset(
  assets: DesktopAppUpdateAsset[],
  packageType: string,
  packageFormat?: string,
  platform?: {
    os?: string;
    arch?: string;
  },
): DesktopAppUpdateAsset | undefined {
  const normalizedPackageType = normalizeIdentifier(packageType);
  const normalizedPackageFormat = packageFormat ? normalizeIdentifier(packageFormat) : "";
  const normalizedPlatform = {
    os: normalizeIdentifier(platform?.os ?? ""),
    arch: normalizeIdentifier(platform?.arch ?? ""),
  };

  const candidates = assets.filter((asset) => {
    if (normalizeIdentifier(asset.packageType) !== normalizedPackageType) {
      return false;
    }

    if (!normalizedPackageFormat) {
      return true;
    }

    return normalizeIdentifier(asset.packageFormat) === normalizedPackageFormat;
  });

  return candidates.find((asset) => matchesExactPlatform(asset, normalizedPlatform))
    ?? candidates.find((asset) => matchesWildcardPlatform(asset, normalizedPlatform))
    ?? candidates[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function readInteger(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.trunc(candidate);
    }
  }
  return undefined;
}

function readBoolean(value: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    if (typeof value[key] === "boolean") {
      return value[key] as boolean;
    }
  }
  return false;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePackageFormat(fileExtension: string, fileName: string): string {
  const normalizedFileExtension = normalizeIdentifier(fileExtension).replace(/^\./u, "");
  if (normalizedFileExtension) {
    return normalizedFileExtension;
  }

  const normalizedFileName = fileName.trim().toLowerCase();
  if (normalizedFileName.endsWith(".tar.zst")) {
    return "tar.zst";
  }
  if (normalizedFileName.endsWith(".json")) {
    return "json";
  }
  if (normalizedFileName.endsWith(".zip")) {
    return "zip";
  }
  if (normalizedFileName.endsWith(".exe")) {
    return "exe";
  }
  if (normalizedFileName.endsWith(".dmg")) {
    return "dmg";
  }
  if (normalizedFileName.endsWith(".appimage")) {
    return "appimage";
  }

  const [, extension = ""] = /\.([^.]+)$/u.exec(normalizedFileName) ?? [];
  return extension;
}

function matchesExactPlatform(
  asset: DesktopAppUpdateAsset,
  platform: {
    os?: string;
    arch?: string;
  },
): boolean {
  if (!platform.os && !platform.arch) {
    return true;
  }

  const osMatches = !platform.os || Boolean(asset.os && asset.os === platform.os);
  const archMatches = !platform.arch || Boolean(asset.arch && asset.arch === platform.arch);
  return osMatches && archMatches;
}

function matchesWildcardPlatform(
  asset: DesktopAppUpdateAsset,
  platform: {
    os?: string;
    arch?: string;
  },
): boolean {
  const osMatches = !platform.os || !asset.os || asset.os === platform.os;
  const archMatches = !platform.arch || !asset.arch || asset.arch === platform.arch;
  return osMatches && archMatches;
}
