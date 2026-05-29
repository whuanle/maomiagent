import type {
  ConversationTurnOutput,
  RegisteredToolHandler,
  ToolSource,
} from "../../kernel-bridge";
import type { DesktopTasksQueryPort } from "../../../tasks";
import type {
  DesktopConversationAttachmentInput,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
} from "../../../../../shared/desktop-conversation";
import type { DesktopAiProviderTelemetryEvent } from "./desktop-ai-runtime.models";

import type { DesktopAiExecutionProfileMaterializationInput } from "./desktop-ai-one-shot.models";

export type DesktopAiConversationRuntimeCreateInput = {
  conversationDbPath: string;
  turnNoActivityTimeoutMs?: number;
  tasksQuery?: Pick<DesktopTasksQueryPort, "get">;
  toolSources?: ToolSource[];
  toolHandlers?: RegisteredToolHandler[];
  toolContributionResolver?: (input: {
    workspaceId: string;
    sessionId?: string;
    sessionMetadata?: Record<string, unknown>;
    runMetadata?: Record<string, unknown>;
  }) => Promise<{
    toolSources?: ToolSource[];
    toolHandlers?: RegisteredToolHandler[];
  } | undefined>;
  runtimeEventsPublisher?: (
    update: DesktopConversationRuntimeEventsUpdateEvent,
  ) => void | Promise<void>;
  providerTelemetryPublisher?: (
    event: DesktopAiProviderTelemetryEvent,
  ) => void | Promise<void>;
};

export type DesktopAiConversationStartUserTurnInput = {
  item: DesktopConversationSessionItem;
  text?: string;
  attachments?: readonly DesktopConversationAttachmentInput[];
  scope?: DesktopAiExecutionProfileMaterializationInput["scope"];
  workspaceId?: string;
  selectedChannelId?: string;
  selectedModelId?: string;
  selectedAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopAiConversationContinueTurnInput = {
  item: DesktopConversationSessionItem;
  scope?: DesktopAiExecutionProfileMaterializationInput["scope"];
  workspaceId?: string;
  selectedChannelId?: string;
  selectedModelId?: string;
  selectedAgentId?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopAiConversationAnswerInteractionInput = {
  interactionId: string;
  response: unknown;
};

export type DesktopAiConversationRejectInteractionInput = {
  interactionId: string;
  reason?: string;
};

export type DesktopAiConversationRunOutput = ConversationTurnOutput;

export type {
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
};
