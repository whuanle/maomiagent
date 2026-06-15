import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopTerminalCloseResponse,
  DesktopTerminalCreateInput,
  DesktopTerminalDetailQuery,
  DesktopTerminalExecuteInput,
  DesktopTerminalListQuery,
  DesktopTerminalResizeInput,
  DesktopTerminalSessionDetail,
  DesktopTerminalSessionListResponse,
  DesktopTerminalSessionRecord,
  DesktopTerminalShellKind,
} from "../../abstraction/models/desktop-terminals.models";
import type { DesktopTerminalsPort } from "../../abstraction/ports/desktop-terminals.ports";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import { DesktopShellProfileService } from "./desktop-shell-profile-service";
import type { DesktopShellProfile } from "./desktop-shell-profile.models";

const DEFAULT_OUTPUT_LIMIT = 24_000;
const MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const TERMINAL_READY_TIMEOUT_MS = 2_000;
const TERMINAL_HOST_RUNTIME_DIR = fileURLToPath(new URL("../../../../../..", import.meta.url));
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const ANSI_OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_SINGLE_ESCAPE_RE = /\x1b[@-Z\\-_]/g;
const POWERSHELL_PROMPT_RE = /PS [^\n>]*>/g;
const CMD_PROMPT_RE = /[A-Za-z]:\\[^\n>]*>/g;

const PTY_SESSION_HOST_SOURCE = String.raw`
const fs = require("node:fs");
const readline = require("node:readline");

const send = (payload) => {
  process.stdout.write(JSON.stringify(payload) + "\n");
};

const toMessage = (error) => {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return String(error);
};

process.on("uncaughtException", (error) => {
  send({ type: "error", message: toMessage(error) });
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  send({ type: "error", message: toMessage(error) });
  process.exit(1);
});

let spawn;
try {
  ({ spawn } = require("node-pty"));
} catch (error) {
  send({
    type: "error",
    message: "Failed to load terminal host dependency node-pty: " + toMessage(error),
  });
  process.exit(1);
}

let config;
try {
  config = JSON.parse(process.env.MAOMI_TERMINAL_CONFIG || "{}");
} catch (error) {
  send({ type: "error", message: toMessage(error) });
  process.exit(1);
}

const ptyEnv = { ...process.env };
delete ptyEnv.MAOMI_TERMINAL_CONFIG;

const requestedCwd = typeof config.cwd === "string" && config.cwd.trim() ? config.cwd : undefined;
if (requestedCwd) {
  let cwdStats;
  try {
    cwdStats = fs.statSync(requestedCwd);
  } catch (error) {
    send({
      type: "error",
      message: "Terminal working directory is not accessible: " + requestedCwd + " (" + toMessage(error) + ")",
    });
    process.exit(1);
  }

  if (!cwdStats.isDirectory()) {
    send({
      type: "error",
      message: "Terminal working directory is not a directory: " + requestedCwd,
    });
    process.exit(1);
  }
}

let pty;
try {
  pty = spawn(config.command, Array.isArray(config.args) ? config.args : [], {
    name: config.name || "xterm-256color",
    cols: Number.isFinite(config.cols) ? Math.max(20, Math.floor(config.cols)) : 120,
    rows: Number.isFinite(config.rows) ? Math.max(6, Math.floor(config.rows)) : 32,
    cwd: requestedCwd,
    env: ptyEnv,
    ...(process.platform === "win32" ? { useConpty: config.useConpty !== false } : {}),
  });
} catch (error) {
  send({
    type: "error",
    message: "Failed to start terminal host: " + toMessage(error),
  });
  process.exit(1);
}

send({ type: "ready", pid: pty.pid, cols: pty.cols, rows: pty.rows });

pty.onData((data) => {
  send({ type: "data", data });
});

pty.onExit(({ exitCode, signal }) => {
  send({ type: "exit", exitCode, signal });
  input.close();
  process.stdin.pause();
  setTimeout(() => process.exit(0), 0);
});

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

input.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    send({ type: "error", message: toMessage(error) });
    return;
  }

  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "input") {
    pty.write(typeof message.data === "string" ? message.data : "");
    return;
  }

  if (message.type === "resize") {
    if (Number.isFinite(message.cols) && Number.isFinite(message.rows)) {
      pty.resize(Math.max(20, Math.floor(message.cols)), Math.max(6, Math.floor(message.rows)));
    }
    return;
  }

  if (message.type === "close") {
    pty.kill();
  }
});

process.stdin.on("end", () => {
  try {
    pty.kill();
  } catch {
    // ignore
  }
});

`;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  settled: boolean;
};

