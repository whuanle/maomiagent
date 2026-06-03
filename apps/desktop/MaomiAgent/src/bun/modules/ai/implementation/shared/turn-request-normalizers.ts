import { pruneOldToolOutputs } from "#maomiagent/kernel/src/core/algorithms/context/tool-output-pruner";
import type { DesktopModelInterleavedConfig } from "../../../../../shared/desktop-models";

import type { AiExecutionProfileRef, AiTurnRequest } from "../../kernel-bridge";

const TOOL_RESULT_PRUNE_PROTECT_RECENT_USER_TURNS = 2;
const TOOL_RESULT_PRUNE_PROTECT_TOKENS = 4_000;
const TOOL_RESULT_PRUNE_MINIMUM_TOKENS = 1_000;
const TOOL_RESULT_PRUNED_OUTPUT_TEXT = "[Earlier tool result omitted to keep the next reply responsive.]";

function readExecutionProfileBooleanMetadata(
  executionProfile: AiExecutionProfileRef,
  key: string,
): boolean | undefined {
  const metadata = executionProfile.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function readExecutionProfileInterleavedMetadata(
  executionProfile: AiExecutionProfileRef,
): DesktopModelInterleavedConfig | undefined {
  const metadata = executionProfile.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>).interleaved;
  if (value === true || value === false) {
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const field = typeof (value as { field?: unknown }).field === "string"
    ? (value as { field?: string }).field?.trim()
    : undefined;
  return field ? { field } : {};
}

function executionProfileRequiresReasoningHistory(
  executionProfile: AiExecutionProfileRef,
): boolean {
  const interleaved = readExecutionProfileInterleavedMetadata(executionProfile);
  if (interleaved !== undefined && interleaved !== false) {
    return true;
  }

  const metadata = executionProfile.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const record = metadata as Record<string, unknown>;
  return record.protocolFamily === "anthropic"
    && record.apiStyle === "messages"
    && record.supportsReasoning === true
    && record.thinkingEnabled !== false;
}

function messageNeedsSyntheticReasoning(
  message: AiTurnRequest["prompt"]["messages"][number],
): boolean {
  if (message.message.role !== "assistant") {
    return false;
  }

  const hasToolCallRef = message.parts.some((part) => part.type === "tool_call_ref");
  if (!hasToolCallRef) {
    return false;
  }

  return !message.parts.some((part) => part.type === "reasoning");
}

export function applyConversationReasoningHistoryNormalization(input: {
  executionProfile: AiExecutionProfileRef;
  request: AiTurnRequest;
}): AiTurnRequest {
  if (!executionProfileRequiresReasoningHistory(input.executionProfile)) {
    return input.request;
  }

  let changed = false;
  const messages = input.request.prompt.messages.map((message) => {
    if (!messageNeedsSyntheticReasoning(message)) {
      return message;
    }

    changed = true;
    return {
      ...message,
      parts: [{
        id: `${message.message.id}:synthetic-reasoning` as typeof message.parts[number]["id"],
        type: "reasoning" as const,
        text: "",
      }, ...message.parts],
    };
  });

  if (!changed) {
    return input.request;
  }

  return {
    ...input.request,
    prompt: {
      ...input.request.prompt,
      messages,
    },
  };
}

export function applyConversationFunctionCallPreferenceToTurnRequest(input: {
  executionProfile: AiExecutionProfileRef;
  request: AiTurnRequest;
}): AiTurnRequest {
  if (readExecutionProfileBooleanMetadata(input.executionProfile, "supportsFunctionCall") !== false) {
    return input.request;
  }

  const sanitizedMessages = input.request.prompt.messages
    .filter((message) => message.message.role !== "tool")
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) =>
        part.type !== "tool_call_ref" && part.type !== "tool_result_ref"
      ),
    }))
    .filter((message) => message.message.role !== "assistant" || message.parts.length > 0);

  const toolsAlreadyDisabled = input.request.prompt.tools.length === 0
    && input.request.settings.toolChoice === "none";
  const historyAlreadySanitized = sanitizedMessages.length === input.request.prompt.messages.length
    && sanitizedMessages.every((message, index) => message.parts.length === input.request.prompt.messages[index]?.parts.length);
  if (toolsAlreadyDisabled && historyAlreadySanitized) {
    return input.request;
  }

  return {
    ...input.request,
    prompt: {
      ...input.request.prompt,
      messages: sanitizedMessages,
      tools: [],
    },
    settings: {
      ...input.request.settings,
      toolChoice: "none",
    },
  };
}

export function applyConversationHistoryPruningToTurnRequest(input: {
  request: AiTurnRequest;
}): AiTurnRequest {
  const pruned = pruneOldToolOutputs({
    messages: input.request.prompt.messages,
    protectRecentUserTurns: TOOL_RESULT_PRUNE_PROTECT_RECENT_USER_TURNS,
    protectTokens: TOOL_RESULT_PRUNE_PROTECT_TOKENS,
    minimumPruneTokens: TOOL_RESULT_PRUNE_MINIMUM_TOKENS,
    protectedToolNames: [],
    clearedOutputText: TOOL_RESULT_PRUNED_OUTPUT_TEXT,
  });

  if (pruned.prunedMessageIds.length === 0) {
    return input.request;
  }

  return {
    ...input.request,
    prompt: {
      ...input.request.prompt,
      messages: [...pruned.messages],
    },
  };
}

export function normalizeProviderFacingTurnRequest(input: {
  executionProfile: AiExecutionProfileRef;
  request: AiTurnRequest;
}): AiTurnRequest {
  return applyConversationHistoryPruningToTurnRequest({
    request: applyConversationReasoningHistoryNormalization({
      executionProfile: input.executionProfile,
      request: applyConversationFunctionCallPreferenceToTurnRequest(input),
    }),
  });
}
