import { ClearOutlined, CloseCircleOutlined, CloseOutlined, LoadingOutlined, MinusOutlined } from "@ant-design/icons";
import { Button, Empty, Splitter, Tabs } from "antd";
import type { ReactNode } from "react";

import { ChatBrowserPanel } from "../../browser/components/chat-browser-panel";
import { ChatDockIcon } from "./ChatDockIcon";
import { ConversationGitTab } from "./conversation-git-tab";
import { ConversationWorkspaceSettingsPanel } from "./conversation-workspace-settings-panel";
import { UnifiedPreviewPanel } from "./preview/unified-preview-panel";
import { resolveWorkspaceInspectorCopy } from "./workspace-inspector-copy";
import { useWorkspaceInspectorChanges } from "./use-workspace-inspector-changes";
import { WorkspaceInspectorChanges } from "./workspace-inspector-changes";
import { useWorkspaceInspectorFileTree } from "./use-workspace-inspector-file-tree";
import { WorkspaceInspectorFiles } from "./workspace-inspector-files";
import type {
  ChatAttachedTabState,
  ChatOpenWorkspaceFilePreviewInput,
  ChatSelectedSessionView,
  ChatWorkbenchPanelKey,
} from "../types";
import type { LanguageCode } from "../../../config/titlebar";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";

const CHAT_MODULE_MAIN_PANEL_MIN_WIDTH = 140;
const CHAT_MODULE_SECONDARY_PANEL_MIN_WIDTH = 220;
const CHAT_MODULE_SECONDARY_PANEL_DEFAULT_SIZE = "58%";

type Props = {
  active: boolean;
  language: LanguageCode;
  workspaceId?: string;
  selectedWorkspace?: DesktopWorkspaceItem;
  selectedSession?: ChatSelectedSessionView;
  activeBuiltinKey: ChatWorkbenchPanelKey;
  activeAttachedKey?: string;
  mainPanelVisible: boolean;
  secondaryPanelVisible: boolean;
  extraTabs?: ChatAttachedTabState[];
  onSelectBuiltin: (key: string) => void;
  onSelectAttached: (key: string) => void;
  onCloseMainPanel: () => void;
  onCloseSecondaryPanel: () => void;
  onCloseAttachedTab: (key: string) => void;
  onCloseAllAttachedTabs: () => void;
  onOpenWorkspaceFilePreview: (input: ChatOpenWorkspaceFilePreviewInput) => void;
};

function buildTabLabel(input: {
  tabKey: string;
  label: string;
  iconKey?: ChatWorkbenchPanelKey;
  count?: number;
  loading?: boolean;
  closable?: boolean;
  onClose?: (key: string) => void;
  onPrefetch?: () => void;
}) {
  return (
    <div
      className="chat-module-panel-tab-label"
      title={input.label}
      onPointerDown={() => input.onPrefetch?.()}
    >
      {input.iconKey ? (
        <span className="chat-module-panel-tab-icon">
          <ChatDockIcon dockKey={input.iconKey} />
        </span>
      ) : null}
      <span className="chat-module-panel-tab-text">{input.label}</span>
      {input.loading ? (
        <span className="chat-module-panel-tab-loading" aria-hidden="true">
          <LoadingOutlined spin />
        </span>
      ) : null}
      {typeof input.count === "number" ? (
        <span className="chat-module-panel-tab-count">{input.count}</span>
      ) : null}
      {input.closable && input.onClose ? (
        <button
          type="button"
          className="chat-module-panel-tab-close"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            input.onClose?.(input.tabKey);
          }}
          aria-label={`close-${input.label}`}
          title={input.label}
        >
          <CloseOutlined />
        </button>
      ) : null}
    </div>
  );
}

function buildPanelToolbarAction(input: {
  key: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      key={input.key}
      type="text"
      size="small"
      className="chat-module-panel-toolbar-button"
      icon={input.icon}
      title={input.title}
      aria-label={input.title}
      onClick={input.onClick}
    />
  );
}

function PlaceholderPane(props: {
  description: string;
}) {
  return (
    <div className="chat-module-panel-empty">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={props.description}
      />
    </div>
  );
}

function resolveAttachedTabLabel(item: ChatAttachedTabState) {
  if (item.source.kind === "workspace-file") {
    const normalizedPath = item.source.path.trim().replaceAll("\\", "/");
    return normalizedPath.split("/").filter(Boolean).pop() || normalizedPath || item.title;
  }

  return item.title;
}

