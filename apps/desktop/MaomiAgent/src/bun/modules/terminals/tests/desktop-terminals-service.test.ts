import { afterEach, describe, expect, test } from "bun:test";

import type { RuntimeLogger } from "../../logs";
import { DesktopTerminalsService } from "../implementation/services/desktop-terminals-service";
import type { DesktopShellProfile } from "../implementation/services/desktop-shell-profile.models";

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

  throw new Error(`Timed out waiting for shell output matching ${matcher}`);
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

function createShellProfile(profile: Partial<DesktopShellProfile> = {}): DesktopShellProfile {
  return {
    requestedKind: null,
    resolvedKind: "cmd",
    executable: "C:/Windows/System32/cmd.exe",
    args: ["/D"],
    displayName: "cmd.exe",
    acceptable: true,
    isPowerShell: false,
    isPosix: false,
    supportsAndAnd: true,
    source: "preferred",
    ...profile,
  };
}

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
    expect(output).not.toContain("\u001b[");

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

  test("stores requested and resolved shell metadata on created sessions", async () => {
    const service = new DesktopTerminalsService({
      async get() {
        return null;
      },
    }, logger, {
      resolvePreferredShell() {
        return createShellProfile();
      },
      resolveExplicitShell() {
        throw new Error("not used");
      },
      listAvailableShells() {
        return [createShellProfile()];
      },
    });
    currentService = service;

    const session = await service.create({
      title: "shell-profile",
    });
    activeSessionIds.add(session.sessionId);

    expect(session.shellKind).toBe("cmd");
    expect(session.requestedShellKind).toBeUndefined();
    expect(session.resolvedShellKind).toBe("cmd");
    expect(session.resolvedShellCommand).toBe("C:/Windows/System32/cmd.exe");
    expect(session.shellDisplayName).toBe("cmd.exe");

    await service.close(session.sessionId);
    activeSessionIds.delete(session.sessionId);
  });

  test("sanitizes control sequences and prompt noise from terminal detail output", async () => {
    const service = new DesktopTerminalsService({
      async get() {
        return null;
      },
    }, logger);
    currentService = service;

    const sessions = (service as unknown as {
      sessions: Map<string, unknown>;
    }).sessions;

    sessions.set("term_sanitized", {
      record: {
        sessionId: "term_sanitized",
        title: "sanitized",
        shellKind: "powershell",
        status: "running",
        cwd: "E:/workspace/hearing",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
      },
      process: {
        stdout: { on() {} },
        stderr: { on() {} },
        stdin: { writable: true, write() {} },
        on() {},
        kill() {},
      },
      output: "\u001b[?9001h\u001b]0;C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe\u0007"
        + "PS E:\\workspace\\hearing> Get-ChildItem src -Directory | Select-Object Name\r\n"
        + "\u001b[?25h\u001b[m\r\nName    \r\n----    \r\nmain    \r\nshared  \u001b[12;1HPS E:\\workspace\\hearing> ",
      revision: 3,
      stdoutBuffer: "",
      ready: {
        promise: Promise.resolve(),
        resolve() {},
        reject() {},
        settled: true,
      },
      exited: false,
    });

    const detail = await service.getDetail({ sessionId: "term_sanitized", limit: 10_000 });
    expect(detail).not.toBeNull();
    expect(detail?.output).toBe(
      "Get-ChildItem src -Directory | Select-Object Name\n\nName\n----\nmain\nshared",
    );
    expect(detail?.rawOutput).toContain("PS E:\\workspace\\hearing>");
    expect(detail?.rawOutput).toContain("\u001b");
    expect(detail?.output).not.toContain("\u001b");
    expect(detail?.output).not.toContain("PS E:\\workspace\\hearing>");
  });
});
