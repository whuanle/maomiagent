import type {
  DesktopGitChangeItem,
  DesktopGitChangeStatus,
  DesktopGitChangesResult,
  DesktopGitChangesSummary,
  DesktopGitReviewResult,
  DesktopGitReviewScope,
} from "../../../../../shared/desktop-git";

function createEmptyDesktopGitChangesSummary(): DesktopGitChangesSummary {
  return {
    files: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflict: 0,
    additions: 0,
    deletions: 0,
  };
}

function classifyDesktopGitSectionStatus(code: string): DesktopGitChangeStatus {
  if (code === "?") {
    return "untracked";
  }
  if (code === "U") {
    return "conflict";
  }
  if (code === "D") {
    return "deleted";
  }
  if (code === "R" || code === "C") {
    return "renamed";
  }
  if (code === "A") {
    return "added";
  }
  return "modified";
}

function appendDesktopGitChangesSummary(
  summary: DesktopGitChangesSummary,
  status: DesktopGitChangeStatus,
  additions: number,
  deletions: number,
) {
  summary.files += 1;
  summary.additions += additions;
  summary.deletions += deletions;
  if (status === "added") {
    summary.added += 1;
    return;
  }
  if (status === "deleted") {
    summary.deleted += 1;
    return;
  }
  if (status === "renamed") {
    summary.renamed += 1;
    return;
  }
  if (status === "untracked") {
    summary.untracked += 1;
    return;
  }
  if (status === "conflict") {
    summary.conflict += 1;
    return;
  }
  summary.modified += 1;
}

export function normalizeDesktopGitReviewScope(value: unknown): DesktopGitReviewScope {
  return typeof value === "string" && value.trim() === "staged" ? "staged" : "changed";
}

export function buildScopedDesktopGitChangeItems<TItem extends DesktopGitChangeItem>(
  items: TItem[],
  scope: DesktopGitReviewScope,
): TItem[] {
  if (scope !== "staged") {
    return [...items];
  }

  return items.flatMap((item) => {
    const stagedStatus = item.stagedStatus?.trim();
    if (!stagedStatus) {
      return [];
    }

    return [{
      ...item,
      status: classifyDesktopGitSectionStatus(stagedStatus[0] ?? stagedStatus),
      additions: item.stagedAdditions ?? 0,
      deletions: item.stagedDeletions ?? 0,
      unstagedStatus: undefined,
      unstagedAdditions: 0,
      unstagedDeletions: 0,
    } as TItem];
  });
}

export function buildDesktopGitChangesSummary(
  items: DesktopGitChangeItem[],
): DesktopGitChangesSummary {
  const summary = createEmptyDesktopGitChangesSummary();
  for (const item of items) {
    appendDesktopGitChangesSummary(summary, item.status, item.additions, item.deletions);
  }
  return summary;
}

export function buildScopedDesktopGitResult<
  TResult extends DesktopGitChangesResult | DesktopGitReviewResult,
>(
  result: TResult,
  scope: DesktopGitReviewScope,
): TResult {
  if (scope !== "staged") {
    return {
      ...result,
      items: [...result.items],
    } as TResult;
  }

  const items = buildScopedDesktopGitChangeItems(result.items, scope);
  const summary = buildDesktopGitChangesSummary(items);
  return {
    ...result,
    clean: items.length === 0,
    stagedSummary: summary,
    unstagedSummary: createEmptyDesktopGitChangesSummary(),
    summary,
    items,
  } as TResult;
}