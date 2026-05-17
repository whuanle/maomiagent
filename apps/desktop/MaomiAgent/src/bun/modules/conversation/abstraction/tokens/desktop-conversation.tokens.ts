import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopConversationCommandPort,
  DesktopConversationPort,
  DesktopConversationQueryPort,
} from "../ports/desktop-conversation.ports";

import type {
  DesktopConversationCapabilityRegistryPort as DesktopConversationCapabilityRegistryPortShape,
  DesktopConversationCapabilityProvider as DesktopConversationCapabilityProviderShape,
} from "../ports/desktop-conversation-capabilities.ports";

const desktopConversation = createServiceNamespace("desktop.conversation");

export const DESKTOP_CONVERSATION_PORT =
  desktopConversation.token<DesktopConversationPort>("conversation");
export const DESKTOP_CONVERSATION_QUERY_PORT =
  desktopConversation.token<DesktopConversationQueryPort>("conversation-query");
export const DESKTOP_CONVERSATION_COMMAND_PORT =
  desktopConversation.token<DesktopConversationCommandPort>("conversation-command");
export const DESKTOP_CONVERSATION_CAPABILITY_PROVIDER =
  desktopConversation.token<DesktopConversationCapabilityProviderShape>("conversation-capability-provider");
export const DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_PORT =
  desktopConversation.token<DesktopConversationCapabilityRegistryPortShape>("conversation-capability-registry");