type InternalTerminalSession = {
  record: DesktopTerminalSessionRecord;
  process: ChildProcessWithoutNullStreams;
  output: string;
  revision: number;
  stdoutBuffer: string;
  ready: Deferred<void>;
  exited: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function createSessionId() {
  return `term_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveDefaultShellKind(): DesktopTerminalShellKind {
  return process.platform === "win32" ? "powershell" : "sh";
}

function normalizeTerminalDimension(value: number, fallback: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(value));
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const deferred: Deferred<T> = {
    promise: new Promise<T>((innerResolve, innerReject) => {
      resolve = innerResolve;
      reject = innerReject;
    }),
    resolve(value) {
      if (deferred.settled) {
        return;
      }

      deferred.settled = true;
      resolve(value);
    },
    reject(reason) {
      if (deferred.settled) {
        return;
      }

      deferred.settled = true;
      reject(reason);
    },
    settled: false,
  };

  return deferred;
}

function resolveTerminalHostCommand(): string {
  return normalizeOptionalText(process.env.MAOMI_TERMINAL_NODE_PATH) ?? "node";
}

function stripTerminalControlSequences(input: string): string {
  return input
    .replace(ANSI_OSC_RE, "")
    .replace(ANSI_CSI_RE, "")
    .replace(ANSI_SINGLE_ESCAPE_RE, "")
    .replace(/\u0000/g, "");
}

function stripPromptPrefix(line: string): string {
  if (!line) {
    return line;
  }

  if (line.startsWith("PS ")) {
    return line.replace(/^PS [^\n>]*>\s*/, "");
  }

  if (/^[A-Za-z]:\\/u.test(line)) {
    return line.replace(/^[A-Za-z]:\\[^\n>]*>\s*/, "");
  }

  return line;
}

function stripPromptSuffix(line: string): string {
  if (!line) {
    return line;
  }

  return line.replace(
    new RegExp(String.raw`\s*(?:${POWERSHELL_PROMPT_RE.source}|${CMD_PROMPT_RE.source})\s*$`, "u"),
    "",
  );
}

function sanitizeTerminalOutput(input: string): string {
  const normalized = stripTerminalControlSequences(input).replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n").map((line) => stripPromptSuffix(stripPromptPrefix(line)).trimEnd());

  while (lines[0] === "") {
    lines.shift();
  }

  while (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildListResponse(input: {
  items: DesktopTerminalSessionRecord[];
  limit?: number;
  offset?: number;
}): DesktopTerminalSessionListResponse {
  const total = input.items.length;
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.max(1, input.limit ?? Math.max(total, 1));
  const items = input.items.slice(offset, offset + limit);

  return {
    items,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  };
}

export class DesktopTerminalsService implements DesktopTerminalsPort {
  private readonly sessions = new Map<string, InternalTerminalSession>();

  constructor(
    private readonly workspaceQuery: Pick<DesktopWorkspaceQueryPort, "get">,
    private readonly logger: RuntimeLogger,
    private readonly shellProfiles: Pick<
      DesktopShellProfileService,
      "resolvePreferredShell" | "resolveExplicitShell" | "listAvailableShells"
    > = new DesktopShellProfileService(),
  ) {}

  async list(input: DesktopTerminalListQuery = {}): Promise<DesktopTerminalSessionListResponse> {
    const items = Array.from(this.sessions.values())
      .map((item) => ({ ...item.record }))
      .filter((item) => (input.status ? item.status === input.status : true))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return buildListResponse({
      items,
      limit: input.limit,
      offset: input.offset,
    });
  }

  async getDetail(input: DesktopTerminalDetailQuery): Promise<DesktopTerminalSessionDetail | null> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return null;
    }

    const limit = Math.max(1, input.limit ?? DEFAULT_OUTPUT_LIMIT);
    const sanitizedOutput = sanitizeTerminalOutput(session.output);
    const truncated = sanitizedOutput.length > limit;

    return {
      session: { ...session.record },
      output: truncated ? sanitizedOutput.slice(-limit) : sanitizedOutput,
      revision: session.revision,
      truncated,
    };
  }

  async create(input: DesktopTerminalCreateInput): Promise<DesktopTerminalSessionRecord> {
    const requestedShellKind = input.shellKind;
    const workspaceId = normalizeOptionalText(input.workspaceId);
    const workspace = workspaceId ? await this.workspaceQuery.get(workspaceId) : null;
    const cwd = normalizeOptionalText(input.cwd) ?? workspace?.directoryPath ?? homedir();
    const sessionId = createSessionId();
    const createdAt = nowIso();
    const cols = DEFAULT_TERMINAL_COLS;
    const rows = DEFAULT_TERMINAL_ROWS;
    const title = normalizeOptionalText(input.title)
      ?? workspace?.name
      ?? `${requestedShellKind ?? resolveDefaultShellKind()} ${createdAt.slice(11, 16)}`;

    const profiles = this.resolveShellProfilesForCreate(requestedShellKind);
    let lastError: unknown = null;

    for (const profile of profiles) {
      try {
        const session = await this.createSessionWithProfile({
          sessionId,
          title,
          cwd,
          workspaceId,
          workspaceName: workspace?.name,
          createdAt,
          cols,
          rows,
          requestedShellKind,
          profile,
        });

        await this.logger.info("Desktop terminal session created", {
          context: {
            sessionId,
            shellKind: session.record.shellKind,
            resolvedShellKind: session.record.resolvedShellKind,
            cwd,
            workspaceId,
          },
        });
        return { ...session.record };
      } catch (error) {
        lastError = error;
        if (requestedShellKind) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("Failed to resolve a terminal shell profile.");
  }

  async execute(sessionId: string, input: DesktopTerminalExecuteInput): Promise<DesktopTerminalSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (session.record.status !== "running") {
      return { ...session.record };
    }

    const text = input.text ?? "";
    const appendNewline = input.appendNewline !== false;
    const payload = appendNewline ? `${text}\r` : text;

    if (!this.sendHostMessage(session, { type: "input", data: payload })) {
      return { ...session.record };
    }

    if (appendNewline || text.length > 16) {
      await this.logger.debug("Desktop terminal session received input", {
        context: {
          sessionId,
          shellKind: session.record.shellKind,
          bytes: payload.length,
        },
      });
    }

    return { ...session.record };
  }

  async resize(sessionId: string, input: DesktopTerminalResizeInput): Promise<DesktopTerminalSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const cols = normalizeTerminalDimension(input.cols, session.record.cols ?? DEFAULT_TERMINAL_COLS, 20);
    const rows = normalizeTerminalDimension(input.rows, session.record.rows ?? DEFAULT_TERMINAL_ROWS, 6);

    if (session.record.status !== "running") {
      return { ...session.record };
    }

    if (!this.sendHostMessage(session, { type: "resize", cols, rows })) {
      return { ...session.record };
    }
    session.record.cols = cols;
    session.record.rows = rows;
    session.record.updatedAt = nowIso();
    return { ...session.record };
  }

  async close(sessionId: string): Promise<DesktopTerminalCloseResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        closed: false,
      };
    }

    if (session.record.status === "running") {
      session.record.status = "closed";
      session.record.updatedAt = nowIso();
      session.record.exitedAt = session.record.updatedAt;
      try {
        if (!this.sendHostMessage(session, { type: "close" })) {
          session.process.kill();
        }
      } catch {
        // Ignore process kill failures.
      }
    }

    this.sessions.delete(sessionId);

    await this.logger.info("Desktop terminal session closed", {
      context: {
        sessionId,
        status: session.record.status,
      },
    });
    return {
      sessionId,
      closed: true,
    };
  }

  private resolveShellProfilesForCreate(requestedShellKind: DesktopTerminalShellKind | undefined): DesktopShellProfile[] {
    if (requestedShellKind) {
      return [this.shellProfiles.resolveExplicitShell(requestedShellKind)];
    }

    const preferred = this.shellProfiles.resolvePreferredShell();
    const alternatives = this.shellProfiles.listAvailableShells()
      .filter((profile) => profile.acceptable)
      .filter((profile) =>
        !(profile.resolvedKind === preferred.resolvedKind && profile.executable === preferred.executable));
    return [preferred, ...alternatives];
  }

  private async createSessionWithProfile(input: {
    sessionId: string;
    title: string;
    cwd: string;
    workspaceId?: string;
    workspaceName?: string;
    createdAt: string;
    cols: number;
    rows: number;
    requestedShellKind?: DesktopTerminalShellKind;
    profile: DesktopShellProfile;
  }): Promise<InternalTerminalSession> {
    const child = spawn(resolveTerminalHostCommand(), ["-e", PTY_SESSION_HOST_SOURCE], {
      cwd: TERMINAL_HOST_RUNTIME_DIR,
      env: {
        ...process.env,
        MAOMI_TERMINAL_CONFIG: JSON.stringify({
          command: input.profile.executable,
          args: input.profile.args,
          cols: input.cols,
          rows: input.rows,
          cwd: input.cwd,
          name: "xterm-256color",
          useConpty: true,
        }),
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const shellKind: DesktopTerminalShellKind = input.profile.resolvedKind === "pwsh"
      ? "powershell"
      : input.profile.resolvedKind;
    const session: InternalTerminalSession = {
      record: {
        sessionId: input.sessionId,
        title: input.title,
        shellKind,
        ...(input.requestedShellKind ? { requestedShellKind: input.requestedShellKind } : {}),
        resolvedShellKind: input.profile.resolvedKind,
        resolvedShellCommand: input.profile.executable,
        shellDisplayName: input.profile.displayName,
        status: "running",
        cwd: input.cwd,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.workspaceName ? { workspaceName: input.workspaceName } : {}),
        ...(typeof child.pid === "number" ? { pid: child.pid } : {}),
        cols: input.cols,
        rows: input.rows,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      process: child,
      output: "",
      revision: 1,
      stdoutBuffer: "",
      ready: createDeferred<void>(),
      exited: false,
    };

    this.sessions.set(input.sessionId, session);
    this.bindProcess(session);

    try {
      await Promise.race([
        session.ready.promise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for terminal host.")), TERMINAL_READY_TIMEOUT_MS);
        }),
      ]);
      return session;
    } catch (error) {
      this.sessions.delete(input.sessionId);
      try {
        child.kill();
      } catch {
        // Ignore cleanup failures while create is already failing.
      }
      throw error;
    }
  }

  private bindProcess(session: InternalTerminalSession) {
    session.process.stdout.on("data", (chunk: Buffer | string) => {
      this.handleHostStdout(session, chunk.toString());
    });

    session.process.stderr.on("data", (chunk: Buffer | string) => {
      const message = chunk.toString().trim();
      if (!message) {
        return;
      }

      this.appendOutput(session, `\r\n[maomi] ${message}\r\n`);
    });

    session.process.on("error", (error) => {
      session.ready.reject(error);
      session.record.status = "failed";
      session.record.updatedAt = nowIso();
      session.record.exitedAt = session.record.updatedAt;
      session.record.exitCode = -1;
      this.appendOutput(session, `\r\n[maomi] ${error.message}\r\n`);
    });

    session.process.on("close", (code) => {
      if (!session.ready.settled) {
        session.ready.reject(new Error(`Terminal host exited before ready (${code ?? "unknown"}).`));
      }

      if (!session.exited && session.record.status === "running") {
        session.record.status = typeof code === "number" && code === 0 ? "exited" : "failed";
        session.record.updatedAt = nowIso();
        session.record.exitedAt = session.record.updatedAt;
        session.record.exitCode = typeof code === "number" ? code : null;
        this.appendOutput(session, `\r\n[maomi] terminal host exited (${session.record.exitCode ?? "unknown"})\r\n`);
        return;
      }

      session.record.updatedAt = nowIso();
      session.record.exitedAt = session.record.updatedAt;
      if (typeof code === "number" && session.record.exitCode == null) {
        session.record.exitCode = code;
      }
    });
  }

  private handleHostStdout(session: InternalTerminalSession, chunk: string) {
    if (!chunk) {
      return;
    }

    session.stdoutBuffer = `${session.stdoutBuffer}${chunk}`;
    const lines = session.stdoutBuffer.split("\n");
    session.stdoutBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      this.handleHostMessage(session, rawLine.trimEnd());
    }
  }

  private handleHostMessage(session: InternalTerminalSession, line: string) {
    if (!line) {
      return;
    }

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.appendOutput(session, line);
      return;
    }

    if (message.type === "ready") {
      session.record.pid = typeof message.pid === "number" ? message.pid : session.record.pid;
      session.record.cols = typeof message.cols === "number" ? message.cols : session.record.cols;
      session.record.rows = typeof message.rows === "number" ? message.rows : session.record.rows;
      session.ready.resolve();
      return;
    }

    if (message.type === "data") {
      this.appendOutput(session, typeof message.data === "string" ? message.data : "");
      return;
    }

    if (message.type === "error") {
      const text = typeof message.message === "string" ? message.message : "Terminal host error.";
      this.appendOutput(session, `\r\n[maomi] ${text}\r\n`);
      if (!session.ready.settled) {
        session.ready.reject(new Error(text));
      }
      return;
    }

    if (message.type === "exit") {
      const exitCode = typeof message.exitCode === "number" ? message.exitCode : null;
      const signal = typeof message.signal === "number" ? message.signal : null;

      session.exited = true;
      if (session.record.status === "running") {
        session.record.status = exitCode === 0 ? "exited" : "failed";
      }
      session.record.updatedAt = nowIso();
      session.record.exitedAt = session.record.updatedAt;
      session.record.exitCode = exitCode;
      this.appendOutput(
        session,
        `\r\n[maomi] session exited (${exitCode ?? "unknown"}${signal != null ? `, signal ${signal}` : ""})\r\n`,
      );
    }
  }

  private sendHostMessage(session: InternalTerminalSession, payload: Record<string, unknown>): boolean {
    if (!session.process.stdin.writable) {
      return false;
    }

    try {
      session.process.stdin.write(`${JSON.stringify(payload)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  private appendOutput(session: InternalTerminalSession, chunk: string) {
    if (!chunk) {
      return;
    }

    const next = `${session.output}${chunk}`;
    session.output = next.length > MAX_OUTPUT_CHARS
      ? next.slice(-MAX_OUTPUT_CHARS)
      : next;
    session.revision += 1;
    session.record.updatedAt = nowIso();
    session.record.lastOutputAt = session.record.updatedAt;
  }
}
