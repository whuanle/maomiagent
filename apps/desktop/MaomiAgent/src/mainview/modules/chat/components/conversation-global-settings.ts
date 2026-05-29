import {
  DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_DEFAULT as DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX as CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
  DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN as CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN,
  clampDesktopConversationContextCompressionThresholdPercent,
} from "../../../../shared/desktop-conversation";

export {
  DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
};

export type ConversationGlobalSettings = {
  approvalAutoEnabled: boolean;
  contextCompressionThresholdPercent: number;
};

export function clampContextCompressionThresholdPercent(value: unknown) {
  return clampDesktopConversationContextCompressionThresholdPercent(value);
}

export function readConversationGlobalSettings(): ConversationGlobalSettings {
  return {
    approvalAutoEnabled: true,
    contextCompressionThresholdPercent: DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  };
}

export function writeConversationGlobalSettings(
  input: Partial<ConversationGlobalSettings>,
): ConversationGlobalSettings {
  return {
    approvalAutoEnabled: input.approvalAutoEnabled ?? true,
    contextCompressionThresholdPercent: clampContextCompressionThresholdPercent(
      input.contextCompressionThresholdPercent ?? DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
    ),
  };
}
