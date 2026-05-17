import type { DesktopConversationSessionItem } from "../../../../shared/desktop-conversation";

export function resolveNextSessionId(
  items: DesktopConversationSessionItem[],
  currentSessionId: string | undefined,
  preferredSessionId?: string,
) {
  if (items.length === 0) {
    return undefined;
  }

  if (preferredSessionId && items.some((item) => item.sessionId === preferredSessionId)) {
    return preferredSessionId;
  }

  if (currentSessionId && items.some((item) => item.sessionId === currentSessionId)) {
    return currentSessionId;
  }

  return items[0]?.sessionId;
}

export function resolvePreferredSessionIdForRuntimeReload(input: {
  currentSessionId?: string;
  runtimeSessionId: string;
}) {
  const runtimeSessionId = input.runtimeSessionId.trim();
  if (!runtimeSessionId) {
    return undefined;
  }

  const currentSessionId = input.currentSessionId?.trim();
  if (!currentSessionId || currentSessionId === runtimeSessionId) {
    return runtimeSessionId;
  }

  return undefined;
}