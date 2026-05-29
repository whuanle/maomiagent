import type {
  DesktopAiProviderTelemetryEvent,
  DesktopAiProviderTelemetrySink,
} from "../../abstraction/models/desktop-ai-runtime.models";
import type {
  AiTurnEvent,
  AiTurnRequest,
  KernelError,
} from "../../kernel-bridge";
import type {
  DesktopAiProtocolDriver,
  ProtocolTransportFrame,
  ProtocolTurnStageTimeouts,
} from "./provider-protocol-driver";
import type { DesktopAiProviderServiceConfig } from "../../abstraction/models/desktop-ai-runtime.models";

type ProtocolTurnStageTimeoutPhase = "first_byte" | "first_event" | "stream_idle";

type ProtocolTurnStageTimeoutError = {
  kind: "stage_timeout";
  phase: ProtocolTurnStageTimeoutPhase;
  timeoutMs: number;
};

function isKernelError(value: unknown): value is KernelError {
  return Boolean(
    value
      && typeof value === "object"
      && "code" in value
      && typeof (value as { code?: unknown }).code === "string"
      && "message" in value
      && typeof (value as { message?: unknown }).message === "string",
  );
}

function createProtocolTurnTimeoutError(input: {
  phase: ProtocolTurnStageTimeoutPhase;
  timeoutMs: number;
  requestDurationMs: number;
  firstByteLatencyMs?: number;
  firstEventLatencyMs?: number;
  driverId: string;
}): KernelError {
  const code = input.phase === "first_byte"
    ? "provider_first_byte_timeout"
    : input.phase === "first_event"
      ? "provider_first_event_timeout"
      : "provider_stream_idle_timeout";
  const phaseLabel = input.phase.replaceAll("_", " ");

  return {
    code,
    message: `Provider ${phaseLabel} timeout after ${input.timeoutMs}ms.`,
    retryable: true,
    metadata: {
      phase: input.phase,
      timeoutMs: input.timeoutMs,
      requestDurationMs: input.requestDurationMs,
      ...(typeof input.firstByteLatencyMs === "number"
        ? { firstByteLatencyMs: input.firstByteLatencyMs }
        : {}),
      ...(typeof input.firstEventLatencyMs === "number"
        ? { firstEventLatencyMs: input.firstEventLatencyMs }
        : {}),
      driverId: input.driverId,
    },
  };
}

function createAbortedTurnError(): KernelError {
  return {
    code: "conversation_turn_aborted",
    message: "Desktop conversation reply was stopped.",
    retryable: false,
  };
}

function normalizeProtocolTurnError(input: {
  error: unknown;
  driverId: string;
}): KernelError {
  if (isKernelError(input.error)) {
    return input.error;
  }

  if (input.error instanceof Error) {
    return {
      code: "provider_turn_failed",
      message: input.error.message,
      retryable: false,
      metadata: {
        driverId: input.driverId,
      },
    };
  }

  return {
    code: "provider_turn_failed",
    message: "Provider turn execution failed.",
    retryable: false,
    metadata: {
      driverId: input.driverId,
    },
  };
}

async function emitTelemetry(
  sink: DesktopAiProviderTelemetrySink | undefined,
  event: DesktopAiProviderTelemetryEvent,
): Promise<void> {
  if (!sink) {
    return;
  }

  try {
    await sink(event);
  } catch {
    // Telemetry must not break provider execution.
  }
}

function createTimeoutPromise(input: {
  timeoutMs: number;
  phase: ProtocolTurnStageTimeoutPhase;
}): {
  promise: Promise<never>;
  cancel: () => void;
} {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return {
    promise: new Promise<never>((_, reject) => {
      handle = setTimeout(() => {
        reject({
          kind: "stage_timeout",
          phase: input.phase,
          timeoutMs: input.timeoutMs,
        } satisfies ProtocolTurnStageTimeoutError);
      }, input.timeoutMs);
    }),
    cancel: () => {
      if (handle !== undefined) {
        clearTimeout(handle);
      }
    },
  };
}

function createAbortPromise(signal: AbortSignal | undefined): Promise<never> | undefined {
  if (!signal) {
    return undefined;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortedTurnError());
  }

  return new Promise<never>((_, reject) => {
    const listener = () => {
      signal.removeEventListener("abort", listener);
      reject(createAbortedTurnError());
    };
    signal.addEventListener("abort", listener, { once: true });
  });
}

