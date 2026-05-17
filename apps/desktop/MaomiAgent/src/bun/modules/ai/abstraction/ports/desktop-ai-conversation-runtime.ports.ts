import type {
  ConversationRuntimeFactoryPort,
  ConversationRuntimePort,
} from "#maomiagent/ai-application";

import type {
  DesktopAiConversationAnswerInteractionInput,
  DesktopAiConversationContinueTurnInput,
  DesktopAiConversationRejectInteractionInput,
  DesktopAiConversationRunOutput,
  DesktopAiConversationRuntimeCreateInput,
  DesktopAiConversationStartUserTurnInput,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
} from "../models/desktop-ai-conversation-runtime.models";

export interface DesktopAiConversationRuntimePort extends ConversationRuntimePort<
  DesktopConversationSessionItem,
  DesktopConversationSessionDetail,
  DesktopAiConversationStartUserTurnInput,
  DesktopAiConversationRunOutput,
  DesktopAiConversationAnswerInteractionInput,
  DesktopAiConversationRejectInteractionInput
> {
  abortActiveTurn(sessionId: string): Promise<boolean>;
  continueSystemTurn(input: DesktopAiConversationContinueTurnInput): Promise<DesktopAiConversationRunOutput>;
}

export type DesktopAiConversationRuntimeFactoryPort = ConversationRuntimeFactoryPort<
  DesktopAiConversationRuntimeCreateInput,
  DesktopAiConversationRuntimePort
>;