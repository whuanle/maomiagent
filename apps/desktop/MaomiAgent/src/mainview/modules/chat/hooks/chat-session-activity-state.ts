export type ChatSessionFlagState = Record<string, true>;
export type ChatSessionReplyingState = Record<string, string>;

function normalizeSessionId(sessionId: string | undefined | null) {
  return sessionId?.trim() ?? "";
}

export function setSessionFlag(
  state: ChatSessionFlagState,
  sessionId: string,
): ChatSessionFlagState {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId || state[normalizedSessionId]) {
    return state;
  }

  return {
    ...state,
    [normalizedSessionId]: true,
  };
}

export function removeSessionFlag(
  state: ChatSessionFlagState,
  sessionId: string,
): ChatSessionFlagState {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId || !state[normalizedSessionId]) {
    return state;
  }

  const next = { ...state };
  delete next[normalizedSessionId];
  return next;
}

export function hasSessionFlag(
  state: ChatSessionFlagState,
  sessionId: string | undefined | null,
) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  return Boolean(normalizedSessionId && state[normalizedSessionId]);
}

export function markSessionReplying(
  state: ChatSessionReplyingState,
  sessionId: string,
  interactionId: string,
): ChatSessionReplyingState {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId || state[normalizedSessionId] === interactionId) {
    return state;
  }

  return {
    ...state,
    [normalizedSessionId]: interactionId,
  };
}

export function clearSessionReplying(
  state: ChatSessionReplyingState,
  sessionId: string,
): ChatSessionReplyingState {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId || !state[normalizedSessionId]) {
    return state;
  }

  const next = { ...state };
  delete next[normalizedSessionId];
  return next;
}

export function resolveSelectedSessionActivity(input: {
  selectedSessionId?: string;
  sendingSessionIds: ChatSessionFlagState;
  stoppingSessionIds: ChatSessionFlagState;
  replyingInteractionIdsBySessionId: ChatSessionReplyingState;
}) {
  const selectedSessionId = normalizeSessionId(input.selectedSessionId);

  return {
    sendingMessage: Boolean(selectedSessionId && input.sendingSessionIds[selectedSessionId]),
    stoppingMessage: Boolean(selectedSessionId && input.stoppingSessionIds[selectedSessionId]),
    replyingInteractionId: selectedSessionId
      ? input.replyingInteractionIdsBySessionId[selectedSessionId] ?? null
      : null,
  };
}
