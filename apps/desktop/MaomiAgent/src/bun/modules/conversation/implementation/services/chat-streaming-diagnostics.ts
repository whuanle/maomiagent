import type {
  DesktopAiProviderTelemetryEvent,
} from "../../../ai/abstraction/models/desktop-ai-runtime.models";
import type {
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetail,
  DesktopConversationSessionDetailUpdateReason,
} from "../../index";

export const CHAT_STREAMING_DIAGNOSTIC_CATEGORY = "chat_streaming_diagnostics";
export const CHAT_STREAMING_DIAGNOSTIC_MESSAGE = "Chat streaming diagnostic";

export type ChatStreamingFirstPhase =
  | "provider.request_sent"
  | "provider.first_byte"
  | "provider.first_protocol_frame"
  | "provider.first_ai_event"
  | "conversation.first_runtime_event_publish"
  | "conversation.first_message_part_publish";

export type ChatStreamingDetailPhase =
  | "conversation.detail_loaded"
  | "conversation.detail_published";

export type ChatStreamingDiagnosticPhase =
  | ChatStreamingFirstPhase
  | ChatStreamingDetailPhase;

type ChatStreamingRunContext = {
  sessionId?: string;
  workspaceId?: string;
  runId?: string;
  turnId?: string;
};

type ChatStreamingRunState = {
  context: ChatStreamingRunContext;
  requestSentAt?: number;
  firstPhases: Partial<Record<ChatStreamingFirstPhase, number>>;
};

export type ChatStreamingDiagnosticLogContext = {
  category: typeof CHAT_STREAMING_DIAGNOSTIC_CATEGORY;
  phase: ChatStreamingDiagnosticPhase;
  sessionId?: string;
  workspaceId?: string;
  runId?: string;
  turnId?: string;
  at: number;
  elapsedMsFromRequestSent?: number;
  runtimeEventType?: string;
  detailPublishReason?: DesktopConversationSessionDetailUpdateReason;
  detailLoadElapsedMs?: number;
  detailPublishElapsedMs?: number;
  detailMessageCount?: number;
  detailToolCallCount?: number;
  detailInteractionCount?: number;
  providerStage?: DesktopAiProviderTelemetryEvent["stage"];
  providerStatus?: number;
  providerContentType?: string;
  providerRequestDurationMs?: number;
  providerFirstByteLatencyMs?: number;
  providerFirstEventLatencyMs?: number;
};

