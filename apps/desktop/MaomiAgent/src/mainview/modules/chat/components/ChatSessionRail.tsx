import {
  CloseOutlined,
  LoadingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Empty,
  Select,
  Spin,
} from "antd";

import type { LanguageCode } from "../../../config/titlebar";
import type { DesktopConversationSessionStatus } from "../../../../shared/desktop-conversation";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import { ChatDockIcon, resolveWorkbenchDockTitle } from "./ChatDockIcon";
import type { ChatCopy, ChatSessionFilter, ChatWorkbenchDockKey } from "../types";

type ChatSessionRailProps = {
  bridgeAvailable: boolean;
  workspaces: DesktopWorkspaceItem[];
  workspaceId?: string;
  sessions: Array<{
    sessionId: string;
    title: string;
    status: DesktopConversationSessionStatus;
    updatedAt: string;
    createdAt: string;
  }>;
  selectedSessionId?: string;
  loadingWorkspaces: boolean;
  loadingSessions: boolean;
  creatingSession: boolean;
  archivingSessionId: string | null;
  searchText: string;
  statusFilter: ChatSessionFilter;
  language: LanguageCode;
  copy: ChatCopy;
  historySidebarVisible: boolean;
  onToggleHistorySidebar: () => void;
  onSearchTextChange: (value: string) => void;
  onStatusFilterChange: (value: ChatSessionFilter) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onHideSession: (sessionId: string) => void;
  onRefresh: () => void;
  onOpenWorkspace: () => void;
  onWorkbenchDockAction: (dockKey: ChatWorkbenchDockKey) => void;
};

function formatDateTime(value: string, language: LanguageCode) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language);
}

function formatRelativeTimestamp(value: string, language: LanguageCode) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return language === "en-US" ? "Just now" : "刚刚";
  }

  if (diff < hour) {
    const minutes = Math.max(1, Math.floor(diff / minute));
    return language === "en-US" ? `${minutes} min ago` : `${minutes} 分钟前`;
  }

  if (diff < day) {
    const hours = Math.max(1, Math.floor(diff / hour));
    return language === "en-US" ? `${hours} h ago` : `${hours} 小时前`;
  }

  if (diff < 7 * day) {
    const days = Math.max(1, Math.floor(diff / day));
    return language === "en-US" ? `${days} d ago` : `${days} 天前`;
  }

  return date.toLocaleDateString(language);
}

function resolveSessionTone(status: DesktopConversationSessionStatus) {
  if (status === "active") {
    return "running" as const;
  }

  if (status === "failed") {
    return "error" as const;
  }

  return "idle" as const;
}

function resolveStatusBadge(
  status: DesktopConversationSessionStatus,
  copy: ChatCopy,
) {
  if (status === "archived") {
    return {
      label: copy.statusArchived,
      tone: "neutral" as const,
    };
  }

  if (status === "failed") {
    return {
      label: copy.statusFailed,
      tone: "warning" as const,
    };
  }

  return null;
}

function ConversationWorkspaceDock(props: {
  language: LanguageCode;
  orientation?: "horizontal" | "vertical";
  onAction: (dockKey: ChatWorkbenchDockKey) => void;
}) {
  const dockItems: ChatWorkbenchDockKey[] = [
    "settings",
    "sidebar",
    "terminal",
    "files",
    "changes",
    "git",
    "secondary",
  ];

  return (
    <div className={`chat-sidebar-dock${props.orientation === "vertical" ? " is-vertical" : ""}`}>
      {dockItems.map((item) => (
        <Button
          key={item}
          className="chat-sidebar-dock-button"
          type="text"
          size="small"
          icon={<ChatDockIcon dockKey={item} />}
          title={resolveWorkbenchDockTitle(props.language, item)}
          aria-label={resolveWorkbenchDockTitle(props.language, item)}
          disabled={item === "terminal" || item === "changes" || item === "git"}
          onClick={() => props.onAction(item)}
        />
      ))}
    </div>
  );
}

function ConversationSessionRailItem(props: {
  session: ChatSessionRailProps["sessions"][number];
  language: LanguageCode;
  copy: ChatCopy;
  archiving: boolean;
  onRemove: () => void;
}) {
  const badge = resolveStatusBadge(props.session.status, props.copy);
  const meta = formatRelativeTimestamp(props.session.updatedAt, props.language);
  const statusTone = resolveSessionTone(props.session.status);

  return (
    <div className="chat-session-rail-item">
      <div className="chat-session-rail-item-copy">
        <div className="chat-session-rail-item-head">
          <span className="chat-session-rail-item-title">{props.session.title || props.session.sessionId}</span>
        </div>
        <div className="chat-session-rail-item-meta-row">
          <div className="chat-session-rail-item-meta" title={formatDateTime(props.session.updatedAt, props.language)}>
            {meta}
          </div>
          {badge ? (
            <div className="chat-session-rail-item-badges">
              <span className={`chat-session-rail-item-badge is-${badge.tone}`} title={badge.label}>
                {badge.label}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="chat-session-rail-item-side">
        <span
          className={`chat-session-rail-item-status-dot is-${statusTone}`}
          aria-label={props.copy.statusLabel(props.session.status)}
          title={props.copy.statusLabel(props.session.status)}
        />
        <span
          role="button"
          tabIndex={0}
          className="chat-session-rail-item-action chat-nav-item-close"
          aria-label={props.copy.archiveSession}
          title={props.copy.archiveSession}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onRemove();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            props.onRemove();
          }}
        >
          {props.archiving ? <LoadingOutlined /> : <CloseOutlined />}
        </span>
      </div>
    </div>
  );
}

