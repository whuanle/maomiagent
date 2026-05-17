export type GitTabKey = "changes" | "branches" | "ai-review";

export type GitPageUiState = {
  workspaceId?: string;
  activeTab?: GitTabKey;
  selectedReviewFilePath?: string;
  selectedReviewFindingId?: string;
};

const GIT_PAGE_UI_STATE_KEY = "maomi.desktop.git-page-ui-state";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isGitTabKey(value: unknown): value is GitTabKey {
  return value === "changes" || value === "branches" || value === "ai-review";
}

export function readGitPageUiState(): GitPageUiState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(GIT_PAGE_UI_STATE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      workspaceId: normalizeOptionalString(parsed.workspaceId),
      activeTab: isGitTabKey(parsed.activeTab) ? parsed.activeTab : undefined,
      selectedReviewFilePath: normalizeOptionalString(parsed.selectedReviewFilePath),
      selectedReviewFindingId: normalizeOptionalString(parsed.selectedReviewFindingId),
    };
  } catch {
    return null;
  }
}

export function writeGitPageUiState(state: GitPageUiState): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized: GitPageUiState = {
    workspaceId: normalizeOptionalString(state.workspaceId),
    activeTab: state.activeTab,
    selectedReviewFilePath: normalizeOptionalString(state.selectedReviewFilePath),
    selectedReviewFindingId: normalizeOptionalString(state.selectedReviewFindingId),
  };

  if (!normalized.workspaceId && !normalized.activeTab && !normalized.selectedReviewFilePath && !normalized.selectedReviewFindingId) {
    window.sessionStorage.removeItem(GIT_PAGE_UI_STATE_KEY);
    return;
  }

  window.sessionStorage.setItem(GIT_PAGE_UI_STATE_KEY, JSON.stringify(normalized));
}

export function openGitRouteWithReview(input: {
  workspaceId: string;
  path: string;
}): void {
  writeGitPageUiState({
    workspaceId: input.workspaceId,
    activeTab: "changes",
    selectedReviewFilePath: input.path,
  });

  if (typeof window !== "undefined") {
    window.location.hash = "#git";
  }
}