function pickNextStageTimeout(input: {
  stageTimeouts: ProtocolTurnStageTimeouts;
  requestStartedAt: number;
  lastActivityAt: number;
  sawTransportPayload: boolean;
  sawAiEvent: boolean;
  now: number;
}): {
  phase: ProtocolTurnStageTimeoutPhase;
  timeoutMs: number;
} | undefined {
  const candidates: Array<{
    phase: ProtocolTurnStageTimeoutPhase;
    remainingMs: number;
  }> = [];

  if (!input.sawTransportPayload && typeof input.stageTimeouts.firstByteMs === "number") {
    candidates.push({
      phase: "first_byte",
      remainingMs: input.stageTimeouts.firstByteMs - (input.now - input.requestStartedAt),
    });
  }

  if (!input.sawAiEvent && typeof input.stageTimeouts.firstEventMs === "number") {
    candidates.push({
      phase: "first_event",
      remainingMs: input.stageTimeouts.firstEventMs - (input.now - input.requestStartedAt),
    });
  }

  if (input.sawAiEvent && typeof input.stageTimeouts.idleMs === "number") {
    candidates.push({
      phase: "stream_idle",
      remainingMs: input.stageTimeouts.idleMs - (input.now - input.lastActivityAt),
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((left, right) => left.remainingMs - right.remainingMs);
  const selected = candidates[0]!;
  return {
    phase: selected.phase,
    timeoutMs: Math.max(0, selected.remainingMs),
  };
}

async function nextProtocolTransportFrame(input: {
  iterator: AsyncIterator<ProtocolTransportFrame>;
  signal?: AbortSignal;
  stageTimeout?: {
    phase: ProtocolTurnStageTimeoutPhase;
    timeoutMs: number;
  };
}): Promise<IteratorResult<ProtocolTransportFrame>> {
  const nextPromise = input.iterator.next();
  const timeout = input.stageTimeout ? createTimeoutPromise(input.stageTimeout) : undefined;
  const abortPromise = createAbortPromise(input.signal);

  try {
    return await Promise.race([
      nextPromise,
      ...(timeout ? [timeout.promise] : []),
      ...(abortPromise ? [abortPromise] : []),
    ]);
  } finally {
    timeout?.cancel();
  }
}

async function closeIterator(iterator: AsyncIterator<ProtocolTransportFrame>): Promise<void> {
  try {
    await iterator.return?.();
  } catch {
    // Best-effort cleanup.
  }
}

function buildTelemetryBase(input: {
  request: AiTurnRequest;
}): Omit<DesktopAiProviderTelemetryEvent, "stage"> {
  return {
    modelId: input.request.executionProfile.modelId,
    runId: input.request.trace?.runId ?? input.request.prompt.runId,
    turnId: input.request.trace?.turnId ?? input.request.prompt.turnId,
  };
}

export async function* runProtocolTurn(input: {
  request: AiTurnRequest;
  config: DesktopAiProviderServiceConfig;
  driver: DesktopAiProtocolDriver;
  telemetrySink?: DesktopAiProviderTelemetrySink;
  stageTimeouts: ProtocolTurnStageTimeouts;
}): AsyncIterable<AiTurnEvent> {
  const requestStartedAt = Date.now();
  const telemetryBase = buildTelemetryBase({
    request: input.request,
  });

  await emitTelemetry(input.telemetrySink, {
    stage: "request_built",
    ...telemetryBase,
  });

  let frames: AsyncIterable<ProtocolTransportFrame>;
  try {
    frames = await input.driver.execute({
      request: input.request,
      config: input.config,
      signal: input.request.signal,
      telemetrySink: input.telemetrySink,
      stageTimeouts: input.stageTimeouts,
    });
  } catch (error) {
    yield {
      type: "error",
      error: normalizeProtocolTurnError({
        error,
        driverId: input.driver.id,
      }),
    };
    await emitTelemetry(input.telemetrySink, {
      stage: "stream_finished",
      ...telemetryBase,
      requestDurationMs: Date.now() - requestStartedAt,
    });
    return;
  }

  await emitTelemetry(input.telemetrySink, {
    stage: "request_sent",
    ...telemetryBase,
  });

  const iterator = frames[Symbol.asyncIterator]();
  let lastActivityAt = requestStartedAt;
  let firstByteAt: number | undefined;
  let firstEventAt: number | undefined;
  let sawTransportPayload = false;
  let sawProtocolFrame = false;
  let sawAiEvent = false;

  try {
    while (true) {
      const stageTimeout = pickNextStageTimeout({
        stageTimeouts: input.stageTimeouts,
        requestStartedAt,
        lastActivityAt,
        sawTransportPayload,
        sawAiEvent,
        now: Date.now(),
      });

      const next = await nextProtocolTransportFrame({
        iterator,
        signal: input.request.signal,
        stageTimeout,
      });
      if (next.done) {
        break;
      }

      lastActivityAt = Date.now();
      const frame = next.value;

      if (frame.kind === "headers") {
        await emitTelemetry(input.telemetrySink, {
          stage: "response_headers",
          ...telemetryBase,
          status: frame.status,
          contentType: frame.contentType,
          requestDurationMs: lastActivityAt - requestStartedAt,
        });
        continue;
      }

      if (!sawTransportPayload) {
        sawTransportPayload = true;
        firstByteAt = lastActivityAt;
        await emitTelemetry(input.telemetrySink, {
          stage: "first_byte",
          ...telemetryBase,
          requestDurationMs: lastActivityAt - requestStartedAt,
          firstByteLatencyMs: lastActivityAt - requestStartedAt,
        });
      }

      if (!sawProtocolFrame) {
        sawProtocolFrame = true;
        await emitTelemetry(input.telemetrySink, {
          stage: "first_protocol_frame",
          ...telemetryBase,
          requestDurationMs: lastActivityAt - requestStartedAt,
          ...(typeof firstByteAt === "number"
            ? { firstByteLatencyMs: firstByteAt - requestStartedAt }
            : {}),
        });
      }

      if (frame.kind === "byte") {
        continue;
      }

      if (!sawAiEvent) {
        sawAiEvent = true;
        firstEventAt = lastActivityAt;
        await emitTelemetry(input.telemetrySink, {
          stage: "first_ai_event",
          ...telemetryBase,
          requestDurationMs: lastActivityAt - requestStartedAt,
          ...(typeof firstByteAt === "number"
            ? { firstByteLatencyMs: firstByteAt - requestStartedAt }
            : {}),
          firstEventLatencyMs: lastActivityAt - requestStartedAt,
        });
      }

      yield frame.event;
    }
  } catch (error) {
    await closeIterator(iterator);
    const now = Date.now();
    if (
      error
      && typeof error === "object"
      && "kind" in error
      && (error as { kind?: unknown }).kind === "stage_timeout"
    ) {
      const timeoutError = error as ProtocolTurnStageTimeoutError;
      yield {
        type: "error",
        error: createProtocolTurnTimeoutError({
          phase: timeoutError.phase,
          timeoutMs: timeoutError.timeoutMs,
          requestDurationMs: now - requestStartedAt,
          ...(typeof firstByteAt === "number"
            ? { firstByteLatencyMs: firstByteAt - requestStartedAt }
            : {}),
          ...(typeof firstEventAt === "number"
            ? { firstEventLatencyMs: firstEventAt - requestStartedAt }
            : {}),
          driverId: input.driver.id,
        }),
      };
    } else {
      yield {
        type: "error",
        error: normalizeProtocolTurnError({
          error,
          driverId: input.driver.id,
        }),
      };
    }
    await emitTelemetry(input.telemetrySink, {
      stage: "stream_finished",
      ...telemetryBase,
      requestDurationMs: now - requestStartedAt,
      ...(typeof firstByteAt === "number"
        ? { firstByteLatencyMs: firstByteAt - requestStartedAt }
        : {}),
      ...(typeof firstEventAt === "number"
        ? { firstEventLatencyMs: firstEventAt - requestStartedAt }
        : {}),
    });
    return;
  }

  const finishedAt = Date.now();
  await emitTelemetry(input.telemetrySink, {
    stage: "stream_finished",
    ...telemetryBase,
    requestDurationMs: finishedAt - requestStartedAt,
    ...(typeof firstByteAt === "number"
      ? { firstByteLatencyMs: firstByteAt - requestStartedAt }
      : {}),
    ...(typeof firstEventAt === "number"
      ? { firstEventLatencyMs: firstEventAt - requestStartedAt }
      : {}),
  });
}
