import { Splitter } from "antd";
import type { ReactNode } from "react";

import { ShellPage } from "../../shell";
import { ConversationModulePanel } from "./module-panel";
import type {
  ChatAttachedTabState,
  ChatOpenWorkspaceFilePreviewInput,
  ChatSelectedSessionView,
  ChatWorkbenchPanelKey,
} from "../types";
import type { LanguageCode } from "../../../config/titlebar";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";

const CHAT_MAIN_PANE_MIN_WIDTH = 300;
const CHAT_RIGHT_PANE_MIN_WIDTH = 320;
const CHAT_RIGHT_PANE_MAX_WIDTH = "64%";
const CHAT_TERMINAL_PANE_MIN_HEIGHT = 188;

type Props = {
  active: boolean;
  language: LanguageCode;
  workspaceId?: string;
  selectedWorkspace?: DesktopWorkspaceItem;
  selectedSession?: ChatSelectedSessionView;
  activePanelKey: ChatWorkbenchPanelKey;
  rightPaneVisible: boolean;
  mainPanelVisible: boolean;
  secondaryPanelVisible: boolean;
  terminalVisible: boolean;
  activeAttachedTabKey?: string;
  paneSizes: {
    right: number | string;
    terminal: number;
  };
  extraTabs: ChatAttachedTabState[];
  onMainSplitterResize: (sizes: number[]) => void;
  onTerminalSplitterResize: (sizes: number[]) => void;
  onMainPanelSelect: (key: string) => void;
  onSecondaryPanelSelect: (key: string) => void;
  onCloseMainPanel: () => void;
  onCloseSecondaryPanel: () => void;
  onCloseAttachedTab: (key: string) => void;
  onCloseAllAttachedTabs: () => void;
  onOpenWorkspaceFilePreview: (input: ChatOpenWorkspaceFilePreviewInput) => void;
  children: ReactNode;
};

export function ConversationWorkspaceWorkbench(props: Props) {
  const mainWorkbenchContent = props.rightPaneVisible ? (
    <Splitter
      className="chat-main-splitter"
      onResize={props.onMainSplitterResize}
    >
      <Splitter.Panel className="chat-splitter-panel" min={CHAT_MAIN_PANE_MIN_WIDTH}>
        {props.children}
      </Splitter.Panel>
      <Splitter.Panel
        className="chat-splitter-panel"
        size={props.paneSizes.right}
        min={CHAT_RIGHT_PANE_MIN_WIDTH}
        max={CHAT_RIGHT_PANE_MAX_WIDTH}
      >
        <ConversationModulePanel
          active={props.active}
          language={props.language}
          workspaceId={props.workspaceId}
          selectedWorkspace={props.selectedWorkspace}
          selectedSession={props.selectedSession}
          activeBuiltinKey={props.activePanelKey}
          activeAttachedKey={props.activeAttachedTabKey}
          mainPanelVisible={props.mainPanelVisible}
          secondaryPanelVisible={props.secondaryPanelVisible}
          extraTabs={props.extraTabs}
          onCloseMainPanel={props.onCloseMainPanel}
          onCloseSecondaryPanel={props.onCloseSecondaryPanel}
          onCloseAttachedTab={props.onCloseAttachedTab}
          onCloseAllAttachedTabs={props.onCloseAllAttachedTabs}
          onOpenWorkspaceFilePreview={props.onOpenWorkspaceFilePreview}
          onSelectBuiltin={props.onMainPanelSelect}
          onSelectAttached={props.onSecondaryPanelSelect}
        />
      </Splitter.Panel>
    </Splitter>
  ) : (
    props.children
  );

  const stackedWorkbenchContent = props.terminalVisible ? (
    <Splitter
      orientation="vertical"
      className="chat-terminal-splitter"
      onResize={props.onTerminalSplitterResize}
    >
      <Splitter.Panel className="chat-terminal-splitter-panel" min={260}>
        {mainWorkbenchContent}
      </Splitter.Panel>
      <Splitter.Panel
        className="chat-terminal-splitter-panel"
        size={props.paneSizes.terminal}
        min={CHAT_TERMINAL_PANE_MIN_HEIGHT}
      >
        <div className="chat-terminal-workbench-shell">
          <ShellPage
            active={props.active && props.terminalVisible}
            language={props.language}
            embedded
            boundWorkspaceId={props.workspaceId}
          />
        </div>
      </Splitter.Panel>
    </Splitter>
  ) : mainWorkbenchContent;

  return (
    <div className="opencode-root-layout">
      <div className="chat-main-stack">
        {stackedWorkbenchContent}
      </div>
    </div>
  );
}