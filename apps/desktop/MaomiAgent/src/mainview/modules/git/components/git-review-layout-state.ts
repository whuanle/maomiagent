import type { GitReviewSurface } from "./git-review-cache";

export const DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH = 420;
export const MIN_GIT_REVIEW_SIDEBAR_WIDTH = 340;
export const MAX_GIT_REVIEW_SIDEBAR_WIDTH = 720;
export const DEFAULT_GIT_REVIEW_COMMENTS_WIDTH = 420;
export const MIN_GIT_REVIEW_COMMENTS_WIDTH = 300;
export const MAX_GIT_REVIEW_COMMENTS_WIDTH = 760;

export type GitReviewLayoutState = {
  sidebarWidth: number;
  commentsWidth: number;
};

export function buildGitReviewLayoutStorageKey(workspaceId: string, surface: GitReviewSurface) {
  return `git-review-layout::${workspaceId}::${surface}`;
}

function normalizeSidebarWidth(value: unknown) {
  return normalizeWidth(
    value,
    DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH,
    MIN_GIT_REVIEW_SIDEBAR_WIDTH,
    MAX_GIT_REVIEW_SIDEBAR_WIDTH,
  );
}

function normalizeCommentsWidth(value: unknown) {
  return normalizeWidth(
    value,
    DEFAULT_GIT_REVIEW_COMMENTS_WIDTH,
    MIN_GIT_REVIEW_COMMENTS_WIDTH,
    MAX_GIT_REVIEW_COMMENTS_WIDTH,
  );
}

function normalizeWidth(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value)
      : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const rounded = Math.round(numeric);
  if (rounded < min || rounded > max) {
    return fallback;
  }

  return rounded;
}

export function normalizeGitReviewLayoutState(value: unknown): GitReviewLayoutState {
  if (!value || typeof value !== "object") {
    return {
      sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH,
      commentsWidth: DEFAULT_GIT_REVIEW_COMMENTS_WIDTH,
    };
  }

  const raw = value as { sidebarWidth?: unknown; commentsWidth?: unknown };
  return {
    sidebarWidth: normalizeSidebarWidth(raw.sidebarWidth),
    commentsWidth: normalizeCommentsWidth(raw.commentsWidth),
  };
}

export function readGitReviewLayoutState(
  workspaceId: string,
  surface: GitReviewSurface,
): GitReviewLayoutState {
  if (typeof window === "undefined") {
    return {
      sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH,
      commentsWidth: DEFAULT_GIT_REVIEW_COMMENTS_WIDTH,
    };
  }

  try {
    const raw = window.localStorage.getItem(buildGitReviewLayoutStorageKey(workspaceId, surface));
    if (!raw) {
      return {
        sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH,
        commentsWidth: DEFAULT_GIT_REVIEW_COMMENTS_WIDTH,
      };
    }
    return normalizeGitReviewLayoutState(JSON.parse(raw));
  } catch {
    return {
      sidebarWidth: DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH,
      commentsWidth: DEFAULT_GIT_REVIEW_COMMENTS_WIDTH,
    };
  }
}

export function writeGitReviewLayoutState(
  workspaceId: string,
  surface: GitReviewSurface,
  nextState: Partial<GitReviewLayoutState>,
): GitReviewLayoutState {
  const current = readGitReviewLayoutState(workspaceId, surface);
  const normalized = {
    sidebarWidth: normalizeSidebarWidth(nextState.sidebarWidth ?? current.sidebarWidth),
    commentsWidth: normalizeCommentsWidth(nextState.commentsWidth ?? current.commentsWidth),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      buildGitReviewLayoutStorageKey(workspaceId, surface),
      JSON.stringify(normalized),
    );
  }

  return normalized;
}
