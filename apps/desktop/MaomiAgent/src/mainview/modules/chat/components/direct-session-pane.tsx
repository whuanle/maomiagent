import {
  PaperClipOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, Select, Spin } from "antd";

import type { LanguageCode } from "../../../config/titlebar";
import type {
  ConversationInteractionEntry,
  ConversationMessageEntry,
  ConversationMessagePartView,
} from "#maomiagent/kernel/src/host/application";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import { DirectSessionComposer } from "./direct-session/direct-session-composer";
import { DirectSessionHeader } from "./direct-session/direct-session-header";
import { DirectSessionMessageList } from "./direct-session/direct-session-message-list";
import { ConversationSessionInteractionDock } from "./direct-session/conversation-interaction-dock";
import type { DirectConversationSessionPaneProps as DirectConversationSessionPanePropsShape } from "./direct-session/types";
import { useDirectSessionPaneController } from "./direct-session/use-direct-session-pane-controller";

export type DirectConversationSessionPaneProps = DirectConversationSessionPanePropsShape;

export function DirectConversationSessionPane(props: DirectConversationSessionPaneProps) {
  const controller = useDirectSessionPaneController(props);

  if (!controller.session) {
    return null;
  }

  const directPane = (
    <section className="chat-direct-pane is-programming">
      <DirectSessionHeader header={controller.header} />

      <div className="chat-direct-thread-scroll">
        <DirectSessionMessageList {...controller.thread} />
      </div>

      <div className="chat-direct-composer-shell">
        <div className={`chat-direct-composer-stack${controller.interactionDock.interactions.length > 0 ? " has-dock" : ""}`}>
          <ConversationSessionInteractionDock {...controller.interactionDock} />
          <DirectSessionComposer {...controller.composer} />
        </div>
      </div>
    </section>
  );

  if (!props.renderStageShell) {
    return directPane;
  }

  return directPane;
}