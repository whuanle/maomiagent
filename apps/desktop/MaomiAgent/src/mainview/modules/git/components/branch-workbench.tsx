import {
  DownOutlined,
  LeftOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Modal,
  Segmented,
  Splitter,
  Spin,
  type MenuProps,
} from "antd";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type {
  DesktopGitBranchItem,
  DesktopGitChangeItem,
  DesktopGitHistoryDetailFile,
  DesktopGitHistoryDetailResult,
  DesktopGitHistoryItem,
  DesktopGitHistoryResult,
  DesktopGitModuleSnapshotResult,
  DesktopGitOperationResult,
  DesktopGitReviewItem,
} from "../../../../shared/desktop-git";
import {
  checkoutDesktopGitBranch,
  cherryPickDesktopGitCommit,
  createDesktopGitBranch,
  deleteDesktopGitBranch,
  fetchDesktopGitRemote,
  getDesktopGitHistory,
  getDesktopGitHistoryDetail,
  getDesktopGitReviewDetail,
  mergeDesktopGitBranchIntoCurrent,
  pullDesktopGitRemote,
  pushDesktopGitRemote,
  rebaseDesktopGitBranchIntoCurrent,
  renameDesktopGitBranch,
  resetDesktopGitCommit,
  revertDesktopGitCommit,
} from "../../../lib/desktop-git";
import type { GitBranchCopy } from "../branch-copy";
import type { GitPageCopy } from "../i18n";
import { BranchCommitGraph } from "./branch-commit-graph";
import { GitDiffPreview } from "./diff-preview";
import { WorkspaceDiffChanges } from "./diff-changes";
import { WorkspaceFileIcon } from "./file-icon";
import {
  resolveWorkspaceReviewStatusClass,
} from "./review-model";
import { GitBranchTree } from "./branch-tree";
import {
  buildGitHistoryGraph,
  deriveLocalGitBranchName,
  formatGitSyncText,
  matchesGitBranchSearch,
  matchesGitHistorySearch,
} from "./branch-model";
import {
  buildGitChangeTree,
  LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD,
  type GitChangeTreeNode,
  type GitSectionEntry,
} from "./view-model";

const GIT_EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

type Props = {
  workspaceId: string;
  pageCopy: GitPageCopy;
  copy: GitBranchCopy;
  snapshot: DesktopGitModuleSnapshotResult | null;
  loading: boolean;
  onRefresh: (silent?: boolean) => Promise<void>;
};

type BranchFilter = "all" | "local" | "remote";
type BranchActionMenuKey =
  | "details"
  | "history"
  | "track"
  | "checkout"
  | "checkout-detached"
  | "create"
  | "merge"
  | "rebase"
  | "rename"
  | "delete"
  | "delete-force"
  | "fetch"
  | "pull"
  | "push";
type CommitActionMenuKey =
  | "details"
  | "review"
  | "create-branch"
  | "checkout-detached"
  | "revert"
  | "cherry-pick"
  | "reset-mixed"
  | "reset-hard"
  | "copy-hash";

type BranchContentTab = "history" | "review";

