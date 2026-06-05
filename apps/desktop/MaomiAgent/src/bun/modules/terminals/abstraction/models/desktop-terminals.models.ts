import type { DesktopResolvedShellKind } from "../../implementation/services/desktop-shell-profile.models";

export type DesktopTerminalShellKind = "powershell" | "cmd" | "bash" | "sh";

export type DesktopTerminalStatus = "running" | "exited" | "failed" | "closed";

export type DesktopTerminalListQuery = {
  status?: DesktopTerminalStatus;
  limit?: number;
  offset?: number;
};

export type DesktopTerminalSessionRecord = {
  sessionId: string;
  title: string;
  shellKind: DesktopTerminalShellKind;
  requestedShellKind?: DesktopTerminalShellKind;
  resolvedShellKind?: DesktopResolvedShellKind;
  resolvedShellCommand?: string;
  shellDisplayName?: string;
  status: DesktopTerminalStatus;
  cwd: string;
  workspaceId?: string;
  workspaceName?: string;
  pid?: number;
  cols?: number;
  rows?: number;
  createdAt: string;
  updatedAt: string;
  exitedAt?: string;
  exitCode?: number | null;
  lastOutputAt?: string;
};

export type DesktopTerminalSessionListResponse = {
  items: DesktopTerminalSessionRecord[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopTerminalCreateInput = {
  title?: string;
  shellKind?: DesktopTerminalShellKind;
  workspaceId?: string;
  cwd?: string;
};

export type DesktopTerminalExecuteInput = {
  text: string;
  appendNewline?: boolean;
};

export type DesktopTerminalResizeInput = {
  cols: number;
  rows: number;
};

export type DesktopTerminalDetailQuery = {
  sessionId: string;
  limit?: number;
};

export type DesktopTerminalSessionDetail = {
  session: DesktopTerminalSessionRecord;
  output: string;
  revision: number;
  truncated: boolean;
};

export type DesktopTerminalCloseResponse = {
  sessionId: string;
  closed: boolean;
};
