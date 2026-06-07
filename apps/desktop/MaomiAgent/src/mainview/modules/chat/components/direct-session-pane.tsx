import { ConversationSurface } from "../../../components/shared/conversation-surface";
import type { DirectConversationSessionPaneProps as DirectConversationSessionPanePropsShape } from "./direct-session/types";
import { useDirectSessionPaneController } from "./direct-session/use-direct-session-pane-controller";

export type DirectConversationSessionPaneProps = DirectConversationSessionPanePropsShape;

export function DirectConversationSessionPane(props: DirectConversationSessionPaneProps) {
  const controller = useDirectSessionPaneController(props);

  return (
    <ConversationSurface
      session={controller.session}
      header={controller.header}
      thread={controller.thread}
      interactionDock={controller.interactionDock}
      composer={controller.composer}
      renderStageShell={props.renderStageShell}
    />
  );
}
