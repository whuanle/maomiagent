import { memo } from "react";

type Props = {
  text: string;
  className?: string;
};

function AssistantThinkingTextInner(props: Props) {
  const className = [
    "chat-thinking-text",
    props.className,
  ].filter(Boolean).join(" ");

  return (
    <span className={className}>
      <span className="chat-thinking-text-sr">{props.text}</span>
      <span className="chat-thinking-text-label" aria-hidden="true">{props.text}</span>
      <span className="chat-thinking-text-shimmer" aria-hidden="true">{props.text}</span>
    </span>
  );
}

export const AssistantThinkingText = memo(AssistantThinkingTextInner);

export default AssistantThinkingText;