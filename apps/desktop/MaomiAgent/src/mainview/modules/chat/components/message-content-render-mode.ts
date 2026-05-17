export type ConversationMessageContentRenderMode = "full" | "lite";

export type ConversationMessageContentRenderReason =
  | "content-length"
  | "line-count";

export type ConversationMessageContentRenderPlan = {
  mode: ConversationMessageContentRenderMode;
  contentLength: number;
  lineCount: number;
  reason?: ConversationMessageContentRenderReason;
};

export const CONVERSATION_MESSAGE_CONTENT_MAX_FULL_LENGTH = 18_000;
export const CONVERSATION_MESSAGE_CONTENT_MAX_FULL_LINES = 420;

function normalizeConversationMessageContent(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function countConversationMessageLines(content: string) {
  if (!content) {
    return 0;
  }

  let count = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      count += 1;
    }
  }

  return count;
}

export function resolveConversationMessageContentRenderPlan(
  content: string,
): ConversationMessageContentRenderPlan {
  const normalizedContent = normalizeConversationMessageContent(content);
  const contentLength = normalizedContent.length;
  const lineCount = countConversationMessageLines(normalizedContent);

  if (!normalizedContent.trim()) {
    return {
      mode: "full",
      contentLength,
      lineCount,
    };
  }

  if (contentLength >= CONVERSATION_MESSAGE_CONTENT_MAX_FULL_LENGTH) {
    return {
      mode: "lite",
      contentLength,
      lineCount,
      reason: "content-length",
    };
  }

  if (lineCount >= CONVERSATION_MESSAGE_CONTENT_MAX_FULL_LINES) {
    return {
      mode: "lite",
      contentLength,
      lineCount,
      reason: "line-count",
    };
  }

  return {
    mode: "full",
    contentLength,
    lineCount,
  };
}