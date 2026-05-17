import type { DesktopAppUpdateAsset } from "../../shared/desktop-updater";

export type DesktopAppPublicLatestRelease = {
  hasUpdate: boolean;
  releaseId?: number;
  version?: string;
  versionCode?: number;
  channel?: string;
  title?: string;
  releaseNotes?: string;
  isForceUpdate?: boolean;
  isPrerelease?: boolean;
  assets: DesktopAppUpdateAsset[];
};

export type DesktopAppPublicReleaseAssets = {
  bundleAsset?: DesktopAppUpdateAsset;
  updateInfoAsset?: DesktopAppUpdateAsset;
  installerAsset?: DesktopAppUpdateAsset;
};

export function parseDesktopAppPublicLatestRelease(value: unknown): DesktopAppPublicLatestRelease {
  const payload = isRecord(value) ? value : {};
  const rawAssets = Array.isArray(payload.assets) ? payload.assets : Array.isArray(payload.Assets) ? payload.Assets : [];

  return {
    hasUpdate: readBoolean(payload, ["hasUpdate", "HasUpdate"]),
    releaseId: readInteger(payload, ["releaseId", "ReleaseId"]),
    version: readText(payload, ["version", "Version"]),
    versionCode: readInteger(payload, ["versionCode", "VersionCode"]),
    channel: readText(payload, ["channel", "Channel"]),
    title: readText(payload, ["title", "Title"]),
    releaseNotes: readText(payload, ["releaseNotes", "ReleaseNotes"]),
    isForceUpdate: readBoolean(payload, ["isForceUpdate", "IsForceUpdate"]),
    isPrerelease: readBoolean(payload, ["isPrerelease", "IsPrerelease"]),
    assets: rawAssets.map(parseDesktopAppPublicAsset).filter(Boolean) as DesktopAppUpdateAsset[],
  };
}

export function selectDesktopAppPublicReleaseAssets(
  assets: DesktopAppUpdateAsset[],
): DesktopAppPublicReleaseAssets {
  return {
    bundleAsset: selectDesktopAppPublicAsset(assets, "bundle", "tar.zst"),
    updateInfoAsset: selectDesktopAppPublicAsset(assets, "update-info", "json"),
    installerAsset: selectDesktopAppPublicAsset(assets, "installer"),
  };
}

function parseDesktopAppPublicAsset(value: unknown): DesktopAppUpdateAsset | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const assetId = readInteger(value, ["assetId", "AssetId"]);
  const packageType = readText(value, ["packageType", "PackageType"]);
  const packageFormat = readText(value, ["packageFormat", "PackageFormat"]);
  const fileName = readText(value, ["fileName", "FileName"]);
  const fileSize = readInteger(value, ["fileSize", "FileSize"]);
  if (!assetId || !packageType || !packageFormat || !fileName || !fileSize) {
    return undefined;
  }

  return {
    assetId,
    packageType,
    packageFormat,
    fileName,
    fileSize,
  };
}

function selectDesktopAppPublicAsset(
  assets: DesktopAppUpdateAsset[],
  packageType: string,
  packageFormat?: string,
): DesktopAppUpdateAsset | undefined {
  return assets.find((asset) => {
    if (asset.packageType !== packageType) {
      return false;
    }

    if (!packageFormat) {
      return true;
    }

    return asset.packageFormat === packageFormat;
  });
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