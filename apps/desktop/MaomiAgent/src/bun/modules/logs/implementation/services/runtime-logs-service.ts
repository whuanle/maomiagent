import type { RuntimeLogLevel } from "../../abstraction/enums/runtime-log-level";
import type {
  RuntimeLogExtra,
  RuntimeLogRecord,
  RuntimeLogWriteInput,
  RuntimeLogger,
  RuntimeLogsListResponse,
  RuntimeLogsQuery,
  RuntimeLogsSummary,
} from "../../abstraction/models/runtime-log.models";
import type {
  RuntimeLoggerFactoryPort,
  RuntimeLogsQueryPort,
  RuntimeLogWriterPort,
} from "../../abstraction/ports/runtime-logs.ports";
import { RuntimeLogsStore } from "../stores/runtime-logs-store";

type RuntimeConsoleLogger = Pick<typeof console, "log" | "warn" | "error">;

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeException(
  error: unknown,
): { details: Record<string, unknown>; stack?: string } | null {
  if (error instanceof Error) {
    return {
      details: {
        name: error.name,
        message: error.message,
      },
      stack: trimText(error.stack),
    };
  }

  if (error === undefined || error === null) {
    return null;
  }

  if (typeof error === "string") {
    return {
      details: {
        message: error,
      },
    };
  }

  return {
    details: {
      value: error,
    },
  };
}

function normalizeLogInput(
  defaults: { source: string; module: string },
  level: RuntimeLogLevel,
  message: string,
  extra?: RuntimeLogExtra,
): RuntimeLogWriteInput {
  const exception = normalizeException(extra?.error);
  const location =
    trimText(extra?.location)
    ?? (typeof extra?.context?.location === "string"
      ? trimText(extra.context.location)
      : undefined)
    ?? defaults.module;

  const context: Record<string, unknown> = {
    ...(extra?.context ?? {}),
    location,
  };

  if (extra?.attributes && Object.keys(extra.attributes).length > 0) {
    context.attributes = extra.attributes;
  }

  if (exception && context.exception === undefined) {
    context.exception = exception.details;
  }

  return {
    level,
    source: defaults.source,
    module: defaults.module,
    message,
    stack: trimText(extra?.stack) ?? exception?.stack,
    context,
    workspaceId: extra?.workspaceId,
    runId: extra?.runId,
    taskId: extra?.taskId,
    traceId: extra?.traceId,
  };
}

export class RuntimeLogsService
  implements RuntimeLogWriterPort, RuntimeLogsQueryPort, RuntimeLoggerFactoryPort {
  constructor(
    private readonly store: RuntimeLogsStore,
    private readonly consoleLogger?: RuntimeConsoleLogger,
  ) {}

  write(input: RuntimeLogWriteInput): RuntimeLogRecord {
    const record = this.store.append(input);
    this.writeConsole(record);
    return record;
  }

  query(input: RuntimeLogsQuery = {}): RuntimeLogsListResponse {
    return this.store.query(input);
  }

  summary(input: RuntimeLogsQuery = {}): RuntimeLogsSummary {
    return this.store.summary(input);
  }

  clear(): number {
    return this.store.clear();
  }

  deleteByQuery(input: RuntimeLogsQuery = {}): number {
    return this.store.deleteByQuery(input);
  }

  createLogger(input: { source: string; module: string }): RuntimeLogger {
    const defaults = {
      source: input.source.trim() || "runtime",
      module: input.module.trim() || "runtime.general",
    };

    const write = async (
      level: RuntimeLogLevel,
      message: string,
      extra?: RuntimeLogExtra,
    ) => this.write(normalizeLogInput(defaults, level, message, extra));

    return {
      write,
      debug: (message, extra) => write("debug", message, extra),
      info: (message, extra) => write("info", message, extra),
      warn: (message, extra) => write("warn", message, extra),
      error: (message, extra) => write("error", message, extra),
    };
  }

  dispose() {
    this.store.close();
  }

  private writeConsole(record: RuntimeLogRecord): void {
    const line = `[${record.at}] ${record.level.toUpperCase()} ${record.module}: ${record.message}`;
    if (record.level === "error") {
      this.consoleLogger?.error(line, record.context ?? "");
      return;
    }
    if (record.level === "warn") {
      this.consoleLogger?.warn(line, record.context ?? "");
      return;
    }
    this.consoleLogger?.log(line, record.context ?? "");
  }
}