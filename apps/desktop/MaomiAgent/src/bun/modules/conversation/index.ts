export type {
  DesktopConversationActionCapabilityDescriptor,
  DesktopConversationApprovalMode,
  DesktopConversationPermissionRule,
  DesktopConversationPermissionRuleDecision,
  DesktopConversationAttachmentInput,
  DesktopConversationAttachmentKind,
  DesktopConversationApplyWorkspaceSettingsInput,
  DesktopConversationApplyWorkspaceSettingsResponse,
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCapabilityDescriptor,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
  DesktopConversationCapabilityPreferences,
  DesktopConversationCapabilityScope,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationRunItem,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationSessionDetailUpdateReason,
  DesktopConversationSessionItem,
  DesktopConversationSessionListQuery,
  DesktopConversationSessionListResponse,
  DesktopConversationSessionSettings,
  DesktopConversationSessionStatus,
  DesktopConversationToggleCapabilityDescriptor,
} from "./abstraction/models/desktop-conversation.models";
export type {
  DesktopConversationCapabilityProvider,
  DesktopConversationCapabilityRegistryPort,
  DesktopConversationCapabilityRuntimeContribution,
} from "./abstraction/ports/desktop-conversation-capabilities.ports";
export type {
  DesktopConversationCommandPort,
  DesktopConversationPort,
  DesktopConversationQueryPort,
} from "./abstraction/ports/desktop-conversation.ports";
export {
  DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
  DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_PORT,
  DESKTOP_CONVERSATION_COMMAND_PORT,
  DESKTOP_CONVERSATION_PORT,
  DESKTOP_CONVERSATION_QUERY_PORT,
} from "./abstraction/tokens/desktop-conversation.tokens";
export {
  DesktopConversationModule,
  DESKTOP_CONVERSATION_SERVICE_TOKEN,
} from "./composition/conversation.module";
export { DesktopConversationService } from "./implementation/services/desktop-conversation-service";
export { DesktopConversationStore } from "./implementation/stores/desktop-conversation-store";