export function ChatSessionRail(props: ChatSessionRailProps) {
  const isEn = props.language === "en-US";
  const selectedWorkspace = props.workspaces.find((item) => item.workspaceId === props.workspaceId);
  const workspaceSummary = selectedWorkspace?.name?.trim()
    || (props.bridgeAvailable
      ? (isEn ? "Select a workspace to start" : "先打开一个工作区开始对话")
      : props.copy.bridgeUnavailableTitle);

  if (!props.historySidebarVisible) {
    return (
      <aside className="conversation-page-sider-collapsed">
        <div className="conversation-page-sider-collapsed-inner">
          <Button
            type="text"
            size="small"
            className="chat-sidebar-toggle-button"
            icon={<MenuUnfoldOutlined />}
            title={isEn ? "Show sidebar" : "显示左侧栏"}
            aria-label={isEn ? "Show sidebar" : "显示左侧栏"}
            onClick={props.onToggleHistorySidebar}
          />
          <ConversationWorkspaceDock
            language={props.language}
            orientation="vertical"
            onAction={props.onWorkbenchDockAction}
          />
        </div>
      </aside>
    );
  }

  return (
    <div className="conversation-page-sider">
      <div className="conversation-page-sider-inner">
        <aside className="chat-sidebar conversation-page-history-sidebar">
          <div className="chat-sidebar-head">
            <div className="chat-sidebar-head-actions">
              <div className="chat-sidebar-head-copy">
                <div className="chat-sidebar-head-title">{isEn ? "Workspaces" : "工作区"}</div>
                <div className="chat-sidebar-head-subtitle" title={workspaceSummary}>{workspaceSummary}</div>
              </div>
              <Button
                className="chat-sidebar-toggle-button"
                type="text"
                size="small"
                icon={<MenuFoldOutlined />}
                title={isEn ? "Hide sidebar" : "隐藏左侧栏"}
                aria-label={isEn ? "Hide sidebar" : "隐藏左侧栏"}
                onClick={props.onToggleHistorySidebar}
              />
            </div>

            <div className="chat-sidebar-field">
              <div className="chat-sidebar-field-label">{props.copy.workspaceLabel}</div>
              <Select
                className="chat-workspace-select"
                value={props.workspaceId}
                options={props.workspaces.map((workspace) => ({
                  value: workspace.workspaceId,
                  label: workspace.name,
                }))}
                placeholder={props.copy.workspacePlaceholder}
                loading={props.loadingWorkspaces}
                disabled={!props.bridgeAvailable || props.workspaces.length === 0}
                showSearch
                optionFilterProp="label"
                onChange={(value) => props.onSelectWorkspace(String(value))}
              />
            </div>

            <div className="chat-sidebar-actions">
              <Button
                className="chat-secondary-button"
                block
                onClick={props.onOpenWorkspace}
                disabled={!props.bridgeAvailable}
              >
                {props.copy.openWorkspace}
              </Button>
            </div>
          </div>

          <div className="chat-sidebar-body">
            <div className="chat-sidebar-content conversation-page-rail-scroll">
              <section className="chat-sidebar-section">
                <div className="chat-sidebar-section-head">
                  <div className="chat-sidebar-section-title">{isEn ? "Sessions" : "会话主题"}</div>
                  <div className="chat-sidebar-section-actions">
                    <div className="chat-sidebar-section-count">{props.sessions.length}</div>
                    <Button
                      className="chat-section-add-button"
                      type="text"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={props.onCreateSession}
                      disabled={!props.workspaceId || !props.bridgeAvailable}
                      title={props.copy.createSession}
                    />
                  </div>
                </div>
                {!props.bridgeAvailable ? (
                  <div className="conversation-page-rail-empty">
                    <div className="chat-sidebar-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={props.copy.bridgeUnavailableDescription}
                      />
                    </div>
                  </div>
                ) : props.workspaces.length === 0 ? (
                  <div className="conversation-page-rail-empty">
                    <div className="chat-sidebar-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={props.copy.emptyWorkspaceDescription}
                      />
                    </div>
                  </div>
                ) : props.loadingSessions && props.sessions.length === 0 ? (
                  <div className="conversation-page-rail-loading">
                    <Spin size="small" />
                  </div>
                ) : props.sessions.length === 0 ? (
                  <div className="conversation-page-rail-empty">
                    <div className="chat-sidebar-empty">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={props.copy.emptySessionDescription}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="conversation-page-history-list">
                    {props.sessions.map((session) => {
                      const selected = session.sessionId === props.selectedSessionId;
                      const archiving = props.archivingSessionId === session.sessionId;

                      return (
                        <button
                          key={session.sessionId}
                          type="button"
                          className={`chat-nav-item${selected ? " is-active" : ""}`}
                          onClick={() => props.onSelectSession(session.sessionId)}
                          title={session.title || session.sessionId}
                        >
                          <ConversationSessionRailItem
                            session={session}
                            language={props.language}
                            copy={props.copy}
                            archiving={archiving}
                            onRemove={() => props.onHideSession(session.sessionId)}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
            <ConversationWorkspaceDock language={props.language} onAction={props.onWorkbenchDockAction} />
          </div>
        </aside>
      </div>
    </div>
  );
}
