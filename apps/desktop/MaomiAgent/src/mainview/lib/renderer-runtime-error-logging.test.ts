import { describe, expect, mock, test } from "bun:test";

import type { RuntimeLogWriteInput } from "../../shared/runtime-logs";
import { createRendererRuntimeErrorLogger } from "./renderer-runtime-error-logging";

async function flushPendingWrites(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createRendererRuntimeErrorLogger", () => {
  test("buffers console errors until the desktop log bridge becomes ready", async () => {
    let bridgeReady = false;
    const writes: RuntimeLogWriteInput[] = [];
    const writeLog = mock(async (input: RuntimeLogWriteInput) => {
      writes.push(input);
      return {
        id: `log-${writes.length}`,
        at: "2026-05-07T00:00:00.000Z",
        ...input,
      };
    });

    const reporter = createRendererRuntimeErrorLogger({
      hasBridge: () => bridgeReady,
      writeLog,
    });

    const error = new Error("render boom");
    reporter.reportConsoleError([
      "Render failed",
      error,
      { componentStack: "\n    in App" },
    ]);

    expect(writeLog).not.toHaveBeenCalled();

    bridgeReady = true;
    reporter.flush();
    await flushPendingWrites();

    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writes[0]).toMatchObject({
      level: "error",
      source: "mainview",
      module: "desktop.mainview.runtime",
      message: "Render failed",
      stack: error.stack,
      context: {
        handler: "console.error",
      },
    });
    expect(writes[0]?.context).toMatchObject({
      arguments: [
        "Render failed",
        {
          type: "error",
          name: "Error",
          message: "render boom",
        },
        {
          type: "reactErrorInfo",
          componentStack: "in App",
        },
      ],
    });
  });

  test("writes unhandled rejection logs immediately when the bridge is ready", async () => {
    const writes: RuntimeLogWriteInput[] = [];
    const writeLog = mock(async (input: RuntimeLogWriteInput) => {
      writes.push(input);
      return {
        id: `log-${writes.length}`,
        at: "2026-05-07T00:00:00.000Z",
        ...input,
      };
    });

    const reporter = createRendererRuntimeErrorLogger({
      hasBridge: () => true,
      writeLog,
    });

    reporter.reportUnhandledRejection("bad promise");
    await flushPendingWrites();

    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writes[0]).toMatchObject({
      level: "error",
      source: "mainview",
      module: "desktop.mainview.runtime",
      message: "Unhandled promise rejection: bad promise",
      context: {
        handler: "window.unhandledrejection",
      },
    });
  });
});