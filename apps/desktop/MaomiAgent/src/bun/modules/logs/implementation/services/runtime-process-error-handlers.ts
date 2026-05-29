import type { RuntimeLogger } from "../../abstraction/models/runtime-log.models";

type FallbackLogger = Pick<typeof console, "error">;

type RuntimeProcessErrorHandlersInput = {
  logger: Pick<RuntimeLogger, "error">;
  fallbackLogger?: FallbackLogger;
  stopHost?: (signal: string) => Promise<void> | void;
  exitProcess?: (code: number) => void;
};

function summarizeThrowable(value: unknown, fallback: string): string {
  if (value instanceof Error) {
    const message = value.message.trim();
    if (message) {
      return message;
    }
    const name = value.name.trim();
    if (name) {
      return name;
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (value !== undefined && value !== null) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Ignore serialization failures and fall through to String(value).
    }

    const text = String(value).trim();
    if (text && text !== "[object Object]") {
      return text;
    }
  }

  return fallback;
}

async function writeRuntimeErrorLog(
  logger: Pick<RuntimeLogger, "error">,
  fallbackLogger: FallbackLogger,
  message: string,
  error: unknown,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await logger.error(message, {
      error,
      context,
    });
  } catch (loggingError) {
    fallbackLogger.error(`Failed to persist runtime error log: ${message}`, loggingError);
  }
}

export function createRuntimeProcessErrorHandlers(
  input: RuntimeProcessErrorHandlersInput,
) {
  const fallbackLogger = input.fallbackLogger ?? console;
  const exitProcess = input.exitProcess ?? ((code: number) => process.exit(code));

  return {
    handleUncaughtException(error: unknown, origin?: string) {
      const summary = summarizeThrowable(error, "unknown uncaught exception");
      void writeRuntimeErrorLog(
        input.logger,
        fallbackLogger,
        `Unhandled exception: ${summary}`,
        error,
        {
          handler: "uncaughtException",
          fatal: true,
          ...(origin ? { origin } : {}),
        },
      ).finally(() => {
        Promise.resolve(input.stopHost?.("uncaughtException"))
          .catch((stopError) => {
            fallbackLogger.error("Failed to stop desktop host after uncaught exception", stopError);
          })
          .finally(() => {
            exitProcess(1);
          });
      });
    },

    handleUnhandledRejection(reason: unknown) {
      const summary = summarizeThrowable(reason, "unknown rejection");
      void writeRuntimeErrorLog(
        input.logger,
        fallbackLogger,
        `Unhandled promise rejection: ${summary}`,
        reason,
        {
          handler: "unhandledRejection",
          fatal: false,
        },
      );
    },
  };
}