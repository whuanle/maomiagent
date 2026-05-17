import { ReloadOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Empty,
  Select,
  Tabs,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DesktopGitModuleSnapshotResult,
} from "../../../shared/desktop-git";
import type { LanguageCode } from "../../config/titlebar";
import {
  DESKTOP_GIT_BRIDGE_READY_EVENT,
  getDesktopGitModuleSnapshot,
  hasDesktopGitBridge,
} from "../../lib/desktop-git";
import { listDesktopWorkspaces } from "../../lib/desktop-workspace";
import { createGitBranchCopy } from "./branch-copy";
import { GitAiReviewWorkbenchNext as GitAiReviewWorkbench } from "./components/git-ai-review-workbench-next";
import { GitBranchWorkbench } from "./components/branch-workbench";
import { GitChangesWorkbench } from "./components/changes-workbench";
import {
  readGitPageUiState,
  type GitTabKey,
  writeGitPageUiState,
} from "./git-page-ui-state";
import { createGitTranslator } from "./i18n";
import "./page.css";

type Props = {
  language: LanguageCode;
  active: boolean;
};

type WorkspaceOption = {
  label: string;
  value: string;
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function buildWorkspaceOptions(items: Awaited<ReturnType<typeof listDesktopWorkspaces>>["items"]): WorkspaceOption[] {
  return items.map((item) => ({
    label: item.name ? `${item.name} (${item.workspaceId})` : item.workspaceId,
    value: item.workspaceId,
  }));
}

export function GitPage(props: Props) {
  const { message } = AntdApp.useApp();
  const copy = useMemo(() => createGitTranslator(props.language), [props.language]);
  const branchCopy = useMemo(() => createGitBranchCopy(props.language), [props.language]);
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopGitBridge());
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [restoredWorkspaceId, setRestoredWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<GitTabKey>("changes");
  const [selectedReviewFilePath, setSelectedReviewFilePath] = useState<string | undefined>(undefined);
  const [selectedReviewFindingId, setSelectedReviewFindingId] = useState<string | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<DesktopGitModuleSnapshotResult | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopGitBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_GIT_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_GIT_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  useEffect(() => {
    if (!props.active) {
      return;
    }

    const restored = readGitPageUiState();
    setRestoredWorkspaceId(restored?.workspaceId);
    setActiveTab(restored?.activeTab ?? "changes");
    setSelectedReviewFilePath(restored?.selectedReviewFilePath);
    setSelectedReviewFindingId(restored?.selectedReviewFindingId);
  }, [props.active]);

  const loadWorkspaces = useCallback(async () => {
    if (!props.active || !bridgeReady) {
      return;
    }

    try {
      const response = await listDesktopWorkspaces({ limit: 200, offset: 0 });
      const options = buildWorkspaceOptions(response.items);
      setWorkspaceOptions(options);
      setWorkspaceId((current) => {
        if (current && options.some((item) => item.value === current)) {
          return current;
        }
        if (restoredWorkspaceId && options.some((item) => item.value === restoredWorkspaceId)) {
          return restoredWorkspaceId;
        }
        return options[0]?.value;
      });
    } catch (error) {
      message.error(`${copy.loadFailed}: ${normalizeError(error)}`);
    }
  }, [bridgeReady, copy.loadFailed, message, props.active, restoredWorkspaceId]);

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
    writeGitPageUiState({
      workspaceId,
      activeTab,
      selectedReviewFilePath,
      selectedReviewFindingId,
    });
  }, [activeTab, selectedReviewFilePath, selectedReviewFindingId, workspaceId]);

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
                selectedReviewFilePath={selectedReviewFilePath}
                onSelectedReviewFilePathChange={setSelectedReviewFilePath}
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
        key: "ai-review",
        label: copy.aiReviewTab,
        children: (
          <div className="git-page-panel-shell git-page-ai-review-shell">
            <GitAiReviewWorkbench
              language={props.language}
              workspaceId={workspaceId ?? ""}
              copy={copy}
              snapshot={snapshot}
              loading={snapshotLoading}
              selectedReviewFilePath={selectedReviewFilePath}
              onSelectedReviewFilePathChange={setSelectedReviewFilePath}
              selectedReviewFindingId={selectedReviewFindingId}
              onSelectedReviewFindingIdChange={setSelectedReviewFindingId}
            />
          </div>
        ),
      },
    ];
  }, [branchCopy, copy, loadSnapshot, props.language, selectedReviewFilePath, selectedReviewFindingId, snapshot, snapshotLoading, workspaceId]);

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
      <div className="git-page-shell">
        <Tabs
          className="git-page-tabs"
          activeKey={activeTab}
          destroyOnHidden={true}
          onChange={(value) => setActiveTab(value as GitTabKey)}
          tabBarExtraContent={{
            left: <div className="git-page-tab-bar-tools">{toolbar}</div>,
          }}
          items={tabItems}
        />
      </div>
    </div>
  );
}