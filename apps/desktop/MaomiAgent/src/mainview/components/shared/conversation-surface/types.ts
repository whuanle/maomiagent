import type { ChatSelectedSessionView } from "../../../modules/chat/types";
import type {
  DirectSessionComposerViewModel,
  DirectSessionHeaderViewModel,
  DirectSessionInteractionDockViewModel,
  DirectSessionThreadViewModel,
} from "../../../modules/chat/components/direct-session/types";

export type ConversationSurfaceProps = {
  session?: ChatSelectedSessionView;
  header: DirectSessionHeaderViewModel;
  thread: DirectSessionThreadViewModel;
  interactionDock: DirectSessionInteractionDockViewModel;
  composer: DirectSessionComposerViewModel;
  showHeader?: boolean;
  renderStageShell?: boolean;
};
