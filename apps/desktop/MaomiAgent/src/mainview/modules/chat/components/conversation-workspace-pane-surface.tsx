import { MenuUnfoldOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { ReactNode } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import type {
  ChatConversationRailItem,
  ChatCopy,
  ChatWorkbenchDockKey,
  ChatWorkbenchPanelKey,
  ChatWorkspaceShellState,
} from "../types";
import { ConversationWorkspaceDock } from "./conversation-workspace-dock";
import { ConversationWorkspaceRail } from "./workspace-rail";

type Props = {
  bridgeAvailable: boolean;
  language: LanguageCode;
  copy: ChatCopy;
  workspaceShell: ChatWorkspaceShellState;
  sessionsLoading: boolean;
  conversations: ChatConversationRailItem[];
  activeSessionId?: string;
  historySidebarVisible: boolean;
  rightPaneVisible: boolean;
  mainPanelVisible: boolean;
  terminalVisible: boolean;
  activePanelKey: ChatWorkbenchPanelKey;
  onDockAction: (dockKey: ChatWorkbenchDockKey) => void;
  onToggleHistorySidebar: () => void;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  children: ReactNode;
};

export function ConversationWorkspacePaneSurface(props: Props) {
  return (
    <div className="conversation-page-root">
      <div className="conversation-page-shell">
        {props.historySidebarVisible ? (
          <div className="conversation-page-sider">
            <div className="conversation-page-sider-inner">
              <ConversationWorkspaceRail
                bridgeAvailable={props.bridgeAvailable}
                language={props.language}
                copy={props.copy}
                workspaceShell={props.workspaceShell}
                sessionsLoading={props.sessionsLoading}
                conversations={props.conversations}
                activeSessionId={props.activeSessionId}
                conversationCount={props.conversations.length}
                onCreateSession={props.onCreateSession}
                onSelectSession={props.onSelectSession}
                onToggleSidebar={props.onToggleHistorySidebar}
                footer={(
                  <ConversationWorkspaceDock
                    language={props.language}
                    rightPaneVisible={props.rightPaneVisible}
                    mainPanelVisible={props.mainPanelVisible}
                    terminalVisible={props.terminalVisible}
                    activePanelKey={props.activePanelKey}
                    onDockAction={props.onDockAction}
                  />
                )}
              />
            </div>
          </div>
        ) : (
          <aside className="conversation-page-sider-collapsed">
            <div className="conversation-page-sider-collapsed-inner">
              <Button
                type="text"
                size="small"
                className="chat-sidebar-toggle-button"
                icon={<MenuUnfoldOutlined />}
                title={props.language === "en-US" ? "Show sidebar" : "显示左侧栏"}
                aria-label={props.language === "en-US" ? "Show sidebar" : "显示左侧栏"}
                onClick={props.onToggleHistorySidebar}
              />
              <ConversationWorkspaceDock
                language={props.language}
                rightPaneVisible={props.rightPaneVisible}
                mainPanelVisible={props.mainPanelVisible}
                terminalVisible={props.terminalVisible}
                activePanelKey={props.activePanelKey}
                onDockAction={props.onDockAction}
                orientation="vertical"
              />
            </div>
          </aside>
        )}

        <div className="conversation-page-main">
          {props.children}
        </div>
      </div>
    </div>
  );
}