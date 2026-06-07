import { DirectSessionComposer } from "../../../modules/chat/components/direct-session/direct-session-composer";
import { DirectSessionHeader } from "../../../modules/chat/components/direct-session/direct-session-header";
import { ConversationSessionInteractionDock } from "../../../modules/chat/components/direct-session/conversation-interaction-dock";
import { DirectSessionMessageList } from "../../../modules/chat/components/direct-session/direct-session-message-list";

import type { ConversationSurfaceProps } from "./types";

export function ConversationSurface(props: ConversationSurfaceProps) {
  if (!props.session) {
    return null;
  }

  const directPane = (
    <section className="chat-direct-pane is-programming">
      <DirectSessionHeader header={props.header} />

      <div className="chat-direct-thread-scroll">
        <DirectSessionMessageList {...props.thread} />
      </div>

      <div className="chat-direct-composer-shell">
        <div className={`chat-direct-composer-stack${props.interactionDock.interactions.length > 0 ? " has-dock" : ""}`}>
          <ConversationSessionInteractionDock {...props.interactionDock} />
          <DirectSessionComposer {...props.composer} />
        </div>
      </div>
    </section>
  );

  if (!props.renderStageShell) {
    return directPane;
  }

  return directPane;
}

export default ConversationSurface;
