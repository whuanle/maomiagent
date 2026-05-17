import { afterEach, describe, expect, test } from "bun:test";

import type { RuntimeLogger } from "../../logs";
import { DesktopTerminalsService } from "../implementation/services/desktop-terminals-service";

function createLogRecord(level: "debug" | "info" | "warn" | "error") {
  return {
    id: `log-${level}`,
    at: new Date().toISOString(),
    level,
    source: "test",
    module: "desktop.terminals.test",
    message: level,
  };
}

const logger: RuntimeLogger = {
  write: async (level, message) => ({
    ...createLogRecord(level),
    message,
  }),
  debug: async (message) => ({
    ...createLogRecord("debug"),
    message,
  }),
  info: async (message) => ({
    ...createLogRecord("info"),
    message,
  }),
  warn: async (message) => ({
    ...createLogRecord("warn"),
    message,
  }),
  error: async (message) => ({
    ...createLogRecord("error"),
    message,
  }),
};

const activeSessionIds = new Set<string>();

async function waitForOutput(
  service: DesktopTerminalsService,
  sessionId: string,
  matcher: RegExp,
): Promise<string> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const detail = await service.getDetail({ sessionId, limit: 40_000 });
    const output = detail?.output ?? "";
    if (matcher.test(output)) {
      return output;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  throw new Error(`Timed out waiting for terminal output matching ${matcher}`);
}

afterEach(async () => {
  for (const sessionId of activeSessionIds) {
    try {
      const service = currentService;
      if (service) {
        await service.close(sessionId);
      }
    } catch {
      // Ignore best-effort cleanup failures.
    }
  }
  activeSessionIds.clear();
  currentService = null;
});

let currentService: DesktopTerminalsService | null = null;

describe("DesktopTerminalsService", () => {
  test("creates a session, executes a command, and reads output", async () => {
    const service = new DesktopTerminalsService({
      async get(workspaceId) {
        return {
          workspaceId,
          name: "MaomiAgent",
          directoryPath: process.cwd(),
          isPinned: false,
          tags: [],
          createdAt: "2026-05-04T00:00:00.000Z",
          updatedAt: "2026-05-04T00:00:00.000Z",
        };
      },
    }, logger);
    currentService = service;

    const shellKind = process.platform === "win32" ? "cmd" : "sh";
    const session = await service.create({
      workspaceId: "workspace-1",
      shellKind,
      title: "test-shell",
    });
    activeSessionIds.add(session.sessionId);

    expect(session.status).toBe("running");

    await service.execute(session.sessionId, {
      text: "echo hello-from-terminal",
      appendNewline: true,
    });

    const output = await waitForOutput(service, session.sessionId, /hello-from-terminal/);
    expect(output).toContain("hello-from-terminal");

    const closeResult = await service.close(session.sessionId);
    expect(closeResult).toEqual({
      sessionId: session.sessionId,
      closed: true,
    });

    const sessionsAfterClose = await service.list({ limit: 50, offset: 0 });
    expect(sessionsAfterClose.items.some((item) => item.sessionId === session.sessionId)).toBe(false);

    const detailAfterClose = await service.getDetail({ sessionId: session.sessionId, limit: 10_000 });
    expect(detailAfterClose).toBeNull();

    activeSessionIds.delete(session.sessionId);
  });

  test("surfaces an explicit error when cwd is missing", async () => {
    const service = new DesktopTerminalsService({
      async get() {
        return null;
      },
    }, logger);
    currentService = service;

    await expect(service.create({
      cwd: "Z:/__maomi_missing_terminal_cwd__",
      shellKind: process.platform === "win32" ? "powershell" : "sh",
      title: "missing-cwd",
    })).rejects.toThrow(/Terminal working directory is not accessible/i);
  });
});