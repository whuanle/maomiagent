import {
  DirectConversationSessionPane,
  type DirectConversationSessionPaneProps,
} from "./direct-session-pane";

export type ChatConversationPaneProps = DirectConversationSessionPaneProps;

export function ChatConversationPane(props: ChatConversationPaneProps) {
  return <DirectConversationSessionPane {...props} />;
}

export default ChatConversationPane;