type CommitReviewState = {
  baseRef: string;
  headRef: string;
  shortHash: string;
  subject: string;
  files: DesktopGitHistoryDetailFile[];
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function compareBranches(left: DesktopGitBranchItem, right: DesktopGitBranchItem) {
  const currentDelta = Number(right.current) - Number(left.current);
  if (currentDelta !== 0) {
    return currentDelta;
  }

  if (left.kind !== right.kind) {
    return left.kind === "local" ? -1 : 1;
  }

  return left.name.localeCompare(right.name, "zh-Hans-CN-u-co-pinyin", {
    numeric: true,
    sensitivity: "base",
  });
}

function resolveBranchRef(item: DesktopGitBranchItem) {
  return item.kind === "remote" ? item.fullName : item.name;
}

function buildBranchMenuItems(input: {
  item: DesktopGitBranchItem;
  copy: GitBranchCopy;
  busyAction: string | null;
  canPullCurrent: boolean;
  canPushCurrent: boolean;
  pushCurrentLabel: string;
}): NonNullable<MenuProps["items"]> {
  const items: NonNullable<MenuProps["items"]> = [
    {
      key: "details",
      label: input.copy.detailsButton,
      disabled: false,
    },
    {
      key: "history",
      label: input.copy.branchViewHistoryButton,
      disabled: false,
    },
  ];

  if (input.item.kind === "remote") {
    items.push({
      key: "track",
      label: input.copy.branchCreateLocalFromRemote,
      disabled: input.busyAction !== null,
    });
    items.push({
      key: "checkout-detached",
      label: input.copy.branchCheckoutDetachedButton,
      disabled: input.busyAction !== null,
    });
  } else if (!input.item.current) {
    items.push({
      key: "checkout",
      label: input.copy.checkoutButton,
      disabled: input.busyAction !== null,
    });
  }

  items.push({
    key: "create",
    label: input.copy.branchCreateFromHereButton,
    disabled: input.busyAction !== null,
  });

  if (!input.item.current && input.item.kind === "local") {
    items.push({ type: "divider" });
    items.push({
      key: "merge",
      label: input.copy.branchMergeIntoCurrentButton,
      disabled: input.busyAction !== null,
    });
    items.push({
      key: "rebase",
      label: input.copy.branchRebaseCurrentButton,
      disabled: input.busyAction !== null,
    });
  }

  if (input.item.kind === "local") {
    items.push({
      key: "rename",
      label: input.copy.branchRenameButton,
      disabled: input.busyAction !== null,
    });
  }

  if (!input.item.current) {
    items.push({
      key: "delete",
      label: input.copy.deleteButton,
      disabled: input.busyAction !== null,
      danger: true,
    });
    if (input.item.kind === "local") {
      items.push({
        key: "delete-force",
        label: input.copy.branchForceDeleteButton,
        disabled: input.busyAction !== null,
        danger: true,
      });
    }
  }

  if (input.item.current) {
    items.push({ type: "divider" });
    items.push({
      key: "fetch",
      label: input.copy.fetchRemoteTitle,
      disabled: input.busyAction !== null,
    });
    items.push({
      key: "pull",
      label: input.copy.pullNowButton,
      disabled: input.busyAction !== null || !input.canPullCurrent,
    });
    items.push({
      key: "push",
      label: input.pushCurrentLabel,
      disabled: input.busyAction !== null || !input.canPushCurrent,
    });
  }

  return items;
}

function buildCommitMenuItems(copy: GitBranchCopy): NonNullable<MenuProps["items"]> {
  return [
    { key: "details", label: copy.detailsButton },
    { key: "review", label: copy.historyOpenDiffButton },
    { key: "copy-hash", label: copy.copyHashButton },
    { type: "divider" },
    { key: "create-branch", label: copy.historyCreateBranchButton },
    { key: "checkout-detached", label: copy.historyCheckoutDetachedButton },
    { type: "divider" },
    { key: "cherry-pick", label: copy.historyCherryPickButton },
    { key: "revert", label: copy.historyRevertButton },
    { key: "reset-mixed", label: copy.historyResetMixedButton },
    { key: "reset-hard", label: copy.historyResetHardButton },
  ];
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function buildCommitReviewFallbackItem(item: DesktopGitHistoryDetailFile): DesktopGitReviewItem {
  return {
    path: item.path,
    previousPath: item.previousPath,
    status: item.status,
    additions: item.additions,
    deletions: item.deletions,
    before: "",
    after: "",
    patch: "",
  };
}

type HistoryDetailTreeEntry = GitSectionEntry & {
  file: DesktopGitHistoryDetailFile;
};

function buildHistoryDetailTreeEntries(files: DesktopGitHistoryDetailFile[]): HistoryDetailTreeEntry[] {
  return files
    .map((file) => {
      const item: DesktopGitChangeItem = {
        path: file.path,
        previousPath: file.previousPath,
        status: file.status,
        stagedStatus: file.statusCode,
        additions: file.additions,
        deletions: file.deletions,
      };

      return {
        path: file.path,
        previousPath: file.previousPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        item,
        file,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN-u-co-pinyin", {
      numeric: true,
      sensitivity: "base",
    }));
}

function buildInitialHistoryDetailCollapsedDirectories(input: {
  nodes: GitChangeTreeNode[];
  activePath?: string | null;
  collapseAll: boolean;
}) {
  const next: Record<string, boolean> = {};

  const visit = (node: GitChangeTreeNode) => {
    if (node.type !== "directory") {
      return;
    }

    const keepOpen = input.activePath
      ? input.activePath === node.path || input.activePath.startsWith(`${node.path}/`)
      : false;

    next[node.path] = input.collapseAll && !keepOpen;
    node.children.forEach(visit);
  };

  input.nodes.forEach(visit);
  return next;
}

function resolveHistoryDetailIndentClass(level: number) {
  return `is-level-${Math.min(level, 8)}`;
}

type HistoryDetailFileTreeNodeListProps = {
  nodes: GitChangeTreeNode[];
  level: number;
  collapsedDirectories: Record<string, boolean>;
  activePath?: string | null;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
};

function HistoryDetailFileTreeNodeList(props: HistoryDetailFileTreeNodeListProps) {
  return (
    <div className={props.level > 0 ? "git-page-change-tree is-nested" : "git-page-change-tree"}>
      {props.nodes.map((node) => {
        if (node.type === "directory") {
          const collapsed = props.collapsedDirectories[node.path];
          return (
            <div key={node.path} className="git-page-change-tree-group">
              <button
                type="button"
                className={`git-page-change-tree-row is-directory ${resolveHistoryDetailIndentClass(props.level)}`}
                onClick={() => props.onToggleDirectory(node.path)}
              >
                <span className={collapsed ? "git-page-change-tree-caret" : "git-page-change-tree-caret is-open"}>
                  <DownOutlined />
                </span>
                <WorkspaceFileIcon
                  path={node.path}
                  className="git-page-review-file-icon"
                  isDirectory
                  expanded={!collapsed}
                />
                <span className="git-page-change-tree-label">{node.name}</span>
                <span className="git-page-change-tree-count">{node.fileCount}</span>
                <WorkspaceDiffChanges className="git-page-change-tree-diff" changes={node} />
              </button>
              {!collapsed && node.children.length > 0 ? (
                <HistoryDetailFileTreeNodeList
                  {...props}
                  nodes={node.children}
                  level={props.level + 1}
                />
              ) : null}
            </div>
          );
        }

        const entry = node.entry as HistoryDetailTreeEntry;
        const statusClassName = resolveWorkspaceReviewStatusClass(entry.status);
        const isActive = node.path === props.activePath;

        return (
          <div
            key={node.path}
            className={isActive ? "git-page-change-tree-row is-file is-active" : "git-page-change-tree-row is-file"}
          >
            <button
              type="button"
              className={`git-page-change-tree-main ${resolveHistoryDetailIndentClass(props.level)}`}
              onClick={() => props.onSelectFile(node.path)}
            >
              <span className="git-page-change-tree-caret is-placeholder">
                <DownOutlined />
              </span>
              <WorkspaceFileIcon path={node.path} className="git-page-review-file-icon" />
              <span className="git-page-change-tree-label">{node.name}</span>
            </button>
            <div className="git-page-change-tree-utility">
              <div className="git-page-change-tree-side">
                <span className={`git-page-change-tree-status git-page-review-status ${statusClassName}`}>
                  {entry.file.statusCode}
                </span>
                <WorkspaceDiffChanges className="git-page-change-tree-diff" changes={entry.file} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type HistoryDetailFileTreeProps = {
  entries: HistoryDetailTreeEntry[];
  activePath?: string | null;
  emptyDescription: string;
  onSelectFile: (path: string) => void;
};

function HistoryDetailFileTree(props: HistoryDetailFileTreeProps) {
  const treeNodes = useMemo(() => buildGitChangeTree(props.entries), [props.entries]);
  const shouldAutoCollapseDirectories = props.entries.length >= LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD;
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, boolean>>(() =>
    buildInitialHistoryDetailCollapsedDirectories({
      nodes: treeNodes,
      activePath: props.activePath,
      collapseAll: shouldAutoCollapseDirectories,
    }));

  useEffect(() => {
    setCollapsedDirectories(buildInitialHistoryDetailCollapsedDirectories({
      nodes: treeNodes,
      activePath: props.activePath,
      collapseAll: shouldAutoCollapseDirectories,
    }));
  }, [props.activePath, shouldAutoCollapseDirectories, treeNodes]);

  if (props.entries.length === 0) {
    return (
      <div className="git-page-branch-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.emptyDescription} />
      </div>
    );
  }

  return (
    <HistoryDetailFileTreeNodeList
      nodes={treeNodes}
      level={0}
      collapsedDirectories={collapsedDirectories}
      activePath={props.activePath}
      onToggleDirectory={(path) => {
        setCollapsedDirectories((current) => ({
          ...current,
          [path]: !current[path],
        }));
      }}
      onSelectFile={props.onSelectFile}
    />
  );
}

export function GitBranchWorkbench(props: Props) {
  const { message, modal } = AntdApp.useApp();
  const [branchContentTab, setBranchContentTab] = useState<BranchContentTab>("history");
  const [historyWorkbenchSize, setHistoryWorkbenchSize] = useState<number | string>(640);
  const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");
  const [branchSearch, setBranchSearch] = useState("");
  const deferredBranchSearch = useDeferredValue(branchSearch);
  const [selectedBranchName, setSelectedBranchName] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const deferredHistorySearch = useDeferredValue(historySearch);
  const [historyResult, setHistoryResult] = useState<DesktopGitHistoryResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<DesktopGitHistoryDetailResult | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [pendingReviewCommitHash, setPendingReviewCommitHash] = useState<string | null>(null);
  const [commitReviewState, setCommitReviewState] = useState<CommitReviewState | null>(null);
  const [commitReviewPath, setCommitReviewPath] = useState<string | null>(null);
  const [commitReviewItem, setCommitReviewItem] = useState<DesktopGitReviewItem | null>(null);
  const [commitReviewLoading, setCommitReviewLoading] = useState(false);
  const [commitReviewError, setCommitReviewError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createStartPoint, setCreateStartPoint] = useState<string | undefined>(undefined);
  const [createBranchName, setCreateBranchName] = useState("");
  const [createCheckout, setCreateCheckout] = useState(true);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSourceName, setRenameSourceName] = useState<string | null>(null);
  const [renameBranchName, setRenameBranchName] = useState("");

  const allBranches = useMemo(
    () => [...(props.snapshot?.branches.items ?? [])].sort(compareBranches),
    [props.snapshot?.branches.items],
  );
  const currentBranchName = props.snapshot?.branches.currentBranch ?? props.snapshot?.changes.branch ?? null;
  const selectedBranch = useMemo(
    () => allBranches.find((item) => item.name === selectedBranchName) ?? null,
    [allBranches, selectedBranchName],
  );
  const filteredBranches = useMemo(() => {
    return allBranches.filter((item) => {
      if (branchFilter !== "all" && item.kind !== branchFilter) {
        return false;
      }
      return matchesGitBranchSearch(item, deferredBranchSearch);
    });
  }, [allBranches, branchFilter, deferredBranchSearch]);
  const filteredHistory = useMemo(() => {
    return (historyResult?.items ?? []).filter((item) => matchesGitHistorySearch(item, deferredHistorySearch));
  }, [deferredHistorySearch, historyResult?.items]);
  const historyGraph = useMemo(() => buildGitHistoryGraph(filteredHistory), [filteredHistory]);
  const historyGraphRows = useMemo(
    () => new Map(historyGraph.rows.map((row) => [row.hash, row])),
    [historyGraph.rows],
  );
  const selectedCommit = useMemo(
    () => filteredHistory.find((item) => item.hash === selectedCommitHash)
      ?? historyResult?.items.find((item) => item.hash === selectedCommitHash)
      ?? null,
    [filteredHistory, historyResult?.items, selectedCommitHash],
  );
  const selectedReviewFile = useMemo(
    () => commitReviewState?.files.find((item) => item.path === commitReviewPath) ?? null,
    [commitReviewPath, commitReviewState?.files],
  );
  const historyDetailTreeEntries = useMemo(
    () => buildHistoryDetailTreeEntries(historyDetail?.files ?? []),
    [historyDetail?.files],
  );
  const reviewTreeEntries = useMemo(
    () => buildHistoryDetailTreeEntries(commitReviewState?.files ?? []),
    [commitReviewState?.files],
  );
  const canPullCurrent = Boolean(selectedBranch?.current && selectedBranch.upstream);
  const canPushCurrent = Boolean(selectedBranch?.current && selectedBranch.name);
  const pushCurrentLabel = selectedBranch?.upstream ? props.copy.pushNowButton : props.copy.publishBranchButton;

  function handleHistoryWorkbenchResize(sizes: Array<number | string>) {
    const nextSize = sizes[0];
    if (typeof nextSize === "number" && Number.isFinite(nextSize)) {
      setHistoryWorkbenchSize(nextSize);
      return;
    }

    if (typeof nextSize === "string" && nextSize.trim().length > 0) {
      setHistoryWorkbenchSize(nextSize);
    }
  }

  useEffect(() => {
    if (selectedBranchName && allBranches.some((item) => item.name === selectedBranchName)) {
      return;
    }

    setSelectedBranchName(currentBranchName ?? allBranches[0]?.name ?? null);
  }, [allBranches, currentBranchName, selectedBranchName]);

  useEffect(() => {
    setBranchContentTab("history");
    setCommitReviewState(null);
    setCommitReviewPath(null);
    setCommitReviewItem(null);
    setCommitReviewError(null);
    setCommitReviewLoading(false);
    setPendingReviewCommitHash(null);
  }, [selectedBranchName]);

  useEffect(() => {
    if (!selectedBranch) {
      setHistoryResult(null);
      setHistoryError(null);
      return;
    }

    let cancelled = false;
    const canReuseSnapshot = Boolean(
      props.snapshot
      && props.snapshot.branches.currentBranch === selectedBranch.name
      && props.snapshot.history.items.length > 0,
    );

    if (canReuseSnapshot) {
      setHistoryResult(props.snapshot?.history ?? null);
    } else {
      setHistoryResult(null);
    }
    setHistoryError(null);
    setHistoryLoading(!canReuseSnapshot);

    void getDesktopGitHistory(props.workspaceId, {
      ref: resolveBranchRef(selectedBranch),
      limit: 120,
      includeStats: true,
    })
      .then((result) => {
        if (!cancelled) {
          setHistoryResult(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryError(`${props.copy.historyLoadFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.copy.historyLoadFailed, props.snapshot, props.workspaceId, selectedBranch]);

  useEffect(() => {
    if (filteredHistory.length === 0) {
      setSelectedCommitHash(null);
      return;
    }

    if (selectedCommitHash && filteredHistory.some((item) => item.hash === selectedCommitHash)) {
      return;
    }

    setSelectedCommitHash(filteredHistory[0]?.hash ?? null);
  }, [filteredHistory, selectedCommitHash]);

  useEffect(() => {
    if (!selectedCommitHash) {
      setHistoryDetail(null);
      setHistoryDetailError(null);
      return;
    }

    let cancelled = false;
    setHistoryDetailLoading(true);
    setHistoryDetailError(null);

    void getDesktopGitHistoryDetail(props.workspaceId, selectedCommitHash)
      .then((result) => {
        if (!cancelled) {
          setHistoryDetail(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryDetail(null);
          setHistoryDetailError(`${props.copy.historyDetailLoadFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.copy.historyDetailLoadFailed, props.workspaceId, selectedCommitHash]);

  useEffect(() => {
    if (!historyDetail) {
      setCommitReviewState(null);
      setCommitReviewPath(null);
      setCommitReviewItem(null);
      setCommitReviewError(null);
      setCommitReviewLoading(false);
      return;
    }

    setCommitReviewState({
      baseRef: historyDetail.parentHashes[0]?.trim() || GIT_EMPTY_TREE_HASH,
      headRef: historyDetail.hash,
      shortHash: historyDetail.shortHash,
      subject: historyDetail.subject,
      files: historyDetail.files,
    });
    setCommitReviewPath((current) => {
      if (current && historyDetail.files.some((item) => item.path === current)) {
        return current;
      }

      return historyDetail.files[0]?.path ?? null;
    });
    setCommitReviewItem(null);
    setCommitReviewError(null);
  }, [historyDetail]);

  useEffect(() => {
    if (!commitReviewState || !selectedReviewFile) {
      setCommitReviewItem(null);
      setCommitReviewError(null);
      setCommitReviewLoading(false);
      return;
    }

    let cancelled = false;
    setCommitReviewLoading(true);
    setCommitReviewError(null);

    void getDesktopGitReviewDetail(props.workspaceId, {
      path: selectedReviewFile.path,
      baseRef: commitReviewState.baseRef,
      headRef: commitReviewState.headRef,
    })
      .then((result) => {
        if (!cancelled) {
          setCommitReviewItem(result.item ?? buildCommitReviewFallbackItem(selectedReviewFile));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommitReviewItem(buildCommitReviewFallbackItem(selectedReviewFile));
          setCommitReviewError(`${props.pageCopy.previewLoadFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCommitReviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    branchContentTab,
    commitReviewState,
    props.pageCopy.previewLoadFailed,
    props.workspaceId,
    selectedReviewFile,
  ]);

  useEffect(() => {
    if (!pendingReviewCommitHash || !historyDetail || historyDetail.hash !== pendingReviewCommitHash) {
      return;
    }

    openHistoryDetailReview(historyDetail);
    setPendingReviewCommitHash(null);
  }, [historyDetail, pendingReviewCommitHash]);

  useEffect(() => {
    if (!pendingReviewCommitHash || !historyDetailError || selectedCommitHash !== pendingReviewCommitHash) {
      return;
    }

    setPendingReviewCommitHash(null);
  }, [historyDetailError, pendingReviewCommitHash, selectedCommitHash]);

  async function runOperation(actionKey: string, operation: () => Promise<DesktopGitOperationResult>, nextBranchName?: string | null) {
    setBusyAction(actionKey);
    try {
      const result = await operation();
      message.success(result.message);
      await props.onRefresh(true);
      const resolvedBranchName = result.branch ?? nextBranchName ?? null;
      if (resolvedBranchName) {
        setSelectedBranchName(resolvedBranchName);
      }
    } catch (error) {
      message.error(normalizeError(error));
    } finally {
      setBusyAction(null);
    }
  }

  function openCreateBranch(startPoint?: string, defaultName?: string) {
    setCreateStartPoint(startPoint);
    setCreateBranchName(defaultName ?? "");
    setCreateCheckout(true);
    setCreateModalOpen(true);
  }

  function openRenameBranch(branch: DesktopGitBranchItem) {
    setRenameSourceName(branch.name);
    setRenameBranchName(branch.name);
    setRenameModalOpen(true);
  }

  function openCommitReview(input: {
    hash: string;
    shortHash: string;
    subject: string;
    parentHashes: string[];
    files: DesktopGitHistoryDetailFile[];
    path?: string;
  }) {
    if (input.files.length === 0) {
      message.info(props.copy.noChangedFilesInCommit);
      return;
    }

    const headRef = input.hash.trim();
    if (!headRef) {
      return;
    }

    const targetPath = input.path?.trim() || input.files[0]?.path || null;
    setSelectedCommitHash(headRef);
    setCommitReviewState({
      baseRef: input.parentHashes[0]?.trim() || GIT_EMPTY_TREE_HASH,
      headRef,
      shortHash: input.shortHash,
      subject: input.subject,
      files: input.files,
    });
    setCommitReviewPath(targetPath);
    setCommitReviewItem(null);
    setCommitReviewError(null);
    setBranchContentTab("review");
  }

  function openHistoryDetailReview(detail: DesktopGitHistoryDetailResult) {
    const preferredPath = commitReviewPath && detail.files.some((item) => item.path === commitReviewPath)
      ? commitReviewPath
      : undefined;

    setPendingReviewCommitHash(null);
    openCommitReview({
      hash: detail.hash,
      shortHash: detail.shortHash,
      subject: detail.subject,
      parentHashes: detail.parentHashes,
      files: detail.files,
      path: preferredPath,
    });
  }

  function handleBranchAction(item: DesktopGitBranchItem, key: string) {
    if (key === "details" || key === "history") {
      setSelectedBranchName(item.name);
      return;
    }

    if (key === "track") {
      openCreateBranch(item.fullName, deriveLocalGitBranchName(item.name));
      return;
    }

    if (key === "checkout") {
      void runOperation(`branch:checkout:${item.name}`, () =>
        checkoutDesktopGitBranch(props.workspaceId, { name: item.name }), item.name);
      return;
    }

    if (key === "checkout-detached") {
      void runOperation(`branch:detach:${item.name}`, () =>
        checkoutDesktopGitBranch(props.workspaceId, { name: resolveBranchRef(item), detach: true }));
      return;
    }

    if (key === "create") {
      openCreateBranch(resolveBranchRef(item), item.kind === "remote" ? deriveLocalGitBranchName(item.name) : undefined);
      return;
    }

    if (key === "merge") {
      modal.confirm({
        title: props.copy.mergeBranchTitle(item.name),
        content: props.copy.mergeBranchDescription,
        okText: props.copy.branchMergeIntoCurrentButton,
        cancelText: props.copy.confirmCancel,
        onOk: async () => {
          await runOperation(`branch:merge:${item.name}`, () =>
            mergeDesktopGitBranchIntoCurrent(props.workspaceId, { name: item.name }));
        },
      });
      return;
    }

    if (key === "rebase") {
      modal.confirm({
        title: props.copy.rebaseBranchTitle(item.name),
        content: props.copy.rebaseBranchDescription,
        okText: props.copy.branchRebaseCurrentButton,
        cancelText: props.copy.confirmCancel,
        onOk: async () => {
          await runOperation(`branch:rebase:${item.name}`, () =>
            rebaseDesktopGitBranchIntoCurrent(props.workspaceId, { name: item.name }));
        },
      });
      return;
    }

    if (key === "rename") {
      openRenameBranch(item);
      return;
    }

    if (key === "delete" || key === "delete-force") {
      const force = key === "delete-force";
      modal.confirm({
        title: force ? props.copy.deleteBranchForceTitle(item.name) : props.copy.deleteBranchTitle(item.name),
        content: force ? props.copy.deleteBranchForceDescription : props.copy.deleteBranchDescription,
        okText: props.copy.confirmDelete,
        cancelText: props.copy.confirmCancel,
        okButtonProps: { danger: true },
        onOk: async () => {
          await runOperation(`branch:delete:${item.name}`, () =>
            deleteDesktopGitBranch(props.workspaceId, { name: item.name, force }));
        },
      });
      return;
    }

    if (key === "fetch") {
      void runOperation("git:fetch", () => fetchDesktopGitRemote(props.workspaceId));
      return;
    }

    if (key === "pull") {
      void runOperation("git:pull", () => pullDesktopGitRemote(props.workspaceId));
      return;
    }

    if (key === "push") {
      void runOperation("git:push", () =>
        pushDesktopGitRemote(props.workspaceId, { setUpstream: !item.upstream }));
    }
  }

  function handleCommitAction(item: DesktopGitHistoryItem, key: CommitActionMenuKey) {
    if (key === "details") {
      setSelectedCommitHash(item.hash);
      return;
    }

    if (key === "review") {
      if (historyDetail?.hash === item.hash) {
        openHistoryDetailReview(historyDetail);
        return;
      }

      setPendingReviewCommitHash(item.hash);
      setSelectedCommitHash(item.hash);
      return;
    }

    if (key === "copy-hash") {
      void copyText(item.hash)
        .then(() => message.success(props.copy.copiedCommitHashNotice))
        .catch((error) => message.error(normalizeError(error)));
      return;
    }

    if (key === "create-branch") {
      openCreateBranch(item.hash);
      return;
    }

    if (key === "checkout-detached") {
      void runOperation(`history:detach:${item.hash}`, () =>
        checkoutDesktopGitBranch(props.workspaceId, { name: item.hash, detach: true }));
      return;
    }

    if (key === "revert") {
      modal.confirm({
        title: props.copy.historyRevertTitle(item.shortHash),
        content: props.copy.historyRevertDescription,
        okText: props.copy.historyRevertButton,
        cancelText: props.copy.confirmCancel,
        onOk: async () => {
          await runOperation(`history:revert:${item.hash}`, () =>
            revertDesktopGitCommit(props.workspaceId, { hash: item.hash }));
        },
      });
      return;
    }

    if (key === "cherry-pick") {
      modal.confirm({
        title: props.copy.historyCherryPickTitle(item.shortHash),
        content: props.copy.historyCherryPickDescription,
        okText: props.copy.historyCherryPickButton,
        cancelText: props.copy.confirmCancel,
        onOk: async () => {
          await runOperation(`history:cherry-pick:${item.hash}`, () =>
            cherryPickDesktopGitCommit(props.workspaceId, { hash: item.hash }));
        },
      });
      return;
    }

    const hard = key === "reset-hard";
    modal.confirm({
      title: hard ? props.copy.historyResetHardTitle(item.shortHash) : props.copy.historyResetMixedTitle(item.shortHash),
      content: hard ? props.copy.historyResetHardDescription : props.copy.historyResetMixedDescription,
      okText: hard ? props.copy.historyResetHardButton : props.copy.historyResetMixedButton,
      cancelText: props.copy.confirmCancel,
      okButtonProps: { danger: hard },
      onOk: async () => {
        await runOperation(`history:reset:${item.hash}`, () =>
          resetDesktopGitCommit(props.workspaceId, { hash: item.hash, mode: hard ? "hard" : "mixed" }));
      },
    });
  }

  const branchMenuFactory = (item: DesktopGitBranchItem) => buildBranchMenuItems({
    item,
    copy: props.copy,
    busyAction,
    canPullCurrent,
    canPushCurrent,
    pushCurrentLabel,
  });

  return (
    <div className="git-page-branch-module">
      <div className="git-page-workbench git-page-branch-workbench-panel">
        <div className="git-page-workbench-sidebar">
          <div className="git-page-branch-list-pane">
            <div className="git-page-branch-sidebar-summary">
              <div className="git-page-branch-sidebar-summary-label">{props.pageCopy.branchLabel}</div>
              <div className="git-page-branch-sidebar-summary-title-row">
                <div className="git-page-branch-sidebar-summary-title">{selectedBranch?.name ?? props.copy.noBranchLabel}</div>
                {selectedBranch?.current ? <span className="git-page-branch-kind-badge is-current">{props.copy.branchCurrentTag}</span> : null}
                {selectedBranch ? (
                  <span className={`git-page-branch-kind-badge ${selectedBranch.kind === "remote" ? "is-remote" : "is-local"}`}>
                    {selectedBranch.kind === "remote" ? props.copy.branchTypeRemote : props.copy.branchTypeLocal}
                  </span>
                ) : null}
              </div>
              <div className="git-page-branch-sidebar-summary-tags">
                {selectedBranch?.lastCommitHash ? (
                  <span className="git-page-branch-summary-hash">{selectedBranch.lastCommitHash.slice(0, 7)}</span>
                ) : null}
                {selectedBranch ? (
                  <span className="git-page-branch-kind-badge is-sync">
                    {formatGitSyncText(selectedBranch.ahead, selectedBranch.behind, props.copy.syncUpToDateLabel)}
                  </span>
                ) : null}
              </div>
              {selectedBranch ? (
                <div className="git-page-branch-sidebar-summary-meta">
                  {selectedBranch.upstream ? <span>{selectedBranch.upstream}</span> : null}
                  {selectedBranch.lastCommitSubject ? <span>{selectedBranch.lastCommitSubject}</span> : null}
                </div>
              ) : null}
            </div>
            <div className="git-page-branch-toolbar">
              <div className="git-page-branch-toolbar-main">
                <div className="git-page-branch-toolbar-group is-search">
                  <Input
                    value={branchSearch}
                    onChange={(event) => setBranchSearch(event.target.value)}
                    prefix={<SearchOutlined className="git-page-branch-search-icon" />}
                    className="git-page-branch-search"
                    placeholder={props.copy.branchSearchPlaceholder}
                    allowClear
                  />
                </div>
                <Button
                  type="primary"
                  className="git-page-branch-toolbar-create"
                  icon={<PlusOutlined />}
                  disabled={Boolean(busyAction)}
                  onClick={() => openCreateBranch(selectedBranch ? resolveBranchRef(selectedBranch) : currentBranchName ?? undefined)}
                >
                  {props.copy.createBranchToolbarLabel}
                </Button>
              </div>
              <div className="git-page-branch-toolbar-group is-filters">
                <Segmented
                  value={branchFilter}
                  onChange={(value) => setBranchFilter(value as BranchFilter)}
                  options={[
                    { label: props.copy.branchFilterAll, value: "all" },
                    { label: props.copy.branchFilterLocal, value: "local" },
                    { label: props.copy.branchFilterRemote, value: "remote" },
                  ]}
                />
              </div>
            </div>
            <GitBranchTree
              copy={props.copy}
              items={filteredBranches}
              selectedBranchName={selectedBranchName}
              busyAction={busyAction}
              searchValue={deferredBranchSearch}
              emptyDescription={deferredBranchSearch ? props.copy.noMatchingBranches : props.pageCopy.emptyBranches}
              getActionMenuItems={branchMenuFactory}
              onSelectBranch={(item) => setSelectedBranchName(item.name)}
              onMenuAction={handleBranchAction}
            />
          </div>
        </div>
        <div className="git-page-workbench-preview">
          <div className="git-page-branch-preview-pane">
            {branchContentTab === "review" || busyAction ? (
              <div className="git-page-branch-preview-toolbar">
                <div className="git-page-branch-preview-head-actions">
                  {branchContentTab === "review" ? (
                    <Button
                      size="small"
                      icon={<LeftOutlined />}
                      onClick={() => setBranchContentTab("history")}
                    >
                      {props.pageCopy.historyListTitle}
                    </Button>
                  ) : null}
                  {busyAction ? <span className="git-page-branch-preview-busy"><Spin size="small" /></span> : null}
                </div>
              </div>
            ) : null}
            <div className={`git-page-branch-content-body${branchContentTab === "review" ? " is-review" : ""}`}>
              {branchContentTab === "review" ? (
                <div className="git-page-workbench git-page-review-workbench">
                  <div className="git-page-workbench-sidebar">
                    <div className="git-page-review-pane">
                      <div className="git-page-branch-detail-head">
                        <div className="git-page-branch-detail-head-row">
                          <div className="git-page-branch-detail-title-wrap">
                            <span className="git-page-change-section-title">{commitReviewState?.subject ?? props.copy.historyOpenDiffButton}</span>
                            {commitReviewState?.shortHash ? (
                              <span className="git-page-branch-detail-count is-hash">{commitReviewState.shortHash}</span>
                            ) : null}
                            {commitReviewState ? (
                              <span className="git-page-branch-detail-count">{commitReviewState.files.length}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="git-page-review-list">
                      <div className="git-page-review-tree">
                        <HistoryDetailFileTree
                          entries={reviewTreeEntries}
                          activePath={commitReviewPath}
                          emptyDescription={props.copy.noChangedFilesInCommit}
                          onSelectFile={(path) => setCommitReviewPath(path)}
                        />
                      </div>
                      </div>
                    </div>
                  </div>
                  <div className="git-page-workbench-preview">
                    <GitDiffPreview
                      copy={props.pageCopy}
                      item={commitReviewItem}
                      loading={commitReviewLoading}
                      error={commitReviewError}
                      emptyDescription={commitReviewPath ? props.pageCopy.reviewDrawerEmpty : props.pageCopy.noPreviewSelected}
                    />
                  </div>
                </div>
              ) : (
                <Splitter className="git-page-branch-detail-grid" onResize={handleHistoryWorkbenchResize}>
                <Splitter.Panel
                  className="git-page-branch-splitter-panel"
                  size={historyWorkbenchSize}
                  min={420}
                  max={980}
                >
                  <div className="git-page-branch-detail-panel">
                    <div className="git-page-branch-detail-head">
                      <div className="git-page-branch-detail-head-row">
                        <div className="git-page-branch-detail-title-wrap">
                          <span className="git-page-change-section-title">{props.pageCopy.historyListTitle}</span>
                          <span className="git-page-branch-detail-count">{filteredHistory.length}</span>
                        </div>
                      </div>
                      <Input
                        value={historySearch}
                        onChange={(event) => setHistorySearch(event.target.value)}
                        prefix={<SearchOutlined className="git-page-branch-search-icon" />}
                        className="git-page-branch-history-search"
                        placeholder={props.copy.historySearchPlaceholder}
                        allowClear
                      />
                    </div>
                    <div className="git-page-branch-detail-body is-history">
                      {historyLoading ? (
                        <div className="git-page-branch-empty"><Spin /></div>
                      ) : historyError ? (
                        <div className="git-page-branch-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={historyError} />
                        </div>
                      ) : filteredHistory.length === 0 ? (
                        <div className="git-page-branch-empty">
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={deferredHistorySearch ? props.copy.noMatchingHistory : props.copy.noHistory}
                          />
                        </div>
                      ) : (
                        <div className="git-page-branch-history-list">
                          {filteredHistory.map((item) => {
                            const isActive = item.hash === selectedCommitHash;
                            const isHead = item.hash === selectedBranch?.lastCommitHash;
                            const graphRow = historyGraphRows.get(item.hash);
                            return (
                              <div
                                key={item.hash}
                                className={`git-page-branch-commit-row${isActive ? " is-active" : ""}${isHead ? " is-head" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="git-page-branch-commit-hit"
                                  onClick={() => setSelectedCommitHash(item.hash)}
                                >
                                  <BranchCommitGraph
                                    row={graphRow}
                                    laneCount={historyGraph.maxLaneCount}
                                    isHead={isHead}
                                    isActive={isActive}
                                  />
                                  <span className="git-page-branch-commit-copy">
                                    <span className="git-page-branch-commit-title-row">
                                      <span className="git-page-branch-commit-subject">{item.subject}</span>
                                      <span className="git-page-branch-commit-markers">
                                        {item.refs.slice(0, 3).map((ref) => (
                                          <span key={ref} className="git-page-branch-commit-marker">
                                            {ref}
                                          </span>
                                        ))}
                                      </span>
                                    </span>
                                    <span className="git-page-branch-commit-aux">
                                      <span className="git-page-branch-commit-meta">
                                        {item.authorName ? <span className="git-page-branch-commit-meta-piece is-author">{item.authorName}</span> : null}
                                        {item.authoredRelative ? <span className="git-page-branch-commit-meta-piece">{item.authoredRelative}</span> : null}
                                        <span className="git-page-branch-commit-meta-piece is-id">{item.shortHash}</span>
                                      </span>
                                      <WorkspaceDiffChanges changes={item} />
                                    </span>
                                  </span>
                                </button>
                                <div className="git-page-branch-commit-actions">
                                  <Dropdown
                                    menu={{
                                      items: buildCommitMenuItems(props.copy),
                                      onClick: ({ key }) => handleCommitAction(item, key as CommitActionMenuKey),
                                    }}
                                    trigger={["click"]}
                                  >
                                    <Button
                                      type="text"
                                      size="small"
                                      className="git-page-branch-commit-action-button"
                                      icon={<MoreOutlined />}
                                    />
                                  </Dropdown>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </Splitter.Panel>
                <Splitter.Panel className="git-page-branch-splitter-panel" min={420}>
                  <div className="git-page-branch-detail-panel">
                    <div className="git-page-branch-detail-body is-detail-shell">
                      {historyDetailLoading ? (
                        <div className="git-page-branch-empty"><Spin /></div>
                      ) : historyDetailError ? (
                        <div className="git-page-branch-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={historyDetailError} />
                        </div>
                      ) : !historyDetail ? (
                        <div className="git-page-branch-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.copy.selectCommitToView} />
                        </div>
                      ) : (
                        <div className="git-page-branch-detail-stack-shell">
                          <div className="git-page-branch-detail-stack">
                            <div className="git-page-branch-detail-panel git-page-branch-inline-panel is-stack-top">
                              <div className="git-page-commit-detail-summary-card">
                                <div className="git-page-commit-detail-summary">
                                  <div className="git-page-commit-detail-summary-main">
                                    <div className="git-page-branch-history-head">
                                      <div className="git-page-branch-preview-title-row">
                                        <div className="git-page-branch-preview-title">{historyDetail.subject}</div>
                                      </div>
                                      <div className="git-page-commit-detail-meta is-plain">
                                        {historyDetail.authorName ? <span>{historyDetail.authorName}</span> : null}
                                        {historyDetail.authoredRelative ? <span>{historyDetail.authoredRelative}</span> : null}
                                        <span>{historyDetail.shortHash}</span>
                                        <span>{props.copy.fileCountLabel(historyDetail.filesChanged)}</span>
                                        <span>{props.copy.parentCountLabel(historyDetail.parentHashes.length)}</span>
                                        {(historyDetail.additions > 0 || historyDetail.deletions > 0) ? (
                                          <WorkspaceDiffChanges changes={historyDetail} />
                                        ) : null}
                                      </div>
                                      {historyDetail.body ? (
                                        <div className="git-page-commit-detail-description">{historyDetail.body}</div>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="git-page-commit-detail-actions">
                                    <Button
                                      type="link"
                                      size="small"
                                      className="git-page-commit-detail-action-button"
                                      onClick={() => openHistoryDetailReview(historyDetail)}
                                      disabled={Boolean(busyAction) || historyDetail.files.length === 0}
                                    >
                                      {props.copy.historyOpenDiffButton}
                                    </Button>
                                    <Button
                                      type="link"
                                      size="small"
                                      className="git-page-commit-detail-action-button"
                                      onClick={() => openCreateBranch(historyDetail.hash)}
                                      disabled={Boolean(busyAction)}
                                    >
                                      {props.copy.historyCreateBranchButton}
                                    </Button>
                                    <Button
                                      type="link"
                                      size="small"
                                      className="git-page-commit-detail-action-button"
                                      onClick={() => void runOperation(`history:detach:${historyDetail.hash}`, () =>
                                        checkoutDesktopGitBranch(props.workspaceId, { name: historyDetail.hash, detach: true }))}
                                      disabled={Boolean(busyAction)}
                                    >
                                      {props.copy.historyCheckoutDetachedButton}
                                    </Button>
                                    <Button
                                      type="link"
                                      size="small"
                                      className="git-page-commit-detail-action-button"
                                      onClick={() => {
                                        void copyText(historyDetail.subject)
                                          .then(() => message.success(props.copy.copiedCommitMessageNotice))
                                          .catch((error) => message.error(normalizeError(error)));
                                      }}
                                    >
                                      {props.copy.copyMessageButton}
                                    </Button>
                                    <Button
                                      type="link"
                                      size="small"
                                      className="git-page-commit-detail-action-button"
                                      onClick={() => {
                                        void copyText(historyDetail.hash)
                                          .then(() => message.success(props.copy.copiedCommitHashNotice))
                                          .catch((error) => message.error(normalizeError(error)));
                                      }}
                                    >
                                      {props.copy.copyHashButton}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              <div className="git-page-branch-detail-head">
                                <div className="git-page-branch-detail-head-row">
                                  <div className="git-page-branch-detail-title-wrap">
                                    <span className="git-page-change-section-title">{props.copy.changedFilesTitle}</span>
                                    <span className="git-page-branch-detail-count">{historyDetail.files.length}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="git-page-branch-inline-tree">
                                <HistoryDetailFileTree
                                  entries={historyDetailTreeEntries}
                                  activePath={commitReviewPath}
                                  emptyDescription={props.copy.noChangedFilesInCommit}
                                  onSelectFile={(path) => setCommitReviewPath(path)}
                                />
                              </div>
                            </div>
                            <div className="git-page-branch-detail-panel git-page-branch-inline-panel">
                              <GitDiffPreview
                                copy={props.pageCopy}
                                item={commitReviewItem}
                                loading={commitReviewLoading}
                                error={commitReviewError}
                                emptyDescription={historyDetail.files.length > 0 ? props.pageCopy.noPreviewSelected : props.copy.noChangedFilesInCommit}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Splitter.Panel>
                </Splitter>
              )}
            </div>
          </div>
        </div>
      </div>
      <Modal
        open={createModalOpen}
        title={props.copy.createBranchModalTitle(createStartPoint)}
        okText={props.copy.createBranchConfirmButton}
        cancelText={props.copy.confirmCancel}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => {
          const nextName = createBranchName.trim();
          if (!nextName) {
            return;
          }
          setCreateModalOpen(false);
          void runOperation(`branch:create:${nextName}`, () =>
            createDesktopGitBranch(props.workspaceId, {
              name: nextName,
              startPoint: createStartPoint,
              checkout: createCheckout,
            }), createCheckout ? nextName : selectedBranchName);
        }}
        okButtonProps={{ disabled: !createBranchName.trim() }}
        style={{ top: 72 }}
      >
        <div className="git-page-gitignore-editor">
          <Input
            value={createBranchName}
            onChange={(event) => setCreateBranchName(event.target.value)}
            placeholder={props.copy.branchNamePlaceholder}
          />
          <Checkbox checked={createCheckout} onChange={(event) => setCreateCheckout(event.target.checked)}>
            {props.copy.createBranchCheckoutLabel}
          </Checkbox>
        </div>
      </Modal>
      <Modal
        open={renameModalOpen}
        title={props.copy.renameBranchModalTitle(renameSourceName ?? "")}
        okText={props.copy.renameBranchConfirmButton}
        cancelText={props.copy.confirmCancel}
        onCancel={() => setRenameModalOpen(false)}
        onOk={() => {
          const nextName = renameBranchName.trim();
          const sourceName = renameSourceName?.trim();
          if (!sourceName || !nextName) {
            return;
          }
          setRenameModalOpen(false);
          void runOperation(`branch:rename:${sourceName}`, () =>
            renameDesktopGitBranch(props.workspaceId, {
              name: sourceName,
              nextName,
            }), nextName);
        }}
        okButtonProps={{ disabled: !renameBranchName.trim() }}
        style={{ top: 72 }}
      >
        <div className="git-page-gitignore-editor">
          <Input
            value={renameBranchName}
            onChange={(event) => setRenameBranchName(event.target.value)}
            placeholder={props.copy.branchNamePlaceholder}
          />
        </div>
      </Modal>
    </div>
  );
}