import type { DesktopConversationSessionStatus } from "../../../shared/desktop-conversation";

export type SessionExecutionOverlayPhase =
  | "sending"
  | "stop_requested"
  | "waiting_stop_confirm"
  | "stop_timeout";

export type SessionExecutionOverlay = {
  sessionId: string;
  phase: SessionExecutionOverlayPhase;
  stopRequestedAt?: string;
  lastRuntimeEventAt?: string;
  lastDetailSyncAt?: string;
  stopAttemptCount: number;
  lastStopError?: string;
};

export type SessionExecutionOverlayState = Record<string, SessionExecutionOverlay>;

function normalizeSessionId(sessionId: string) {
  return sessionId.trim();
}

function getExistingOverlay(
  state: SessionExecutionOverlayState,
  sessionId: string,
) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  return normalizedSessionId ? state[normalizedSessionId] : undefined;
}

function buildBaseOverlay(
  state: SessionExecutionOverlayState,
  sessionId: string,
): SessionExecutionOverlay | null {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  const current = state[normalizedSessionId];
  return {
    sessionId: normalizedSessionId,
    phase: current?.phase ?? "stop_requested",
    stopRequestedAt: current?.stopRequestedAt,
    lastRuntimeEventAt: current?.lastRuntimeEventAt,
    lastDetailSyncAt: current?.lastDetailSyncAt,
    stopAttemptCount: current?.stopAttemptCount ?? 0,
    lastStopError: current?.lastStopError,
  };
}

export function applyStopRequested(
  state: SessionExecutionOverlayState,
  sessionId: string,
  at: string,
): SessionExecutionOverlayState {
  const base = buildBaseOverlay(state, sessionId);
  if (!base) {
    return state;
  }

  return {
    ...state,
    [base.sessionId]: {
      ...base,
      phase: "stop_requested",
      stopRequestedAt: at,
      stopAttemptCount: base.stopAttemptCount + 1,
      lastStopError: undefined,
    },
  };
}

export function applyStopRpcResolved(
  state: SessionExecutionOverlayState,
  sessionId: string,
  input: {
    stopped: boolean;
    detailStatus: DesktopConversationSessionStatus;
    at: string;
  },
): SessionExecutionOverlayState {
  if (input.detailStatus !== "active") {
    return clearExecutionOverlay(state, sessionId);
  }

  const base = buildBaseOverlay(state, sessionId);
  if (!base) {
    return state;
  }

  return {
    ...state,
    [base.sessionId]: {
      ...base,
      phase: "waiting_stop_confirm",
      lastDetailSyncAt: input.at,
    },
  };
}

export function applyStopTimedOut(
  state: SessionExecutionOverlayState,
  sessionId: string,
  message: string,
): SessionExecutionOverlayState {
  const base = buildBaseOverlay(state, sessionId);
  if (!base) {
    return state;
  }

  return {
    ...state,
    [base.sessionId]: {
      ...base,
      phase: "stop_timeout",
      lastStopError: message,
    },
  };
}

export function recordRuntimeEventActivity(
  state: SessionExecutionOverlayState,
  sessionId: string,
  at: string,
): SessionExecutionOverlayState {
  const overlay = getExistingOverlay(state, sessionId);
  if (!overlay) {
    return state;
  }

  return {
    ...state,
    [overlay.sessionId]: {
      ...overlay,
      lastRuntimeEventAt: at,
    },
  };
}

export function clearExecutionOverlay(
  state: SessionExecutionOverlayState,
  sessionId: string,
): SessionExecutionOverlayState {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId || !state[normalizedSessionId]) {
    return state;
  }

  const next = { ...state };
  delete next[normalizedSessionId];
  return next;
}

export function shouldWaitForStopConfirmation(
  overlay: SessionExecutionOverlay | undefined,
) {
  return overlay?.phase === "stop_requested" || overlay?.phase === "waiting_stop_confirm";
}

export function resolveSessionExecutionView(input: {
  detailStatus?: DesktopConversationSessionStatus;
  overlay?: SessionExecutionOverlay;
}) {
  const phase = input.overlay?.phase;
  const detailActive = input.detailStatus === "active";

  return {
    isExecuting: detailActive || phase === "sending" || shouldWaitForStopConfirmation(input.overlay) || phase === "stop_timeout",
    isStopping: shouldWaitForStopConfirmation(input.overlay),
    phase,
  };
}
