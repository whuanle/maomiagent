import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type {
  DesktopConversationCapabilityDescriptor,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
} from "../models/desktop-conversation.models";

export type DesktopConversationCapabilityRuntimeContribution = {
  toolSources?: ToolSource[];
  toolHandlers?: RegisteredToolHandler[];
};

export interface DesktopConversationCapabilityProvider {
  listCapabilities(
    input: DesktopConversationCapabilityListQuery,
  ): Promise<DesktopConversationCapabilityDescriptor[]>;

  resolveRuntimeContribution?(input: {
    workspaceId: string;
    sessionId?: string;
    sessionMetadata?: Record<string, unknown>;
    runMetadata?: Record<string, unknown>;
  }): Promise<DesktopConversationCapabilityRuntimeContribution | undefined>;
}

export interface DesktopConversationCapabilityRegistryPort {
  listCapabilities(
    input: DesktopConversationCapabilityListQuery,
  ): Promise<DesktopConversationCapabilityListResponse>;
}