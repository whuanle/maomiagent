import type { ConversationRuntimeEvent } from "#maomiagent/kernel/src/host/application";

import type { RuntimeLogWriteInput } from "../../../../shared/runtime-logs";

export const CHAT_STREAMING_DIAGNOSTIC_MESSAGE = "Chat streaming diagnostic";
export const CHAT_STREAMING_DIAGNOSTIC_CATEGORY = "chat_streaming_diagnostics";

type ChatStreamingRendererPhase =
  | "renderer.first_runtime_event_received"
  | "renderer.first_runtime_event_merged";

type ChatStreamingRendererCorrelation = {
  sessionId: string;
  workspaceId?: string;
  runId?: string;
  turnId?: string;
};

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveChatStreamingRendererCorrelation(input: {
  sessionId: string;
  workspaceId?: string;
  events: readonly ConversationRuntimeEvent[];
}): ChatStreamingRendererCorrelation {
  for (const event of input.events) {
    const runId = normalizeOptionalText(event.runId);
    const turnId = "message" in event
      ? normalizeOptionalText(event.message.turnId)
      : "toolCall" in event
        ? normalizeOptionalText(event.toolCall.turnId)
        : "run" in event
          ? normalizeOptionalText(event.run.currentTurnId)
          : undefined;

    if (runId || turnId) {
      return {
        sessionId: input.sessionId,
        workspaceId: normalizeOptionalText(input.workspaceId),
        runId,
        turnId,
      };
    }
  }

  return {
    sessionId: input.sessionId,
    workspaceId: normalizeOptionalText(input.workspaceId),
  };
}

export function createChatStreamingRendererDiagnostics(input: {
  writeLog: (record: RuntimeLogWriteInput) => Promise<unknown>;
}) {
  const seen = new Set<string>();

  const writePhase = (
    phase: ChatStreamingRendererPhase,
    correlation: ChatStreamingRendererCorrelation,
  ) => {
    const dedupeKey = [
      phase,
      correlation.sessionId,
      correlation.runId ?? "",
      correlation.turnId ?? "",
    ].join(":");
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    void input.writeLog({
      level: "debug",
      source: "mainview",
      module: "chat.streaming-diagnostics",
      message: CHAT_STREAMING_DIAGNOSTIC_MESSAGE,
      context: {
        category: CHAT_STREAMING_DIAGNOSTIC_CATEGORY,
        phase,
        sessionId: correlation.sessionId,
        workspaceId: correlation.workspaceId,
        runId: correlation.runId,
        turnId: correlation.turnId,
        at: Date.now(),
      },
      workspaceId: correlation.workspaceId,
      runId: correlation.runId,
    });
  };

  return {
    recordFirstRuntimeEventReceived(correlation: ChatStreamingRendererCorrelation) {
      writePhase("renderer.first_runtime_event_received", correlation);
    },
    recordFirstRuntimeEventMerged(correlation: ChatStreamingRendererCorrelation) {
      writePhase("renderer.first_runtime_event_merged", correlation);
    },
  };
}
