export type GitTabKey = "changes" | "branches" | "commit-review" | "code-review";

export type GitCommitReviewUiState = {
  targetType?: "current" | "commit" | "pr";
  selectedTargetId?: string;
  selectedFilePath?: string;
  selectedFindingId?: string;
};

export type GitCodeReviewUiState = {
  scopeType?: "project" | "directory" | "file";
  selectedScopePath?: string;
  selectedFilePath?: string;
  selectedIssueId?: string;
};

export type GitPageUiState = {
  workspaceId?: string;
  activeTab?: GitTabKey;
  commitReview?: GitCommitReviewUiState;
  codeReview?: GitCodeReviewUiState;
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
  return value === "changes"
    || value === "branches"
    || value === "commit-review"
    || value === "code-review";
}

function normalizeCommitReviewState(value: unknown): GitCommitReviewUiState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const normalized: GitCommitReviewUiState = {
    targetType: raw.targetType === "current" || raw.targetType === "commit" || raw.targetType === "pr"
      ? raw.targetType
      : undefined,
    selectedTargetId: normalizeOptionalString(raw.selectedTargetId),
    selectedFilePath: normalizeOptionalString(raw.selectedFilePath),
    selectedFindingId: normalizeOptionalString(raw.selectedFindingId),
  };

  return normalized.targetType || normalized.selectedTargetId || normalized.selectedFilePath || normalized.selectedFindingId
    ? normalized
    : undefined;
}

function normalizeCodeReviewState(value: unknown): GitCodeReviewUiState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const normalized: GitCodeReviewUiState = {
    scopeType: raw.scopeType === "project" || raw.scopeType === "directory" || raw.scopeType === "file"
      ? raw.scopeType
      : undefined,
    selectedScopePath: normalizeOptionalString(raw.selectedScopePath),
    selectedFilePath: normalizeOptionalString(raw.selectedFilePath),
    selectedIssueId: normalizeOptionalString(raw.selectedIssueId),
  };

  return normalized.scopeType || normalized.selectedScopePath || normalized.selectedFilePath || normalized.selectedIssueId
    ? normalized
    : undefined;
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
      commitReview: normalizeCommitReviewState(parsed.commitReview),
      codeReview: normalizeCodeReviewState(parsed.codeReview),
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
    activeTab: isGitTabKey(state.activeTab) ? state.activeTab : undefined,
    commitReview: normalizeCommitReviewState(state.commitReview),
    codeReview: normalizeCodeReviewState(state.codeReview),
  };

  if (!normalized.workspaceId && !normalized.activeTab && !normalized.commitReview && !normalized.codeReview) {
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
    commitReview: {
      selectedFilePath: input.path,
    },
  });

  if (typeof window !== "undefined") {
    window.location.hash = "#git";
  }
}