export function buildChatStreamingDiagnosticContext(input: {
  phase: ChatStreamingDiagnosticPhase;
  state?: Pick<ChatStreamingRunState, "requestSentAt">;
  context?: ChatStreamingRunContext;
  at: number;
  extra?: Omit<
    ChatStreamingDiagnosticLogContext,
    "category" | "phase" | "sessionId" | "workspaceId" | "runId" | "turnId" | "at" | "elapsedMsFromRequestSent"
  >;
}): ChatStreamingDiagnosticLogContext {
  return {
    category: CHAT_STREAMING_DIAGNOSTIC_CATEGORY,
    phase: input.phase,
    sessionId: input.context?.sessionId,
    workspaceId: input.context?.workspaceId,
    runId: input.context?.runId,
    turnId: input.context?.turnId,
    at: input.at,
    ...(typeof input.state?.requestSentAt === "number"
      ? { elapsedMsFromRequestSent: Math.max(0, input.at - input.state.requestSentAt) }
      : {}),
    ...(input.extra ?? {}),
  };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toProviderPhase(
  stage: DesktopAiProviderTelemetryEvent["stage"],
): ChatStreamingFirstPhase | undefined {
  switch (stage) {
    case "request_sent":
      return "provider.request_sent";
    case "first_byte":
      return "provider.first_byte";
    case "first_protocol_frame":
      return "provider.first_protocol_frame";
    case "first_ai_event":
      return "provider.first_ai_event";
    default:
      return undefined;
  }
}

function resolveRuntimeEventCorrelation(
  update: DesktopConversationRuntimeEventsUpdateEvent,
): ChatStreamingRunContext {
  for (const event of update.events) {
    const runId = normalizeOptionalText(event.runId);
    const turnId = "message" in event
      ? normalizeOptionalText(event.message.turnId)
      : "toolCall" in event
        ? normalizeOptionalText(event.toolCall.turnId)
        : "run" in event
          ? normalizeOptionalText(event.run.currentTurnId)
          : "interaction" in event
            ? normalizeOptionalText(event.interaction.runId)
            : undefined;

    if (runId || turnId) {
      return {
        sessionId: update.sessionId,
        workspaceId: normalizeOptionalText(update.workspaceId),
        runId,
        turnId,
      };
    }
  }

  return {
    sessionId: update.sessionId,
    workspaceId: normalizeOptionalText(update.workspaceId),
  };
}

export class ChatStreamingDiagnosticsTracker {
  private readonly runStates = new Map<string, ChatStreamingRunState>();

  private getRunState(runId: string) {
    let state = this.runStates.get(runId);
    if (!state) {
      state = {
        context: {
          runId,
        },
        firstPhases: {},
      };
      this.runStates.set(runId, state);
    }

    return state;
  }

  private updateRunContext(runId: string, patch: ChatStreamingRunContext) {
    const state = this.getRunState(runId);
    state.context = {
      ...state.context,
      ...(patch.sessionId ? { sessionId: patch.sessionId } : {}),
      ...(patch.workspaceId ? { workspaceId: patch.workspaceId } : {}),
      ...(patch.turnId ? { turnId: patch.turnId } : {}),
      ...(patch.runId ? { runId: patch.runId } : {}),
    };
    return state;
  }

  private recordFirstPhase(input: {
    phase: ChatStreamingFirstPhase;
    at: number;
    runId: string;
  }) {
    const state = this.getRunState(input.runId);
    if (state.firstPhases[input.phase] !== undefined) {
      return undefined;
    }

    state.firstPhases[input.phase] = input.at;
    if (input.phase === "provider.request_sent") {
      state.requestSentAt = input.at;
    }

    return state;
  }

  recordProviderTelemetry(event: DesktopAiProviderTelemetryEvent, at: number) {
    const phase = toProviderPhase(event.stage);
    const runId = normalizeOptionalText(event.runId);
    if (!phase || !runId) {
      return [];
    }

    const state = this.getRunState(runId);
    const recordedState = this.recordFirstPhase({ phase, at, runId });
    if (!recordedState) {
      return [];
    }

    return [buildChatStreamingDiagnosticContext({
      phase,
      state: recordedState,
      context: state.context,
      at,
      extra: {
        providerStage: event.stage,
        providerStatus: event.status,
        providerContentType: event.contentType,
        providerRequestDurationMs: event.requestDurationMs,
        providerFirstByteLatencyMs: event.firstByteLatencyMs,
        providerFirstEventLatencyMs: event.firstEventLatencyMs,
      },
    })];
  }

  associateRunContext(input: ChatStreamingRunContext) {
    const runId = normalizeOptionalText(input.runId);
    if (!runId) {
      return [];
    }

    this.updateRunContext(runId, input);
    return [];
  }

  recordRuntimeEventsPublished(update: DesktopConversationRuntimeEventsUpdateEvent, at: number) {
    const contexts: ChatStreamingDiagnosticLogContext[] = [];
    const correlation = resolveRuntimeEventCorrelation(update);
    const runId = normalizeOptionalText(correlation.runId);
    if (runId) {
      contexts.push(...this.associateRunContext(correlation));
    }

    if (!runId) {
      return contexts;
    }

    const runtimePublishState = this.recordFirstPhase({
      phase: "conversation.first_runtime_event_publish",
      at,
      runId,
    });
    if (runtimePublishState) {
      const primaryRuntimeEvent = update.events[0];
      contexts.push(buildChatStreamingDiagnosticContext({
        phase: "conversation.first_runtime_event_publish",
        state: runtimePublishState,
        context: runtimePublishState.context,
        at,
        extra: {
          runtimeEventType: primaryRuntimeEvent?.type,
        },
      }));
    }

    if (update.events.some((event) => event.type === "message.parts.appended")) {
      const messagePartState = this.recordFirstPhase({
        phase: "conversation.first_message_part_publish",
        at,
        runId,
      });
      if (messagePartState) {
        contexts.push(buildChatStreamingDiagnosticContext({
          phase: "conversation.first_message_part_publish",
          state: messagePartState,
          context: messagePartState.context,
          at,
          extra: {
            runtimeEventType: "message.parts.appended",
          },
        }));
      }
    }

    return contexts;
  }

  buildDetailLoadedContext(input: {
    detail: DesktopConversationSessionDetail;
    at: number;
    elapsedMs: number;
  }) {
    const runId = normalizeOptionalText(input.detail.runs.at(-1)?.id);
    const state = runId ? this.updateRunContext(runId, {
      sessionId: input.detail.sessionId,
      workspaceId: input.detail.workspaceId,
      runId,
      turnId: normalizeOptionalText(input.detail.runs.at(-1)?.currentTurnId),
    }) : undefined;
    return buildChatStreamingDiagnosticContext({
      phase: "conversation.detail_loaded",
      state,
      context: state?.context ?? {
        sessionId: input.detail.sessionId,
        workspaceId: input.detail.workspaceId,
        runId,
        turnId: normalizeOptionalText(input.detail.runs.at(-1)?.currentTurnId),
      },
      at: input.at,
      extra: {
        detailLoadElapsedMs: input.elapsedMs,
        detailMessageCount: input.detail.messages.length,
        detailToolCallCount: input.detail.toolCalls.length,
        detailInteractionCount: input.detail.interactions.length,
      },
    });
  }

  buildDetailPublishedContext(input: {
    detail: DesktopConversationSessionDetail;
    reason: DesktopConversationSessionDetailUpdateReason;
    at: number;
    elapsedMs: number;
  }) {
    const runId = normalizeOptionalText(input.detail.runs.at(-1)?.id);
    const state = runId ? this.updateRunContext(runId, {
      sessionId: input.detail.sessionId,
      workspaceId: input.detail.workspaceId,
      runId,
      turnId: normalizeOptionalText(input.detail.runs.at(-1)?.currentTurnId),
    }) : undefined;
    return buildChatStreamingDiagnosticContext({
      phase: "conversation.detail_published",
      state,
      context: state?.context ?? {
        sessionId: input.detail.sessionId,
        workspaceId: input.detail.workspaceId,
        runId,
        turnId: normalizeOptionalText(input.detail.runs.at(-1)?.currentTurnId),
      },
      at: input.at,
      extra: {
        detailPublishReason: input.reason,
        detailPublishElapsedMs: input.elapsedMs,
        detailMessageCount: input.detail.messages.length,
        detailToolCallCount: input.detail.toolCalls.length,
        detailInteractionCount: input.detail.interactions.length,
      },
    });
  }
}
