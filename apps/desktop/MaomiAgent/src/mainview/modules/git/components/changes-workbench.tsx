import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DownloadOutlined,
  RobotOutlined,
  TagOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Checkbox,
  Empty,
  Input,
  Splitter,
  Tabs,
  Tooltip,
} from "antd";
import { useEffect, useMemo, useState } from "react";

import type {
  DesktopGitChangeItem,
  DesktopGitChangesResult,
  DesktopGitOperationResult,
  DesktopGitReviewItem,
} from "../../../../shared/desktop-git";
import {
  commitDesktopGitChanges,
  discardDesktopGitChanges,
  fetchDesktopGitRemote,
  generateDesktopGitCommitMessage,
  getDesktopGitIgnore,
  getDesktopGitReviewDetail,
  initDesktopGitRepository,
  pullDesktopGitRemote,
  pushDesktopGitRemote,
  saveDesktopGitIgnore,
  createDesktopGitTag,
  stageDesktopGitChanges,
  unstageDesktopGitChanges,
} from "../../../lib/desktop-git";
import type { LanguageCode } from "../../../config/titlebar";
import type { GitPageCopy } from "../i18n";
import { GitChangesTree } from "./changes-tree";
import { GitDiffPreview } from "./diff-preview";
import { GitTagEditorModal } from "./git-tag-editor-modal";
import { GitIgnoreEditorModal } from "./gitignore-editor-modal";
import { buildGitSectionEntries, type GitSectionKey } from "./view-model";

type Props = {
  language: LanguageCode;
  workspaceId: string;
  copy: GitPageCopy;
  changes: DesktopGitChangesResult | null;
  loading: boolean;
  onRefresh: (silent?: boolean) => Promise<void>;
  selectedReviewFilePath?: string;
  hideInlineReview?: boolean;
  onSelectedReviewFilePathChange?: (path?: string) => void;
  onOpenReview?: (path: string) => void;
};

