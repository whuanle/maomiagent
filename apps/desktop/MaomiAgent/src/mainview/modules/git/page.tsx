import { ReloadOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Empty,
  Modal,
  Select,
  Tabs,
} from "antd";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  DesktopGitModuleSnapshotResult,
} from "../../../shared/desktop-git";
import type { LanguageCode } from "../../config/titlebar";
import {
  DESKTOP_GIT_BRIDGE_READY_EVENT,
  getDesktopGitModuleSnapshot,
  hasDesktopGitBridge,
} from "../../lib/desktop-git";
import {
  getNormalWorkspaces,
  toWorkspaceOptions,
  type WorkspaceSelectOption,
} from "../../services/workspace-query-service";
import { createGitBranchCopy } from "./branch-copy";
import { GitBranchWorkbench } from "./components/branch-workbench";
import { GitChangesWorkbench } from "./components/changes-workbench";
import { GitCommitReviewWorkbench } from "./components/git-commit-review-workbench";
import { hasGitReviewWorkbenchCachedResults } from "./components/git-ai-review-workbench-next";
import {
  readGitPageUiState,
  type GitCommitReviewUiState,
  type GitTabKey,
  writeGitPageUiState,
} from "./git-page-ui-state";
import { createGitTranslator } from "./i18n";
import "./page.css";

type Props = {
  language: LanguageCode;
  active: boolean;
};

export type GitPageHandle = {
  confirmLeavePage: () => Promise<boolean>;
};

