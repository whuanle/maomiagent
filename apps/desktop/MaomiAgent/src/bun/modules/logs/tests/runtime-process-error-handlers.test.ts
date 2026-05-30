import { describe, expect, mock, test } from "bun:test";

import type { RuntimeLogger } from "../abstraction/models/runtime-log.models";
import { createRuntimeProcessErrorHandlers } from "../implementation/services/runtime-process-error-handlers";

async function flushAsyncErrorPipeline(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createLoggerSpy() {
  const error = mock<RuntimeLogger["error"]>(async (message, extra) => ({
    id: "log-error",
    at: "2026-05-07T00:00:00.000Z",
    level: "error",
    source: "desktop",
    module: "desktop.process",
    message,
    stack: extra?.error instanceof Error ? extra.error.stack : undefined,
    context: extra?.context,
  }));

  return {
    logger: { error },
    error,
  };
}

describe("createRuntimeProcessErrorHandlers", () => {
  test("logs unhandled rejections without stopping the host", async () => {
    const { logger, error } = createLoggerSpy();
    const stopHost = mock(async () => undefined);
    const exitProcess = mock(() => undefined);
    const handlers = createRuntimeProcessErrorHandlers({
      logger,
      stopHost,
      exitProcess,
    });

    handlers.handleUnhandledRejection(new Error("reject boom"));
    await flushAsyncErrorPipeline();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBe("Unhandled promise rejection: reject boom");
    expect(error.mock.calls[0]?.[1]).toMatchObject({
      context: {
        handler: "unhandledRejection",
        fatal: false,
      },
    });
    expect(stopHost).not.toHaveBeenCalled();
    expect(exitProcess).not.toHaveBeenCalled();
  });

  test("logs uncaught exceptions before stopping the host and exiting", async () => {
    const { logger, error } = createLoggerSpy();
    const stopHost = mock(async () => undefined);
    const exitProcess = mock(() => undefined);
    const handlers = createRuntimeProcessErrorHandlers({
      logger,
      stopHost,
      exitProcess,
    });

    handlers.handleUncaughtException(new Error("fatal boom"), "uncaughtException");
  await flushAsyncErrorPipeline();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBe("Unhandled exception: fatal boom");
    expect(error.mock.calls[0]?.[1]).toMatchObject({
      context: {
        handler: "uncaughtException",
        fatal: true,
        origin: "uncaughtException",
      },
    });
    expect(stopHost).toHaveBeenCalledWith("uncaughtException");
    expect(exitProcess).toHaveBeenCalledWith(1);
  });
});