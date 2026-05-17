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
} from "../models/desktop-terminals.models";

export interface DesktopTerminalsQueryPort {
  list(input?: DesktopTerminalListQuery): Promise<DesktopTerminalSessionListResponse>;
  getDetail(input: DesktopTerminalDetailQuery): Promise<DesktopTerminalSessionDetail | null>;
}

export interface DesktopTerminalsCommandPort {
  create(input: DesktopTerminalCreateInput): Promise<DesktopTerminalSessionRecord>;
  execute(sessionId: string, input: DesktopTerminalExecuteInput): Promise<DesktopTerminalSessionRecord | null>;
  resize(sessionId: string, input: DesktopTerminalResizeInput): Promise<DesktopTerminalSessionRecord | null>;
  close(sessionId: string): Promise<DesktopTerminalCloseResponse>;
}

export type DesktopTerminalsPort = DesktopTerminalsQueryPort & DesktopTerminalsCommandPort;