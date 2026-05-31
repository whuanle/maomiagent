import {
  getDesktopWorkspaceFileContent,
  writeDesktopWorkspaceTextFile,
} from "../../../lib/desktop-workspace";

export type GitReviewSurface = "commit" | "code";

type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

export type GitReviewCachePayload = {
  version: 1;
  surface: GitReviewSurface;
  workspaceId?: string;
  cacheKey: string;
  savedAt: string;
  stale?: boolean;
  signature: Record<string, JsonLike>;
  selection: Record<string, JsonLike>;
  results: Record<string, JsonLike>;
};

export const GIT_REVIEW_CACHE_ROOT = ".maomi/git-review";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function isGitReviewSurface(value: unknown): value is GitReviewSurface {
  return value === "commit" || value === "code";
}

function isJsonLikeRecord(value: unknown): value is Record<string, JsonLike> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeJsonLike(value: unknown): JsonLike {
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
    || typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonLike(item));
  }

  if (isJsonLikeRecord(value)) {
    const next: Record<string, JsonLike> = {};
    for (const key of Object.keys(value).sort()) {
      next[key] = normalizeJsonLike(value[key]);
    }
    return next;
  }

  return String(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeJsonLike(value));
}

export function createStableHexDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildGitReviewPathsDigest(paths: readonly string[]) {
  return createStableHexDigest([...paths].sort().join("\n"));
}

export function buildGitReviewCacheRelativePath(input: {
  surface: GitReviewSurface;
  cacheKey: string;
}) {
  return `${GIT_REVIEW_CACHE_ROOT}/${input.surface}/${createStableHexDigest(input.cacheKey)}.json`;
}

export function isGitReviewCacheStale(input: {
  saved: Record<string, unknown>;
  current: Record<string, unknown>;
}) {
  return stableJson(input.saved) !== stableJson(input.current);
}

export function parseGitReviewCachePayload(raw: string): GitReviewCachePayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const value = parsed as Record<string, unknown>;
    if (value.version !== 1 || !isGitReviewSurface(value.surface)) {
      return null;
    }

    const cacheKey = normalizeOptionalString(value.cacheKey);
    const savedAt = normalizeOptionalString(value.savedAt);
    if (!cacheKey || !savedAt) {
      return null;
    }

    return {
      version: 1,
      surface: value.surface,
      workspaceId: normalizeOptionalString(value.workspaceId),
      cacheKey,
      savedAt,
      stale: value.stale === true ? true : undefined,
      signature: isJsonLikeRecord(value.signature) ? value.signature : {},
      selection: isJsonLikeRecord(value.selection) ? value.selection : {},
      results: isJsonLikeRecord(value.results) ? value.results : {},
    };
  } catch {
    return null;
  }
}

export async function readGitReviewCacheFile(input: {
  workspaceId: string;
  surface: GitReviewSurface;
  cacheKey: string;
}): Promise<GitReviewCachePayload | null> {
  try {
    const file = await getDesktopWorkspaceFileContent(
      input.workspaceId,
      buildGitReviewCacheRelativePath({
        surface: input.surface,
        cacheKey: input.cacheKey,
      }),
    );
    if (file.binary) {
      return null;
    }
    return parseGitReviewCachePayload(file.content);
  } catch {
    return null;
  }
}

export async function writeGitReviewCacheFile(input: {
  workspaceId: string;
  payload: GitReviewCachePayload;
}) {
  return writeDesktopWorkspaceTextFile(
    input.workspaceId,
    buildGitReviewCacheRelativePath({
      surface: input.payload.surface,
      cacheKey: input.payload.cacheKey,
    }),
    `${JSON.stringify(input.payload, null, 2)}\n`,
  );
}
