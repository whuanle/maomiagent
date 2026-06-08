import { useEffect, useMemo, useRef } from "react";

import { DirectSessionComposer } from "../../../modules/chat/components/direct-session/direct-session-composer";
import { DirectSessionHeader } from "../../../modules/chat/components/direct-session/direct-session-header";
import { ConversationSessionInteractionDock } from "../../../modules/chat/components/direct-session/conversation-interaction-dock";
import { DirectSessionMessageList } from "../../../modules/chat/components/direct-session/direct-session-message-list";

import type { ConversationSurfaceProps } from "./types";

export function ConversationSurface(props: ConversationSurfaceProps) {
  if (!props.session) {
    return null;
  }

  const interactionDockRef = useRef<HTMLDivElement | null>(null);
  const interactionSignature = useMemo(
    () => props.interactionDock.interactions.map((interaction) => interaction.interactionId).join("|"),
    [props.interactionDock.interactions],
  );
  const lastInteractionSignatureRef = useRef("");

  useEffect(() => {
    if (!interactionSignature || interactionSignature === lastInteractionSignatureRef.current) {
      return;
    }

    lastInteractionSignatureRef.current = interactionSignature;
    const dockNode = interactionDockRef.current;
    if (!dockNode) {
      return;
    }

    requestAnimationFrame(() => {
      dockNode.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [interactionSignature]);

  const directPane = (
    <section className="chat-direct-pane is-programming">
      {props.showHeader === false ? null : <DirectSessionHeader header={props.header} />}

      <div className="chat-direct-thread-scroll">
        <DirectSessionMessageList {...props.thread} />
      </div>

      <div className="chat-direct-composer-shell">
        <div className={`chat-direct-composer-stack${props.interactionDock.interactions.length > 0 ? " has-dock" : ""}`}>
          <div ref={interactionDockRef}>
            <ConversationSessionInteractionDock {...props.interactionDock} />
          </div>
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
