import type { RuntimeLogWriteInput } from "../../shared/runtime-logs";
import {
  DESKTOP_LOGS_BRIDGE_READY_EVENT,
  hasDesktopLogsBridge,
  writeRuntimeLog,
} from "./desktop-runtime-logs";

const MAX_PENDING_LOGS = 100;
const RENDERER_RUNTIME_LOG_SOURCE = "mainview";
const RENDERER_RUNTIME_LOG_MODULE = "desktop.mainview.runtime";
const RENDERER_RUNTIME_LOGGING_MARKER = "__maomiRendererRuntimeErrorLoggingInstalled";

type RendererRuntimeErrorLoggerInput = {
  hasBridge: () => boolean;
  writeLog: (input: RuntimeLogWriteInput) => Promise<unknown>;
  onWriteFailure?: (error: unknown) => void;
};

type RendererWindowErrorInput = {
  message?: string;
  error?: unknown;
  filename?: string;
  lineno?: number;
  colno?: number;
};

type ConsoleArgumentSummary =
  | string
  | number
  | boolean
  | null
  | {
    type: "error" | "reactErrorInfo" | "object";
    name?: string;
    message?: string;
    stack?: string;
    componentStack?: string;
    value?: string;
  };

declare global {
  interface Window {
    __maomiRendererRuntimeErrorLoggingInstalled?: boolean;
  }
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function summarizeThrowable(value: unknown, fallback: string): string {
  if (value instanceof Error) {
    const message = trimText(value.message);
    if (message) {
      return message;
    }

    const name = trimText(value.name);
    if (name) {
      return name;
    }
  }

  if (typeof value === "string") {
    const text = trimText(value);
    if (text) {
      return text;
    }
  }

  if (value !== undefined && value !== null) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Ignore serialization failures and fall back to String(value).
    }

    const text = trimText(String(value));
    if (text && text !== "[object Object]") {
      return text;
    }
  }

  return fallback;
}

function extractStack(value: unknown): string | undefined {
  if (value instanceof Error) {
    return trimText(value.stack);
  }

  if (value && typeof value === "object" && "stack" in value) {
    const stack = (value as { stack?: unknown }).stack;
    return typeof stack === "string" ? trimText(stack) : undefined;
  }

  return undefined;
}

function normalizeConsoleArgument(value: unknown): ConsoleArgumentSummary {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null) {
    return null;
  }

  if (value instanceof Error) {
    return {
      type: "error",
      ...(trimText(value.name) ? { name: trimText(value.name) } : {}),
      ...(trimText(value.message) ? { message: trimText(value.message) } : {}),
      ...(trimText(value.stack) ? { stack: trimText(value.stack) } : {}),
    };
  }

  if (value && typeof value === "object" && "componentStack" in value) {
    const componentStack = trimText((value as { componentStack?: unknown }).componentStack as string | undefined);
    return {
      type: "reactErrorInfo",
      ...(componentStack ? { componentStack } : {}),
    };
  }

  return {
    type: "object",
    value: summarizeThrowable(value, "[unserializable value]"),
  };
}

function extractConsoleError(args: unknown[]): unknown {
  const runtimeError = args.find((value) => value instanceof Error);
  if (runtimeError) {
    return runtimeError;
  }

  const stackCarrier = args.find((value) => extractStack(value));
  return stackCarrier;
}

function buildConsoleErrorLog(args: unknown[]): RuntimeLogWriteInput {
  const runtimeError = extractConsoleError(args);
  const message = trimText(
    args.find((value): value is string => typeof value === "string" && Boolean(trimText(value))),
  ) ?? summarizeThrowable(runtimeError, "Renderer console error");

  return {
    level: "error",
    source: RENDERER_RUNTIME_LOG_SOURCE,
    module: RENDERER_RUNTIME_LOG_MODULE,
    message,
    stack: extractStack(runtimeError),
    context: {
      handler: "console.error",
      arguments: args.map(normalizeConsoleArgument),
    },
  };
}

function buildWindowErrorLog(input: RendererWindowErrorInput): RuntimeLogWriteInput {
  const message = trimText(input.message) ?? summarizeThrowable(input.error, "Unhandled window error");

  return {
    level: "error",
    source: RENDERER_RUNTIME_LOG_SOURCE,
    module: RENDERER_RUNTIME_LOG_MODULE,
    message,
    stack: extractStack(input.error),
    context: {
      handler: "window.error",
      ...(trimText(input.filename) ? { filename: trimText(input.filename) } : {}),
      ...(typeof input.lineno === "number" ? { line: input.lineno } : {}),
      ...(typeof input.colno === "number" ? { column: input.colno } : {}),
    },
  };
}

function buildUnhandledRejectionLog(reason: unknown): RuntimeLogWriteInput {
  const summary = summarizeThrowable(reason, "unknown rejection");
  return {
    level: "error",
    source: RENDERER_RUNTIME_LOG_SOURCE,
    module: RENDERER_RUNTIME_LOG_MODULE,
    message: `Unhandled promise rejection: ${summary}`,
    stack: extractStack(reason),
    context: {
      handler: "window.unhandledrejection",
    },
  };
}

export function createRendererRuntimeErrorLogger(
  input: RendererRuntimeErrorLoggerInput,
) {
  const pending: RuntimeLogWriteInput[] = [];
  const onWriteFailure = input.onWriteFailure ?? (() => undefined);

  const dispatch = (record: RuntimeLogWriteInput) => {
    if (!input.hasBridge()) {
      if (pending.length >= MAX_PENDING_LOGS) {
        pending.shift();
      }
      pending.push(record);
      return;
    }

    void input.writeLog(record).catch(onWriteFailure);
  };

  return {
    reportConsoleError(args: unknown[]) {
      dispatch(buildConsoleErrorLog(args));
    },

    reportWindowError(error: RendererWindowErrorInput) {
      dispatch(buildWindowErrorLog(error));
    },

    reportUnhandledRejection(reason: unknown) {
      dispatch(buildUnhandledRejectionLog(reason));
    },

    flush() {
      if (!input.hasBridge() || pending.length === 0) {
        return;
      }

      const items = pending.splice(0, pending.length);
      for (const item of items) {
        void input.writeLog(item).catch(onWriteFailure);
      }
    },
  };
}

export function installRendererRuntimeErrorLogging(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window[RENDERER_RUNTIME_LOGGING_MARKER]) {
    return;
  }

  window[RENDERER_RUNTIME_LOGGING_MARKER] = true;

  const originalConsoleError = console.error.bind(console);
  const reporter = createRendererRuntimeErrorLogger({
    hasBridge: () => hasDesktopLogsBridge(),
    writeLog: writeRuntimeLog,
    onWriteFailure: (error) => {
      originalConsoleError("Failed to write renderer runtime log", error);
    },
  });

  console.error = ((...args: unknown[]) => {
    originalConsoleError(...(args as Parameters<typeof console.error>));
    reporter.reportConsoleError(args);
  }) as typeof console.error;

  window.addEventListener("error", (event) => {
    reporter.reportWindowError({
      message: event.message,
      error: event.error,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reporter.reportUnhandledRejection(event.reason);
  });

  window.addEventListener(DESKTOP_LOGS_BRIDGE_READY_EVENT, () => {
    reporter.flush();
  });

  reporter.flush();
}