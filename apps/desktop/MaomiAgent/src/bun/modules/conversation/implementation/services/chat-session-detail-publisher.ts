export type ChatSessionDetailPublishRequest = {
  kind: "progress" | "final";
  sessionId: string;
  turnStartedAt: number;
  structuralChange: boolean;
};

export type ChatSessionDetailPublishDecision =
  | {
      kind: "publish_now";
    }
  | {
      kind: "delay";
      delayMs: number;
      dueAt: number;
    };

type ChatSessionDetailPublisherOptions = {
  now?: () => number;
};

type ChatSessionDetailPublisherState = {
  lastProgressPublishedAt?: number;
  pendingDueAt?: number;
};

const EARLY_PROGRESS_THROTTLE_MS = 250;
const MID_PROGRESS_THROTTLE_MS = 500;
const LATE_PROGRESS_THROTTLE_MS = 1_000;
const EARLY_PROGRESS_WINDOW_MS = 3_000;
const MID_PROGRESS_WINDOW_MS = 15_000;

export class ChatSessionDetailPublisher {
  private readonly now: () => number;
  private readonly states = new Map<string, ChatSessionDetailPublisherState>();

  constructor(options: ChatSessionDetailPublisherOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  request(input: ChatSessionDetailPublishRequest): ChatSessionDetailPublishDecision {
    const sessionId = input.sessionId.trim();
    if (!sessionId) {
      return { kind: "publish_now" };
    }

    const state = this.getState(sessionId);
    const now = this.now();

    if (input.kind === "final") {
      state.pendingDueAt = undefined;
      return { kind: "publish_now" };
    }

    if (input.structuralChange) {
      state.lastProgressPublishedAt = now;
      state.pendingDueAt = undefined;
      return { kind: "publish_now" };
    }

    const throttleWindowMs = this.resolveThrottleWindowMs(Math.max(0, now - input.turnStartedAt));
    const nextAllowedAt = (state.lastProgressPublishedAt ?? Number.NEGATIVE_INFINITY) + throttleWindowMs;
    if (now >= nextAllowedAt) {
      state.lastProgressPublishedAt = now;
      state.pendingDueAt = undefined;
      return { kind: "publish_now" };
    }

    const dueAt = state.pendingDueAt === undefined
      ? nextAllowedAt
      : Math.min(state.pendingDueAt, nextAllowedAt);
    state.pendingDueAt = dueAt;
    return {
      kind: "delay",
      delayMs: Math.max(1, dueAt - now),
      dueAt,
    };
  }

  consumeScheduledPublish(sessionId: string): void {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }

    const state = this.getState(normalizedSessionId);
    state.lastProgressPublishedAt = this.now();
    state.pendingDueAt = undefined;
  }

  clearSession(sessionId: string): void {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }

    this.states.delete(normalizedSessionId);
  }

  private getState(sessionId: string): ChatSessionDetailPublisherState {
    let state = this.states.get(sessionId);
    if (!state) {
      state = {};
      this.states.set(sessionId, state);
    }

    return state;
  }

  private resolveThrottleWindowMs(turnAgeMs: number): number {
    if (turnAgeMs < EARLY_PROGRESS_WINDOW_MS) {
      return EARLY_PROGRESS_THROTTLE_MS;
    }
    if (turnAgeMs < MID_PROGRESS_WINDOW_MS) {
      return MID_PROGRESS_THROTTLE_MS;
    }
    return LATE_PROGRESS_THROTTLE_MS;
  }
}
