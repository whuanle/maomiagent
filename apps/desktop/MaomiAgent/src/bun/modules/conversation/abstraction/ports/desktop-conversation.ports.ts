import type {
  DesktopConversationApplyWorkspaceSettingsInput,
  DesktopConversationApplyWorkspaceSettingsResponse,
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
  DesktopConversationSessionListQuery,
  DesktopConversationSessionListResponse,
} from "../models/desktop-conversation.models";

export interface DesktopConversationQueryPort {
  listSessions(input?: DesktopConversationSessionListQuery): Promise<DesktopConversationSessionListResponse>;
  getSession(sessionId: string): Promise<DesktopConversationSessionItem | null>;
  getSessionDetail(sessionId: string): Promise<DesktopConversationSessionDetail | null>;
  listCapabilities(
    input: DesktopConversationCapabilityListQuery,
  ): Promise<DesktopConversationCapabilityListResponse>;
}

export interface DesktopConversationCommandPort {
  createSession(
    input: DesktopConversationCreateSessionInput,
  ): Promise<DesktopConversationCreateSessionResponse>;
  hideSession(sessionId: string): Promise<DesktopConversationHideSessionResponse>;
  applyWorkspaceSettings(
    input: DesktopConversationApplyWorkspaceSettingsInput,
  ): Promise<DesktopConversationApplyWorkspaceSettingsResponse>;
  sendMessage(
    input: DesktopConversationSendMessageInput,
  ): Promise<DesktopConversationSendMessageResponse>;
  stopMessage(
    input: DesktopConversationStopMessageInput,
  ): Promise<DesktopConversationStopMessageResponse>;
  answerInteraction(
    input: DesktopConversationAnswerInteractionInput,
  ): Promise<DesktopConversationInteractionReplyResponse>;
  rejectInteraction(
    input: DesktopConversationRejectInteractionInput,
  ): Promise<DesktopConversationInteractionReplyResponse>;
}

export type DesktopConversationPort =
  DesktopConversationQueryPort
  & DesktopConversationCommandPort;