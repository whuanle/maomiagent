import AssistantInteractionFormCard from "../assistant-interaction-form-card";
import AssistantInteractionPermissionCard from "../assistant-interaction-permission-card";
import AssistantInteractionQuestionCard from "../assistant-interaction-question-card";
import type { DirectSessionInteractionDockViewModel } from "./types";

type Props = DirectSessionInteractionDockViewModel;

export function ConversationSessionInteractionDock(props: Props) {
  if (!props.interactions.length) {
    return null;
  }

  return (
    <div
      className="chat-session-interaction-dock"
      role="group"
      aria-label={props.language === "en-US" ? "Pending interactions" : "待处理交互"}
    >
      <div className="chat-session-interaction-dock-header">
        <span className="chat-session-interaction-dock-eyebrow">
          {props.title}
        </span>
        <span className="chat-session-interaction-dock-count">
          {props.interactions.length}
        </span>
      </div>
      {props.interactions.map((interaction) => (
        <div
          key={interaction.interactionId}
          className={`chat-session-interaction-dock-item is-${interaction.request.kind}`}
        >
          {interaction.request.kind === "permission" ? (
            <AssistantInteractionPermissionCard
              interaction={interaction}
              language={props.language}
              workspaceId={props.workspaceId}
              replying={props.replyingInteractionId === interaction.interactionId}
              onApproveInteraction={props.onApproveInteraction}
              onRejectInteraction={props.onRejectInteraction}
            />
          ) : null}
          {interaction.request.kind === "question" ? (
            <AssistantInteractionQuestionCard
              interaction={interaction}
              language={props.language}
              replying={props.replyingInteractionId === interaction.interactionId}
              onAnswerInteraction={props.onAnswerInteraction}
              onRejectInteraction={props.onRejectInteraction}
            />
          ) : null}
          {interaction.request.kind === "form" ? (
            <AssistantInteractionFormCard
              interaction={interaction}
              language={props.language}
              replying={props.replyingInteractionId === interaction.interactionId}
              onAnswerInteraction={props.onAnswerInteraction}
              onRejectInteraction={props.onRejectInteraction}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default ConversationSessionInteractionDock;