function formatCompactSyncActionLabel(input: {
  action: string;
  count: number;
}) {
  return input.count > 0 ? `${input.action} ${input.count}` : input.action;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function buildFallbackReviewItem(item: DesktopGitChangeItem): DesktopGitReviewItem {
  return {
    ...item,
    before: "",
    after: "",
    patch: "",
  };
}

export function GitChangesWorkbench(props: Props) {
  const { message, modal } = AntdApp.useApp();
  const [activeSection, setActiveSection] = useState<GitSectionKey>("unstaged");
  const [busyAction, setBusyAction] = useState<string | undefined>(undefined);
  const [listWorkbenchSize, setListWorkbenchSize] = useState<number | string>(760);
  const [commitMessage, setCommitMessage] = useState("");
  const [amendLatestCommit, setAmendLatestCommit] = useState(false);
  const [stageAllBeforeCommit, setStageAllBeforeCommit] = useState(false);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState<string | undefined>(undefined);
  const [previewItem, setPreviewItem] = useState<DesktopGitReviewItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [gitIgnoreOpen, setGitIgnoreOpen] = useState(false);
  const [gitIgnoreLoading, setGitIgnoreLoading] = useState(false);
  const [gitIgnoreSaving, setGitIgnoreSaving] = useState(false);
  const [gitIgnoreContent, setGitIgnoreContent] = useState("");
  const [messageGenerating, setMessageGenerating] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagMessageSeed, setTagMessageSeed] = useState("");

  const stagedEntries = useMemo(
    () => buildGitSectionEntries(props.changes?.items ?? [], "staged"),
    [props.changes?.items],
  );
  const unstagedEntries = useMemo(
    () => buildGitSectionEntries(props.changes?.items ?? [], "unstaged"),
    [props.changes?.items],
  );

  const allEntries = useMemo(() => [...unstagedEntries, ...stagedEntries], [stagedEntries, unstagedEntries]);
  const prefersChineseUi = props.language.toLowerCase().startsWith("zh");
  const hasChanges = allEntries.length > 0;
  const publishMode = Boolean(props.changes && !props.changes.detached && !props.changes.upstream);
  const canPush = Boolean(
    props.changes?.isGitRepo
    && !props.changes.detached
    && props.changes.branch
    && (props.changes.summary.conflict ?? 0) === 0,
  );
  const canPull = Boolean(
    props.changes?.isGitRepo
    && !props.changes.detached
    && props.changes.upstream
    && (props.changes.summary.conflict ?? 0) === 0,
  );
  const canCommit = Boolean(
    commitMessage.trim().length > 0
    && hasChanges
    && (stageAllBeforeCommit || stagedEntries.length > 0),
  );
  const canCreateTag = Boolean(props.changes?.isGitRepo && props.changes.lastCommitHash);
  const compactFetchLabel = prefersChineseUi ? "抓取" : "Fetch";
  const compactPullLabel = formatCompactSyncActionLabel({
    action: prefersChineseUi ? "拉取" : "Pull",
    count: props.changes?.behind ?? 0,
  });
  const compactPushLabel = formatCompactSyncActionLabel({
    action: prefersChineseUi
      ? (publishMode ? "发布" : "推送")
      : (publishMode ? "Publish" : "Push"),
    count: props.changes?.ahead ?? 0,
  });
  const commitActionLabel = amendLatestCommit
    ? stageAllBeforeCommit
      ? props.copy.commitActionStageAndAmend
      : props.copy.commitActionAmend
    : stageAllBeforeCommit
      ? props.copy.commitActionAll
      : props.copy.commitActionCommit;

  useEffect(() => {
    if (props.selectedReviewFilePath === undefined || props.selectedReviewFilePath === selectedPreviewPath) {
      return;
    }

    setSelectedPreviewPath(props.selectedReviewFilePath);
  }, [props.selectedReviewFilePath, selectedPreviewPath]);

  useEffect(() => {
    if (unstagedEntries.length > 0) {
      setActiveSection((current) => current === "staged" && stagedEntries.length === 0 ? "unstaged" : current);
      return;
    }

    if (stagedEntries.length > 0) {
      setActiveSection("staged");
    }
  }, [stagedEntries.length, unstagedEntries.length]);

  useEffect(() => {
    const allPaths = new Set(allEntries.map((item) => item.path));
    if (selectedPreviewPath && allPaths.has(selectedPreviewPath)) {
      return;
    }

    const nextPath = unstagedEntries[0]?.path ?? stagedEntries[0]?.path;
    if (nextPath === selectedPreviewPath) {
      return;
    }

    setSelectedPreviewPath(nextPath);
    props.onSelectedReviewFilePathChange?.(nextPath);
  }, [allEntries, selectedPreviewPath, stagedEntries, unstagedEntries]);

  useEffect(() => {
    if (props.hideInlineReview) {
      setPreviewItem(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    if (!props.changes?.isGitRepo || !selectedPreviewPath) {
      const fallbackItem = allEntries.find((item) => item.path === selectedPreviewPath)?.item;
      setPreviewItem(fallbackItem ? buildFallbackReviewItem(fallbackItem) : null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    void getDesktopGitReviewDetail(props.workspaceId, {
      path: selectedPreviewPath,
      scope: "changed",
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        const fallbackItem = allEntries.find((item) => item.path === selectedPreviewPath)?.item;
        setPreviewItem(result.item ?? (fallbackItem ? buildFallbackReviewItem(fallbackItem) : null));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const fallbackItem = allEntries.find((item) => item.path === selectedPreviewPath)?.item;
        setPreviewItem(fallbackItem ? buildFallbackReviewItem(fallbackItem) : null);
        setPreviewError(`${props.copy.previewLoadFailed}: ${normalizeError(error)}`);
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    allEntries,
    props.changes?.isGitRepo,
    props.copy.previewLoadFailed,
    props.hideInlineReview,
    props.workspaceId,
    selectedPreviewPath,
  ]);

  function updateSelectedPreviewPath(nextPath: string | undefined) {
    if (nextPath === selectedPreviewPath) {
      return;
    }

    setSelectedPreviewPath(nextPath);
    props.onSelectedReviewFilePathChange?.(nextPath);
  }

  async function runMutation(actionKey: string, operation: () => Promise<DesktopGitOperationResult>) {
    setBusyAction(actionKey);
    try {
      const result = await operation();
      message.success(result.message);
      await props.onRefresh(true);
    } catch (error) {
      message.error(normalizeError(error));
    } finally {
      setBusyAction(undefined);
    }
  }

  async function openGitIgnore() {
    setGitIgnoreOpen(true);
    setGitIgnoreLoading(true);
    try {
      const result = await getDesktopGitIgnore(props.workspaceId);
      setGitIgnoreContent(result.content);
    } catch (error) {
      message.error(`${props.copy.loadFailed}: ${normalizeError(error)}`);
    } finally {
      setGitIgnoreLoading(false);
    }
  }

  async function saveGitIgnore(nextContent: string) {
    setGitIgnoreSaving(true);
    try {
      const result = await saveDesktopGitIgnore(props.workspaceId, { content: nextContent });
      setGitIgnoreContent(nextContent);
      setGitIgnoreOpen(false);
      message.success(result.message || props.copy.gitIgnoreSavedNotice);
    } catch (error) {
      message.error(`${props.copy.saveFailed}: ${normalizeError(error)}`);
    } finally {
      setGitIgnoreSaving(false);
    }
  }

  async function generateCommitMessage() {
    setMessageGenerating(true);
    try {
      const result = await generateDesktopGitCommitMessage(props.workspaceId, { scope: "changed" });
      const nextMessage = result.suggestions[0] || result.summary;
      setCommitMessage(nextMessage);
      if (nextMessage) {
        message.success(props.copy.commitMessageGeneratedNotice);
      }
    } catch (error) {
      message.error(normalizeError(error));
    } finally {
      setMessageGenerating(false);
    }
  }

  function openCreateTagModal() {
    setTagMessageSeed(commitMessage.trim() || props.changes?.lastCommitSubject || "");
    setTagModalOpen(true);
  }

  function confirmDiscard(paths?: string[]) {
    const title = paths && paths.length === 1
      ? props.copy.discardChangesTitle(paths[0] ?? "")
      : props.copy.discardAllChangesTitle;

    modal.confirm({
      title,
      content: props.copy.discardChangesDescription,
      okText: props.copy.confirmDiscard,
      cancelText: props.copy.confirmCancel,
      okButtonProps: { danger: true },
      onOk: async () => {
        await runMutation(paths?.[0] ? `discard:${paths[0]}` : "discard:all", () =>
          discardDesktopGitChanges(props.workspaceId, paths?.length ? { paths } : { all: true }));
      },
    });
  }

  function handleWorkbenchResize(sizes: Array<number | string>) {
    const nextSize = sizes[0];
    if (typeof nextSize === "number" && Number.isFinite(nextSize)) {
      setListWorkbenchSize(nextSize);
      return;
    }

    if (typeof nextSize === "string" && nextSize.trim().length > 0) {
      setListWorkbenchSize(nextSize);
    }
  }

  const activeEntries = activeSection === "staged" ? stagedEntries : unstagedEntries;
  const activeTabActions = activeSection === "staged"
    ? (
      <Button
        size="small"
        type="text"
        disabled={Boolean(busyAction) || activeEntries.length === 0}
        onClick={() => void runMutation("unstage:all", () => unstageDesktopGitChanges(props.workspaceId, { all: true }))}
      >
        {props.copy.unstageAllAction}
      </Button>
    )
    : (
      <>
        <Button
          size="small"
          type="text"
          disabled={Boolean(busyAction) || activeEntries.length === 0}
          onClick={() => void runMutation("stage:all", () => stageDesktopGitChanges(props.workspaceId, { all: true }))}
        >
          {props.copy.stageAllAction}
        </Button>
        <Button
          size="small"
          type="text"
          danger
          disabled={Boolean(busyAction) || activeEntries.length === 0}
          onClick={() => confirmDiscard()}
        >
          {props.copy.discardAllAction}
        </Button>
      </>
    );

  function renderChangeTabPane(kind: GitSectionKey) {
    const entries = kind === "staged" ? stagedEntries : unstagedEntries;

    return (
      <div className="git-page-change-section">
        <div className="git-page-change-section-body">
          <GitChangesTree
            copy={props.copy}
            entries={entries}
            sectionKey={kind}
            activePath={selectedPreviewPath}
            busyAction={busyAction}
            emptyDescription={props.copy.emptyChanges}
            onSelectFile={(path) => {
              setActiveSection(kind);
              updateSelectedPreviewPath(path);
              if (props.hideInlineReview) {
                props.onOpenReview?.(path);
              }
            }}
            onRunPrimary={(path) => {
              void runMutation(
                kind === "staged" ? `unstage:${path}` : `stage:${path}`,
                () => kind === "staged"
                  ? unstageDesktopGitChanges(props.workspaceId, { paths: [path] })
                  : stageDesktopGitChanges(props.workspaceId, { paths: [path] }),
              );
            }}
            onRunSecondary={kind === "unstaged" ? (path) => confirmDiscard([path]) : undefined}
          />
        </div>
      </div>
    );
  }

  const mainWorkbenchPane = (
    <div className="git-page-changes-pane">
      <div className="git-page-changes-main-workbench">
        <div className="git-page-changes-commit">
          <Input.TextArea
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 7 }}
            className="git-page-changes-commit-input"
            placeholder={props.copy.commitMessagePlaceholder}
          />
          <div className="git-page-changes-commit-footer">
            <div className="git-page-changes-commit-options">
              <Checkbox
                checked={stageAllBeforeCommit}
                onChange={(event) => setStageAllBeforeCommit(event.target.checked)}
              >
                {props.copy.stageAllBeforeCommit}
              </Checkbox>
              <Checkbox
                checked={amendLatestCommit}
                onChange={(event) => setAmendLatestCommit(event.target.checked)}
              >
                {props.copy.amendLatestCommit}
              </Checkbox>
            </div>
            <div className="git-page-changes-commit-footer-bar">
              <div className="git-page-changes-commit-remote-actions">
                <Tooltip title={props.copy.fetchRemoteTitle}>
                  <Button
                    size="small"
                    type="text"
                    icon={<DownloadOutlined />}
                    disabled={Boolean(busyAction) || !props.changes?.isGitRepo}
                    loading={busyAction === "fetch"}
                    onClick={() => void runMutation("fetch", () => fetchDesktopGitRemote(props.workspaceId))}
                  >
                    {compactFetchLabel}
                  </Button>
                </Tooltip>
                <Tooltip title={props.copy.pullNowButton}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={Boolean(busyAction) || !canPull}
                    loading={busyAction === "pull"}
                    onClick={() => void runMutation("pull", () => pullDesktopGitRemote(props.workspaceId))}
                  >
                    {compactPullLabel}
                  </Button>
                </Tooltip>
                <Tooltip title={props.changes?.upstream ? props.copy.pushNowButton : props.copy.publishBranchButton}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={Boolean(busyAction) || !canPush}
                    loading={busyAction === "push"}
                    onClick={() => void runMutation("push", () => pushDesktopGitRemote(props.workspaceId))}
                  >
                    {compactPushLabel}
                  </Button>
                </Tooltip>
                <Tooltip title={props.copy.createTagModalTitle}>
                  <Button
                    size="small"
                    type="text"
                    icon={<TagOutlined />}
                    disabled={Boolean(busyAction) || !canCreateTag}
                    loading={busyAction === "tag"}
                    onClick={() => openCreateTagModal()}
                  >
                    {props.copy.createTagButton}
                  </Button>
                </Tooltip>
              </div>
              <div className="git-page-changes-commit-footer-actions">
                <Button disabled={Boolean(busyAction)} onClick={() => void openGitIgnore()}>
                  {props.copy.gitIgnoreButton}
                </Button>
                <Button
                  icon={<RobotOutlined />}
                  disabled={Boolean(busyAction)}
                  loading={messageGenerating}
                  onClick={() => void generateCommitMessage()}
                >
                  {props.copy.generateCommitMessageButton}
                </Button>
                <Button
                  type="primary"
                  disabled={Boolean(busyAction) || !canCommit}
                  loading={busyAction === "commit"}
                  onClick={() => void runMutation("commit", async () => {
                    const result = await commitDesktopGitChanges(props.workspaceId, {
                      message: commitMessage.trim(),
                      amend: amendLatestCommit,
                      stageAll: stageAllBeforeCommit,
                    });
                    setCommitMessage("");
                    return result;
                  })}
                >
                  {commitActionLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <Tabs
          className="git-page-changes-list-tabs"
          activeKey={activeSection}
          onChange={(value) => setActiveSection(value as GitSectionKey)}
          tabBarExtraContent={<div className="git-page-change-section-actions">{activeTabActions}</div>}
          items={[
            {
              key: "unstaged",
              label: (
                <span className="git-page-change-tab-label">
                  <span className="git-page-change-tab-title">{props.copy.unstagedSectionTitle}</span>
                  <span className="git-page-change-tab-count">{unstagedEntries.length}</span>
                </span>
              ),
              children: renderChangeTabPane("unstaged"),
            },
            {
              key: "staged",
              label: (
                <span className="git-page-change-tab-label">
                  <span className="git-page-change-tab-title">{props.copy.stagedSectionTitle}</span>
                  <span className="git-page-change-tab-count">{stagedEntries.length}</span>
                </span>
              ),
              children: renderChangeTabPane("staged"),
            },
          ]}
        />
      </div>
    </div>
  );

  if (!props.changes?.isGitRepo && !props.loading) {
    return (
      <div className="git-page-changes-empty">
        <div className="git-page-changes-empty-stack">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.copy.emptyNotGitRepo} />
          <Button
            type="primary"
            loading={busyAction === "init"}
            onClick={() => void runMutation("init", () => initDesktopGitRepository(props.workspaceId))}
          >
            {props.copy.initializeRepositoryButton}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {props.hideInlineReview ? (
        <div className="git-page-changes-workbench is-review-hidden">
          {mainWorkbenchPane}
        </div>
      ) : (
        <Splitter className="git-page-changes-workbench" onResize={handleWorkbenchResize}>
          <Splitter.Panel
            className="git-page-changes-splitter-panel"
            size={listWorkbenchSize}
            min={460}
            max={920}
          >
            {mainWorkbenchPane}
          </Splitter.Panel>
          <Splitter.Panel className="git-page-changes-splitter-panel" min={420}>
            <div className="git-page-changes-preview-pane">
              <GitDiffPreview
                copy={props.copy}
                item={previewItem}
                loading={previewLoading}
                error={previewError}
                emptyDescription={props.copy.noPreviewSelected}
              />
            </div>
          </Splitter.Panel>
        </Splitter>
      )}
      <GitIgnoreEditorModal
        copy={props.copy}
        open={gitIgnoreOpen}
        value={gitIgnoreContent}
        loading={gitIgnoreLoading}
        saving={gitIgnoreSaving}
        onCancel={() => setGitIgnoreOpen(false)}
        onSave={(value) => {
          void saveGitIgnore(value);
        }}
      />
      <GitTagEditorModal
        copy={props.copy}
        open={tagModalOpen}
        initialMessage={tagMessageSeed}
        initialPush={true}
        saving={busyAction === "tag"}
        onCancel={() => setTagModalOpen(false)}
        onSubmit={(draft) => {
          void runMutation("tag", async () => {
            const result = await createDesktopGitTag(props.workspaceId, {
              name: draft.name.trim(),
              message: draft.message.trim(),
              push: draft.push,
            });
            setTagModalOpen(false);
            return result;
          });
        }}
      />
    </>
  );
}
