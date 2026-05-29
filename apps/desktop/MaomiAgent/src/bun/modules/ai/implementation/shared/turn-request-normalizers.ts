import { pruneOldToolOutputs } from "#maomiagent/kernel/src/core/algorithms/context/tool-output-pruner";

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
    request: applyConversationFunctionCallPreferenceToTurnRequest(input),
  });
}
