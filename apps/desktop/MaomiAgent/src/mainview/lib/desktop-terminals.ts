import type {
  DesktopTerminalCloseResponse,
  DesktopTerminalCreateInput,
  DesktopTerminalDetailQuery,
  DesktopTerminalExecuteInput,
  DesktopTerminalListQuery,
  DesktopTerminalMutationAction,
  DesktopTerminalMutationEvent,
  DesktopTerminalResizeInput,
  DesktopTerminalSessionDetail,
  DesktopTerminalSessionListResponse,
  DesktopTerminalSessionRecord,
} from "../../shared/desktop-terminals";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopTerminalsBridge = {
  listDesktopTerminalSessions: (query?: DesktopTerminalListQuery) => Promise<DesktopTerminalSessionListResponse>;
  getDesktopTerminalDetail: (query: DesktopTerminalDetailQuery) => Promise<DesktopTerminalSessionDetail | null>;
  createDesktopTerminalSession: (input: DesktopTerminalCreateInput) => Promise<DesktopTerminalSessionRecord>;
  executeDesktopTerminalInput: (
    sessionId: string,
    input: DesktopTerminalExecuteInput,
  ) => Promise<DesktopTerminalSessionRecord | null>;
  resizeDesktopTerminalSession: (
    sessionId: string,
    input: DesktopTerminalResizeInput,
  ) => Promise<DesktopTerminalSessionRecord | null>;
  closeDesktopTerminalSession: (sessionId: string) => Promise<DesktopTerminalCloseResponse>;
};

declare global {
  interface Window {
    maomiDesktopTerminals?: DesktopTerminalsBridge;
  }
}

export const DESKTOP_TERMINALS_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;
export const DESKTOP_TERMINALS_INVALIDATED_EVENT = "maomi:desktop-terminals-invalidated";

function getDesktopTerminalsBridge(): DesktopTerminalsBridge {
  const bridge = window.maomiDesktopTerminals;
  if (!bridge) {
    throw new Error("Desktop terminals bridge is unavailable.");
  }

  return bridge;
}

function emitDesktopTerminalsInvalidated(action: DesktopTerminalMutationAction, sessionId: string) {
  const detail: DesktopTerminalMutationEvent = {
    action,
    sessionId,
    at: new Date().toISOString(),
  };

  window.dispatchEvent(
    new CustomEvent<DesktopTerminalMutationEvent>(DESKTOP_TERMINALS_INVALIDATED_EVENT, {
      detail,
    }),
  );
}

export function hasDesktopTerminalsBridge(): boolean {
  return Boolean(window.maomiDesktopTerminals);
}

export function listDesktopTerminalSessions(
  query: DesktopTerminalListQuery = {},
): Promise<DesktopTerminalSessionListResponse> {
  return getDesktopTerminalsBridge().listDesktopTerminalSessions(query);
}

export function getDesktopTerminalDetail(
  query: DesktopTerminalDetailQuery,
): Promise<DesktopTerminalSessionDetail | null> {
  return getDesktopTerminalsBridge().getDesktopTerminalDetail(query);
}

export async function createDesktopTerminalSession(
  input: DesktopTerminalCreateInput,
): Promise<DesktopTerminalSessionRecord> {
  const session = await getDesktopTerminalsBridge().createDesktopTerminalSession(input);
  emitDesktopTerminalsInvalidated("terminal.created", session.sessionId);
  return session;
}

export async function executeDesktopTerminalInput(
  sessionId: string,
  input: DesktopTerminalExecuteInput,
): Promise<DesktopTerminalSessionRecord | null> {
  return getDesktopTerminalsBridge().executeDesktopTerminalInput(sessionId, input);
}

export function resizeDesktopTerminalSession(
  sessionId: string,
  input: DesktopTerminalResizeInput,
): Promise<DesktopTerminalSessionRecord | null> {
  return getDesktopTerminalsBridge().resizeDesktopTerminalSession(sessionId, input);
}

export async function closeDesktopTerminalSession(
  sessionId: string,
): Promise<DesktopTerminalCloseResponse> {
  const response = await getDesktopTerminalsBridge().closeDesktopTerminalSession(sessionId);
  if (response.closed) {
    emitDesktopTerminalsInvalidated("terminal.closed", sessionId);
  }
  return response;
}