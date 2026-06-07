import {
  CloseOutlined,
  MenuFoldOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Button, Empty, Select, Spin } from "antd";
import type { ReactNode } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import type {
  ChatConversationRailItem,
  ChatCopy,
  ChatWorkspaceShellState,
} from "../types";

type Props = {
  bridgeAvailable: boolean;
  language: LanguageCode;
  copy: ChatCopy;
  workspaceShell: ChatWorkspaceShellState;
  sessionsLoading: boolean;
  conversations: ChatConversationRailItem[];
  activeSessionId?: string;
  conversationCount: number;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onToggleSidebar: () => void;
  footer?: ReactNode;
};

export function ConversationWorkspaceRail(props: Props) {
  const isEn = props.language === "en-US";
  const openedWorkspaces = props.workspaceShell.openedWorkspaces;
  const activeOpenedWorkspace = openedWorkspaces.find((item) => item.active) ?? null;
  const hasWorkspace = props.bridgeAvailable && openedWorkspaces.some((item) => item.active);
  const isInitialLoading = props.sessionsLoading && props.conversations.length === 0;
  const workspaceControlsDisabled = props.workspaceShell.workspaceMutating || !props.bridgeAvailable;
  const workspaceSummary = !props.bridgeAvailable
    ? props.copy.bridgeUnavailableTitle
    : activeOpenedWorkspace?.label
      || (isEn ? "Open a workspace to start" : "先打开一个工作区开始对话");
  const noOpenedWorkspaceDescription = isEn ? "No opened workspace" : "暂无已打开工作区";

  return (
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
            onClick={props.onToggleSidebar}
          />
        </div>

        <div className="chat-sidebar-field">
          <div className="chat-sidebar-field-label">{isEn ? "Open workspace" : "打开工作区"}</div>
          <Select
            className="chat-workspace-select"
            value={undefined}
            options={props.workspaceShell.workspaceOptions}
            placeholder={isEn ? "Open workspace" : "打开工作区"}
            loading={props.workspaceShell.workspaceLoading}
            disabled={workspaceControlsDisabled}
            showSearch
            optionFilterProp="label"
            onChange={(value) => {
              void props.workspaceShell.onOpenWorkspace(String(value));
            }}
          />
        </div>
      </div>

      <div className="chat-sidebar-body">
        <div className="chat-sidebar-content conversation-page-rail-scroll">
          <section className="chat-sidebar-section">
            <div className="chat-sidebar-section-head">
              <div className="chat-sidebar-section-title">{isEn ? "Opened workspaces" : "已打开工作区"}</div>
              <div className="chat-sidebar-section-actions">
                <div className="chat-sidebar-section-count">{openedWorkspaces.length}</div>
              </div>
            </div>

            {!props.bridgeAvailable ? (
              <div className="chat-sidebar-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={props.copy.bridgeUnavailableDescription}
                />
              </div>
            ) : openedWorkspaces.length === 0 ? (
              <div className="chat-sidebar-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={noOpenedWorkspaceDescription}
                />
              </div>
            ) : (
              <div className="conversation-page-opened-workspace-list">
                {openedWorkspaces.map((item) => (
                  <button
                    key={item.workspaceId}
                    type="button"
                    className={`chat-nav-item${item.active ? " is-active" : ""}`}
                    disabled={workspaceControlsDisabled}
                    onClick={() => {
                      void props.workspaceShell.onActivateWorkspace(item.workspaceId);
                    }}
                    title={item.title}
                  >
                    <span className="chat-nav-item-main">
                      <span className="chat-nav-item-copy">
                        <span className="chat-nav-item-label-row">
                          <span className="chat-nav-item-label">{item.label}</span>
                          {item.active ? (
                            <span className="chat-nav-item-chip">{isEn ? "Current" : "当前"}</span>
                          ) : null}
                          {item.ready ? (
                            <span className="chat-nav-item-chip is-ready">{isEn ? "Ready" : "就绪"}</span>
                          ) : null}
                        </span>
                        {item.title ? (
                          <span className="chat-nav-item-meta" title={item.title}>
                            {item.title}
                          </span>
                        ) : null}
                      </span>
                      {item.closable ? (
                        <span className="chat-nav-item-actions">
                          <span
                            role="button"
                            tabIndex={0}
                            className="chat-nav-item-close"
                            aria-label={isEn ? "Close workspace" : "关闭工作区"}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void props.workspaceShell.onCloseWorkspace(item.workspaceId);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              event.stopPropagation();
                              void props.workspaceShell.onCloseWorkspace(item.workspaceId);
                            }}
                          >
                            <CloseOutlined />
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="chat-sidebar-section-divider" aria-hidden="true" />

          <section className="chat-sidebar-section">
            <div className="chat-sidebar-section-head">
              <div className="chat-sidebar-section-title">{isEn ? "Sessions" : "会话主题"}</div>
              <div className="chat-sidebar-section-actions">
                <div className="chat-sidebar-section-count">{props.conversationCount}</div>
                <Button
                  className="chat-section-add-button"
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={props.onCreateSession}
                  disabled={!hasWorkspace || !props.bridgeAvailable}
                  title={props.copy.createSession}
                />
              </div>
            </div>
            {isInitialLoading ? (
              <div className="conversation-page-rail-loading">
                <Spin size="small" />
              </div>
            ) : !props.bridgeAvailable ? (
              <div className="conversation-page-rail-empty">
                <div className="chat-sidebar-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={props.copy.bridgeUnavailableDescription}
                  />
                </div>
              </div>
            ) : props.conversations.length === 0 ? (
              <div className="conversation-page-rail-empty">
                <div className="chat-sidebar-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={hasWorkspace ? props.copy.emptySessionDescription : props.copy.emptyWorkspaceDescription}
                  />
                </div>
              </div>
            ) : (
              <div className="conversation-page-history-list">
                {props.conversations.map((item) => {
                  const isActive = item.key === props.activeSessionId;
                  const disabled = !props.bridgeAvailable || item.disabled === true;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`chat-nav-item${isActive ? " is-active" : ""}${disabled ? " is-disabled" : ""}${item.taskLinked ? " is-task-linked" : ""}`}
                      disabled={disabled}
                      onClick={() => props.onSelectSession(item.key)}
                      title={item.title}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        {props.footer}
      </div>
    </aside>
  );
}
