export type WoaiVersion = {
  major: number;
  minor: number;
  patch: number;
  build: number;
  isPreview: boolean;
  normalized: string;
};

const RAW_WOAI_VERSION_RE =
  /^(?:[vV])?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:\.(?<build>\d+))?(?<preview>_preview)?$/u;
const NORMALIZED_WOAI_VERSION_RE =
  /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)\.(?<build>\d+)(?<preview>_preview)?$/u;

export function normalizeWoaiVersion(value: unknown): string {
  const input = typeof value === "string" ? value.trim() : "";
  const match = RAW_WOAI_VERSION_RE.exec(input);
  if (!match?.groups) {
    return "";
  }

  const build = match.groups.build ?? "0";
  const preview = match.groups.preview ?? "";
  return `${match.groups.major}.${match.groups.minor}.${match.groups.patch}.${build}${preview}`;
}

export function parseWoaiVersion(value: unknown): WoaiVersion | undefined {
  const normalized = normalizeWoaiVersion(value);
  const match = NORMALIZED_WOAI_VERSION_RE.exec(normalized);
  if (!match?.groups) {
    return undefined;
  }

  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    build: Number.parseInt(match.groups.build, 10),
    isPreview: Boolean(match.groups.preview),
    normalized,
  };
}

export function deriveWoaiVersionCode(value: unknown): number | undefined {
  const parsed = parseWoaiVersion(value);
  if (!parsed) {
    return undefined;
  }

  const previewOffset = parsed.isPreview ? -1 : 0;
  const versionCode =
    (parsed.major * 10_000_000) +
    (parsed.minor * 100_000) +
    (parsed.patch * 1_000) +
    (parsed.build * 10) +
    previewOffset;

  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
    return undefined;
  }

  return versionCode;
}

export function isWoaiPreviewVersion(value: unknown): boolean {
  return Boolean(parseWoaiVersion(value)?.isPreview);
}
