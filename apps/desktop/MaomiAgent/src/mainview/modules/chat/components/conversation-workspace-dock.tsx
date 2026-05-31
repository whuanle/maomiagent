import { Button } from "antd";

import type { LanguageCode } from "../../../config/titlebar";
import { ChatDockIcon, resolveWorkbenchDockTitle } from "./ChatDockIcon";
import type { ChatWorkbenchDockKey, ChatWorkbenchPanelKey } from "../types";

type Props = {
  language: LanguageCode;
  rightPaneVisible: boolean;
  mainPanelVisible: boolean;
  terminalVisible: boolean;
  activePanelKey: ChatWorkbenchPanelKey;
  onDockAction: (dockKey: ChatWorkbenchDockKey) => void;
  orientation?: "horizontal" | "vertical";
};

export function ConversationWorkspaceDock(props: Props) {
  const dockItems = [
    {
      key: "browser" as const,
      active: props.mainPanelVisible && props.activePanelKey === "browser",
      disabled: false,
    },
    {
      key: "settings" as const,
      active: props.mainPanelVisible && props.activePanelKey === "settings",
      disabled: false,
    },
    {
      key: "sidebar" as const,
      active: props.rightPaneVisible,
      disabled: false,
    },
    {
      key: "terminal" as const,
      active: props.terminalVisible,
      disabled: false,
    },
    {
      key: "files" as const,
      active: props.mainPanelVisible && props.activePanelKey === "files",
      disabled: false,
    },
    {
      key: "changes" as const,
      active: props.mainPanelVisible && props.activePanelKey === "changes",
      disabled: false,
    },
    {
      key: "git" as const,
      active: props.mainPanelVisible && props.activePanelKey === "git",
      disabled: false,
    },
  ];

  return (
    <div className={`chat-sidebar-dock${props.orientation === "vertical" ? " is-vertical" : ""}`}>
      {dockItems.map((item) => {
        const title = resolveWorkbenchDockTitle(props.language, item.key);
        return (
          <Button
            key={item.key}
            className={`chat-sidebar-dock-button${item.active ? " is-active" : ""}`}
            type="text"
            size="small"
            icon={<ChatDockIcon dockKey={item.key} />}
            disabled={item.disabled}
            onClick={() => props.onDockAction(item.key)}
            title={title}
            aria-label={title}
            aria-pressed={item.active}
          />
        );
      })}
    </div>
  );
}
