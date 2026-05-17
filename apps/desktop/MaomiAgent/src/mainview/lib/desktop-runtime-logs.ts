import type {
  RuntimeLogRecord,
  RuntimeLogWriteInput,
  RuntimeLogsDeleteResponse,
  RuntimeLogsListResponse,
  RuntimeLogsQuery,
  RuntimeLogsSummary,
} from "../../shared/runtime-logs";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopRuntimeLogsBridge = {
  getRuntimeLogs: (query?: RuntimeLogsQuery) => Promise<RuntimeLogsListResponse>;
  getRuntimeLogsSummary: (query?: RuntimeLogsQuery) => Promise<RuntimeLogsSummary>;
  writeRuntimeLog: (input: RuntimeLogWriteInput) => Promise<RuntimeLogRecord>;
  clearRuntimeLogs: () => Promise<RuntimeLogsDeleteResponse>;
  clearRuntimeLogsBefore: (
    query: Pick<RuntimeLogsQuery, "from" | "to">,
  ) => Promise<RuntimeLogsDeleteResponse>;
};

declare global {
  interface Window {
    maomiDesktopLogs?: DesktopRuntimeLogsBridge;
  }
}

export const DESKTOP_LOGS_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopLogsBridge(): DesktopRuntimeLogsBridge {
  const bridge = window.maomiDesktopLogs;
  if (!bridge) {
    throw new Error("Desktop logs bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopLogsBridge(): boolean {
  return Boolean(window.maomiDesktopLogs);
}

export function fetchRuntimeLogs(
  query: RuntimeLogsQuery = {},
): Promise<RuntimeLogsListResponse> {
  return getDesktopLogsBridge().getRuntimeLogs(query);
}

export function fetchRuntimeLogsSummary(
  query: RuntimeLogsQuery = {},
): Promise<RuntimeLogsSummary> {
  return getDesktopLogsBridge().getRuntimeLogsSummary(query);
}

export function writeRuntimeLog(
  input: RuntimeLogWriteInput,
): Promise<RuntimeLogRecord> {
  return getDesktopLogsBridge().writeRuntimeLog(input);
}

export function clearRuntimeLogs(): Promise<RuntimeLogsDeleteResponse> {
  return getDesktopLogsBridge().clearRuntimeLogs();
}

export function clearRuntimeLogsBefore(
  query: Pick<RuntimeLogsQuery, "from" | "to">,
): Promise<RuntimeLogsDeleteResponse> {
  return getDesktopLogsBridge().clearRuntimeLogsBefore(query);
}