export function ConversationModulePanel(props: Props) {
  const inspectorPanelsVisible = props.mainPanelVisible && (
    props.activeBuiltinKey === "files"
    || props.activeBuiltinKey === "changes"
    || props.activeBuiltinKey === "git"
  );
  const copy = resolveWorkspaceInspectorCopy(props.language);
  const inspector = useWorkspaceInspectorFileTree({
    active: props.active && inspectorPanelsVisible,
    workspaceId: props.workspaceId,
  });
  const changesInspector = useWorkspaceInspectorChanges({
    active: props.active && inspectorPanelsVisible,
    workspaceId: props.workspaceId,
  });

  const prefetchBuiltinPanel = (panelKey: ChatWorkbenchPanelKey) => {
    if (!props.workspaceId) {
      return;
    }

    if (panelKey === "files") {
      void inspector.refreshLoadedDirectories();
      void changesInspector.refreshChanges();
      return;
    }

    if (panelKey === "changes" || panelKey === "git") {
      void inspector.refreshLoadedDirectories();
      void changesInspector.refreshChanges();
    }
  };

  const builtinItems = [
    {
      key: "browser",
      label: buildTabLabel({
        tabKey: "browser",
        label: props.language === "en-US" ? "Browser" : "浏览器",
        iconKey: "browser",
      }),
      children: (
        <ChatBrowserPanel
          active={props.active && props.activeBuiltinKey === "browser"}
          language={props.language}
        />
      ),
    },
    {
      key: "settings",
      label: buildTabLabel({
        tabKey: "settings",
        label: props.language === "en-US" ? "Settings" : "设置",
        iconKey: "settings",
      }),
      children: (
        <ConversationWorkspaceSettingsPanel
          language={props.language}
          selectedWorkspace={props.selectedWorkspace}
          selectedSession={props.selectedSession}
        />
      ),
    },
    {
      key: "files",
      label: buildTabLabel({
        tabKey: "files",
        label: props.language === "en-US" ? "Files" : "文件",
        iconKey: "files",
        loading: inspector.nodesByDir[""] === undefined && inspector.loadingByPath[""] === true,
        onPrefetch: () => prefetchBuiltinPanel("files"),
      }),
      children: props.workspaceId ? (
        <WorkspaceInspectorFiles
          language={props.language}
          workspaceId={props.workspaceId}
          copy={copy}
          nodesByDir={inspector.nodesByDir}
          expandedByPath={inspector.expandedByPath}
          loadingByPath={inspector.loadingByPath}
          error={inspector.fileTreeError}
          selectedFilePath={inspector.selectedFilePath}
          changeStatusMap={changesInspector.changeStatusMap}
          changedPaths={changesInspector.changedPaths}
          isGitRepo={changesInspector.changes?.isGitRepo}
          onToggleDirectory={inspector.toggleFilesDirectory}
          onSelectFile={inspector.selectFile}
          onOpenFilePreview={(path) => props.onOpenWorkspaceFilePreview({
            workspaceId: props.workspaceId!,
            path,
          })}
          onRefreshGitState={changesInspector.refreshChanges}
        />
      ) : (
        <PlaceholderPane description={props.language === "en-US" ? "Select a workspace first." : "请先选择工作区。"} />
      ),
    },
    {
      key: "changes",
      label: buildTabLabel({
        tabKey: "changes",
        label: props.language === "en-US" ? "Changes" : "代码改动",
        iconKey: "changes",
        count: changesInspector.changes?.summary.files ?? changesInspector.changes?.items.length ?? 0,
        loading: changesInspector.changesLoading,
        onPrefetch: () => prefetchBuiltinPanel("changes"),
      }),
      children: props.workspaceId ? (
        <WorkspaceInspectorChanges
          language={props.language}
          workspaceId={props.workspaceId}
          copy={copy}
          changes={changesInspector.changes}
          nodesByDir={inspector.nodesByDir}
          expandedByPath={inspector.changesExpandedByPath}
          loadingByPath={inspector.loadingByPath}
          loading={changesInspector.changesLoading}
          error={changesInspector.changesError ?? inspector.fileTreeError}
          selectedFilePath={inspector.selectedFilePath}
          changeStatusMap={changesInspector.changeStatusMap}
          isGitRepo={changesInspector.changes?.isGitRepo}
          onToggleDirectory={inspector.toggleChangesDirectory}
          onSelectFile={inspector.selectFile}
          onOpenFilePreview={(path) => props.onOpenWorkspaceFilePreview({
            workspaceId: props.workspaceId!,
            path,
          })}
          onRefreshGitState={changesInspector.refreshChanges}
        />
      ) : (
        <PlaceholderPane description={props.language === "en-US" ? "Select a workspace first." : "请先选择工作区。"} />
      ),
    },
    {
      key: "git",
      label: buildTabLabel({
        tabKey: "git",
        label: props.language === "en-US" ? "Git" : "Git",
        iconKey: "git",
        count: changesInspector.changes?.summary.files ?? changesInspector.changes?.items.length ?? 0,
        loading: changesInspector.changesLoading,
        onPrefetch: () => prefetchBuiltinPanel("git"),
      }),
      children: (
        <ConversationGitTab
          active={props.active && props.activeBuiltinKey === "git"}
          language={props.language}
          workspaceId={props.workspaceId}
          changes={changesInspector.changes}
          loading={changesInspector.changesLoading}
          activeFilePath={inspector.selectedFilePath}
          onSelectFile={inspector.selectFile}
          onRefresh={changesInspector.refreshChanges}
        />
      ),
    },
  ];

  const attachedItems = (props.extraTabs ?? []).map((item) => ({
    key: item.key,
    label: buildTabLabel({
      tabKey: item.key,
      label: resolveAttachedTabLabel(item),
      closable: true,
      onClose: props.onCloseAttachedTab,
    }),
    children: (
      <div className={[
        "chat-module-attached-pane",
        item.source.kind === "workspace-file"
          ? "is-workspace-file-preview"
          : item.source.kind === "feishu-doc"
            ? "is-feishu-doc-preview"
            : "is-code-preview",
      ].join(" ")}>
        <UnifiedPreviewPanel language={props.language} preview={item} />
      </div>
    ),
  }));

  const effectiveSecondaryVisible = props.secondaryPanelVisible && attachedItems.length > 0;
  const effectiveBuiltinKey = builtinItems.some((item) => item.key === props.activeBuiltinKey)
    ? props.activeBuiltinKey
    : "files";
  const effectiveAttachedKey = attachedItems.find((item) => item.key === props.activeAttachedKey)?.key
    ?? attachedItems[0]?.key;
  const secondaryToolbarActions = effectiveAttachedKey ? [
    buildPanelToolbarAction({
      key: "close-current-preview",
      title: props.language === "en-US" ? "Close current preview" : "关闭当前预览",
      icon: <CloseCircleOutlined />,
      onClick: () => props.onCloseAttachedTab(effectiveAttachedKey),
    }),
    ...(attachedItems.length > 1 ? [
      buildPanelToolbarAction({
        key: "close-all-previews",
        title: props.language === "en-US" ? "Close all previews" : "关闭全部预览",
        icon: <ClearOutlined />,
        onClick: props.onCloseAllAttachedTabs,
      }),
    ] : []),
    buildPanelToolbarAction({
      key: "collapse-preview-pane",
      title: props.language === "en-US" ? "Collapse preview pane" : "收起预览栏",
      icon: <MinusOutlined />,
      onClick: props.onCloseSecondaryPanel,
    }),
  ] : [];

  const mainPanel = props.mainPanelVisible ? (
    <section className="chat-module-panel-slot is-main">
      <Tabs
        className="chat-module-panel-tabs-shell"
        activeKey={effectiveBuiltinKey}
        destroyOnHidden
        tabBarExtraContent={buildPanelToolbarAction({
          key: "close-main-panel",
          title: props.language === "en-US" ? "Close panel" : "关闭面板",
          icon: <CloseOutlined />,
          onClick: props.onCloseMainPanel,
        })}
        onChange={(key) => {
          if (key === "files" || key === "changes" || key === "git") {
            prefetchBuiltinPanel(key);
          }
          props.onSelectBuiltin(key);
        }}
        items={builtinItems}
      />
    </section>
  ) : null;

  const secondaryPanel = effectiveSecondaryVisible ? (
    <section className="chat-module-panel-slot is-secondary">
      <Tabs
        className="chat-module-panel-tabs-shell"
        activeKey={effectiveAttachedKey}
        destroyOnHidden={false}
        tabBarExtraContent={
          secondaryToolbarActions.length > 0 ? (
            <div className="chat-module-panel-toolbar-actions">
              {secondaryToolbarActions}
            </div>
          ) : null
        }
        onChange={props.onSelectAttached}
        items={attachedItems}
      />
    </section>
  ) : null;

  return (
    <aside className="chat-module-panel">
      <div className={`chat-module-panel-body${props.mainPanelVisible && effectiveSecondaryVisible ? " is-split" : ""}`}>
        <div className="chat-module-panel-stack">
          {mainPanel && secondaryPanel ? (
            <Splitter className="chat-module-panel-splitter">
              <Splitter.Panel
                className="chat-module-panel-splitter-panel"
                min={CHAT_MODULE_MAIN_PANEL_MIN_WIDTH}
              >
                {mainPanel}
              </Splitter.Panel>
              <Splitter.Panel
                className="chat-module-panel-splitter-panel"
                min={CHAT_MODULE_SECONDARY_PANEL_MIN_WIDTH}
                defaultSize={CHAT_MODULE_SECONDARY_PANEL_DEFAULT_SIZE}
              >
                {secondaryPanel}
              </Splitter.Panel>
            </Splitter>
          ) : (
            <>
              {mainPanel}
              {secondaryPanel}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
