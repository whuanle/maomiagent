import type { GitReviewSurface } from "./git-review-cache";

export const DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH = 420;
export const MIN_GIT_REVIEW_SIDEBAR_WIDTH = 340;
export const MAX_GIT_REVIEW_SIDEBAR_WIDTH = 720;

export type GitReviewLayoutState = {
  sidebarWidth: number;
};

export function buildGitReviewLayoutStorageKey(workspaceId: string, surface: GitReviewSurface) {
  return `git-review-layout::${workspaceId}::${surface}`;
}

function normalizeSidebarWidth(value: unknown) {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value)
      : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH;
  }
  const rounded = Math.round(numeric);
  if (rounded < MIN_GIT_REVIEW_SIDEBAR_WIDTH || rounded > MAX_GIT_REVIEW_SIDEBAR_WIDTH) {
    return DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH;
  }
  return rounded;
}

export function normalizeGitReviewLayoutState(value: unknown): GitReviewLayoutState {
  if (!value || typeof value !== "object") {
    return { sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH };
  }

  const raw = value as { sidebarWidth?: unknown };
  return {
    sidebarWidth: normalizeSidebarWidth(raw.sidebarWidth),
  };
}

export function readGitReviewLayoutState(
  workspaceId: string,
  surface: GitReviewSurface,
): GitReviewLayoutState {
  if (typeof window === "undefined") {
    return { sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH };
  }

  try {
    const raw = window.localStorage.getItem(buildGitReviewLayoutStorageKey(workspaceId, surface));
    if (!raw) {
      return { sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH };
    }
    return normalizeGitReviewLayoutState(JSON.parse(raw));
  } catch {
    return { sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH };
  }
}

export function writeGitReviewLayoutState(
  workspaceId: string,
  surface: GitReviewSurface,
  sidebarWidth: number,
): GitReviewLayoutState {
  const normalized = {
    sidebarWidth: normalizeSidebarWidth(sidebarWidth),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      buildGitReviewLayoutStorageKey(workspaceId, surface),
      JSON.stringify(normalized),
    );
  }

  return normalized;
}