type RenderedGitTabKey = "changes" | "branches" | "commit-review";

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function resolveWorkspaceId(
  options: WorkspaceSelectOption[],
  currentWorkspaceId: string | undefined,
  restoredWorkspaceId: string | undefined,
): string | undefined {
  if (currentWorkspaceId && options.some((item) => item.value === currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  if (restoredWorkspaceId && options.some((item) => item.value === restoredWorkspaceId)) {
    return restoredWorkspaceId;
  }

  return options[0]?.value;
}

function normalizeRenderedGitTab(value: GitTabKey | undefined): RenderedGitTabKey {
  return value === "branches" || value === "commit-review"
    ? value
    : "changes";
}

export const GitPage = forwardRef<GitPageHandle, Props>(function GitPage(props, ref) {
  const { message } = AntdApp.useApp();
  const [modal, modalContextHolder] = Modal.useModal();
  const copy = useMemo(() => createGitTranslator(props.language), [props.language]);
  const branchCopy = useMemo(() => createGitBranchCopy(props.language), [props.language]);
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopGitBridge());
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceSelectOption[]>([]);
  const [workspaceRestoreReady, setWorkspaceRestoreReady] = useState(false);
  const [workspaceOptionsLoaded, setWorkspaceOptionsLoaded] = useState(false);
  const [restoredWorkspaceId, setRestoredWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<GitTabKey>("changes");
  const [commitReviewState, setCommitReviewState] = useState<GitCommitReviewUiState | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<DesktopGitModuleSnapshotResult | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const workspaceLoadCycleRef = useRef(0);
  const workspaceLoadRequestRef = useRef(0);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopGitBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_GIT_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_GIT_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  useEffect(() => {
    workspaceLoadCycleRef.current += 1;
    workspaceLoadRequestRef.current += 1;

    if (!props.active) {
      setWorkspaceId(undefined);
      setWorkspaceRestoreReady(false);
      setWorkspaceOptionsLoaded(false);
      return;
    }

    setWorkspaceId(undefined);
    setWorkspaceOptionsLoaded(false);
    const restored = readGitPageUiState();
    setRestoredWorkspaceId(restored?.workspaceId);
    setActiveTab(normalizeRenderedGitTab(restored?.activeTab));
    setCommitReviewState(restored?.commitReview);
    setWorkspaceRestoreReady(true);
  }, [props.active]);

  const loadWorkspaces = useCallback(async () => {
    if (!props.active || !bridgeReady || !workspaceRestoreReady) {
      return;
    }

    const loadCycle = workspaceLoadCycleRef.current;
    const requestId = ++workspaceLoadRequestRef.current;

    try {
      const options = toWorkspaceOptions(await getNormalWorkspaces({ limit: 200, offset: 0 }));

      if (workspaceLoadCycleRef.current !== loadCycle || workspaceLoadRequestRef.current !== requestId) {
        return;
      }

      setWorkspaceOptions(options);
      setWorkspaceId((current) => resolveWorkspaceId(options, current, restoredWorkspaceId));
      setWorkspaceOptionsLoaded(true);
    } catch (error) {
      if (workspaceLoadCycleRef.current !== loadCycle || workspaceLoadRequestRef.current !== requestId) {
        return;
      }

      message.error(`${copy.loadFailed}: ${normalizeError(error)}`);
    }
  }, [bridgeReady, copy.loadFailed, message, props.active, restoredWorkspaceId, workspaceRestoreReady]);

  const loadSnapshot = useCallback(async (silent = false) => {
    if (!props.active || !bridgeReady || !workspaceId) {
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setSnapshotLoading(true);
    }

    try {
      setSnapshot(await getDesktopGitModuleSnapshot(workspaceId, { historyLimit: 50 }));
    } catch (error) {
      message.error(`${copy.loadFailed}: ${normalizeError(error)}`);
    } finally {
      setSnapshotLoading(false);
      setRefreshing(false);
    }
  }, [bridgeReady, copy.loadFailed, message, props.active, workspaceId]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!workspaceId) {
      setSnapshot(null);
      return;
    }
    void loadSnapshot(false);
  }, [loadSnapshot, workspaceId]);

  useEffect(() => {
    const canPersistWorkspace = workspaceRestoreReady
      && workspaceOptionsLoaded
      && (workspaceOptions.length === 0 || Boolean(workspaceId));

    if (!canPersistWorkspace) {
      return;
    }

    writeGitPageUiState({
      workspaceId,
      activeTab,
      commitReview: commitReviewState,
    });
  }, [activeTab, commitReviewState, workspaceId, workspaceOptions.length, workspaceOptionsLoaded, workspaceRestoreReady]);

  useImperativeHandle(ref, () => ({
    async confirmLeavePage() {
      if (!workspaceId || !hasGitReviewWorkbenchCachedResults(workspaceId)) {
        return true;
      }

      return modal.confirm({
        title: props.language === "en-US" ? "Leave Git page?" : "确认离开 Git 页面？",
        content: props.language === "en-US"
          ? "Current review results are cached. Leave this page?"
          : "当前审查结果会保留在缓存中，确定离开这个页面吗？",
        okText: props.language === "en-US" ? "Leave" : "离开",
        cancelText: props.language === "en-US" ? "Stay" : "留在此页",
        okButtonProps: { danger: true },
      });
    },
  }), [modal, props.language, workspaceId]);

  const toolbar = useMemo(() => {
    return (
      <div className="git-page-toolbar">
        <Select
          value={workspaceId}
          options={workspaceOptions}
          placeholder={copy.workspacePlaceholder}
          onChange={setWorkspaceId}
        />
        <Button
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={() => {
            void loadWorkspaces();
            void loadSnapshot(true);
          }}
        >
          {copy.refresh}
        </Button>
      </div>
    );
  }, [copy.refresh, copy.workspacePlaceholder, loadSnapshot, loadWorkspaces, refreshing, workspaceId, workspaceOptions]);

  const tabItems = useMemo(() => {
    return [
      {
        key: "changes",
        label: copy.changesTab,
        children: (
          <div className="git-page-panel-shell">
            <div className="git-page-changes-shell">
              <GitChangesWorkbench
                language={props.language}
                workspaceId={workspaceId ?? ""}
                copy={copy}
                changes={snapshot?.changes ?? null}
                loading={snapshotLoading}
                onRefresh={loadSnapshot}
                selectedReviewFilePath={commitReviewState?.selectedFilePath}
                onSelectedReviewFilePathChange={(selectedFilePath) => {
                  setCommitReviewState((current) => ({
                    ...current,
                    selectedFilePath,
                  }));
                }}
              />
            </div>
          </div>
        ),
      },
      {
        key: "branches",
        label: copy.branchesTab,
        children: (
          <div className="git-page-panel-shell">
            <GitBranchWorkbench
              workspaceId={workspaceId ?? ""}
              pageCopy={copy}
              copy={branchCopy}
              snapshot={snapshot}
              loading={snapshotLoading}
              onRefresh={loadSnapshot}
            />
          </div>
        ),
      },
      {
        key: "commit-review",
        label: copy.commitReviewTab,
        children: (
          <div className="git-page-panel-shell git-page-ai-review-shell">
            <GitCommitReviewWorkbench
              language={props.language}
              workspaceId={workspaceId ?? ""}
              copy={copy}
              snapshot={snapshot}
              loading={snapshotLoading}
              initialCommitTargetType={commitReviewState?.targetType}
              initialCommitTargetId={commitReviewState?.selectedTargetId}
              onCommitTargetTypeChange={(targetType) => {
                setCommitReviewState((current) => ({
                  ...current,
                  targetType,
                }));
              }}
              onCommitTargetIdChange={(selectedTargetId) => {
                setCommitReviewState((current) => ({
                  ...current,
                  selectedTargetId,
                }));
              }}
              selectedReviewFilePath={commitReviewState?.selectedFilePath}
              onSelectedReviewFilePathChange={(selectedFilePath) => {
                setCommitReviewState((current) => ({
                  ...current,
                  selectedFilePath,
                }));
              }}
              selectedReviewFindingId={commitReviewState?.selectedFindingId}
              onSelectedReviewFindingIdChange={(selectedFindingId) => {
                setCommitReviewState((current) => ({
                  ...current,
                  selectedFindingId,
                }));
              }}
            />
          </div>
        ),
      },
    ];
  }, [branchCopy, commitReviewState?.selectedFilePath, commitReviewState?.selectedFindingId, commitReviewState?.selectedTargetId, commitReviewState?.targetType, copy, loadSnapshot, props.language, snapshot, snapshotLoading, workspaceId]);

  if (!bridgeReady) {
    return (
      <div className="git-page git-page-empty">
        <Empty description={copy.emptyNoBridge} />
      </div>
    );
  }

  if (workspaceOptions.length === 0) {
    return (
      <div className="git-page git-page-empty">
        <Empty description={copy.emptyNoWorkspace} />
      </div>
    );
  }

  return (
    <div className="git-page">
      {modalContextHolder}
      <div className="git-page-shell">
        <Tabs
          className="git-page-tabs"
          activeKey={activeTab}
          destroyOnHidden={false}
          onChange={(value) => setActiveTab(value as GitTabKey)}
          tabBarExtraContent={{
            left: <div className="git-page-tab-bar-tools">{toolbar}</div>,
          }}
          items={tabItems}
        />
      </div>
    </div>
  );
});
