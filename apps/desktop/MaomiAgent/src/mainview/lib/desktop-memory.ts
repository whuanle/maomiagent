import type {
  DesktopMemoryAppendInput,
  DesktopMemoryDeleteResponse,
  DesktopMemoryDomain,
  DesktopMemoryKind,
  DesktopMemoryListQuery,
  DesktopMemoryListResponse,
  DesktopMemoryMaintenanceApply,
  DesktopMemoryMaintenanceRequest,
  DesktopMemoryMaintenancePreview,
  DesktopMemoryPatchInput,
  DesktopMemoryProjection,
  DesktopMemoryProjectionQuery,
  DesktopMemoryRuntimeContext,
  DesktopMemorySearchItem,
  DesktopMemorySearchQuery,
  DesktopMemorySearchResponse,
  DesktopMemoryScope,
  DesktopMemoryScopeFilter,
  DesktopMemoryStatus,
  DesktopMemoryTier,
  DesktopMemoryTrace,
  DesktopMemoryUnit,
  DesktopMemoryWorkingSetPullQuery,
  DesktopMemoryWorkingSetPullResult,
  DesktopMemoryWorkingSetPushInput,
  DesktopMemoryWorkingSetPushResult,
} from "../../shared/desktop-memory";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopMemoryBridge = {
  listDesktopMemoryUnits: (params?: {
    workspaceId?: string;
    query?: DesktopMemoryListQuery;
  }) => Promise<DesktopMemoryListResponse>;
  getDesktopMemoryProjection: (params?: {
    workspaceId?: string;
    query?: DesktopMemoryProjectionQuery;
  }) => Promise<DesktopMemoryProjection>;
  appendDesktopMemory: (params: {
    workspaceId?: string;
    input: DesktopMemoryAppendInput;
  }) => Promise<DesktopMemoryUnit>;
  patchDesktopMemoryUnit: (params: {
    workspaceId?: string;
    unitId: string;
    input: DesktopMemoryPatchInput;
  }) => Promise<DesktopMemoryUnit>;
  removeDesktopMemoryUnit: (params: {
    workspaceId?: string;
    unitId: string;
  }) => Promise<DesktopMemoryDeleteResponse>;
  searchDesktopMemory: (params: {
    workspaceId?: string;
    query: DesktopMemorySearchQuery;
  }) => Promise<DesktopMemorySearchResponse>;
  listDesktopMemoryTraces: (params?: {
    workspaceId?: string;
    query?: {
      limit?: number;
      queryLike?: string;
      unitId?: string;
      from?: string;
      to?: string;
    };
  }) => Promise<{ items: DesktopMemoryTrace[] }>;
  getDesktopMemoryRuntimeContext: (params?: {
    workspaceId?: string;
    query?: string;
  }) => Promise<DesktopMemoryRuntimeContext>;
  previewDesktopMemoryMaintenance: (params?: {
    workspaceId?: string;
    input?: DesktopMemoryMaintenanceRequest;
  }) => Promise<DesktopMemoryMaintenancePreview>;
  applyDesktopMemoryMaintenance: (params: {
    workspaceId?: string;
    runId: string;
  }) => Promise<DesktopMemoryMaintenanceApply>;
  pullDesktopMemoryWorkingSet: (params: {
    workspaceId: string;
    query: DesktopMemoryWorkingSetPullQuery;
  }) => Promise<DesktopMemoryWorkingSetPullResult>;
  pushDesktopMemoryWorkingSet: (params: {
    workspaceId: string;
    input: DesktopMemoryWorkingSetPushInput;
  }) => Promise<DesktopMemoryWorkingSetPushResult>;
};

declare global {
  interface Window {
    maomiDesktopMemory?: DesktopMemoryBridge;
  }
}

export type MemoryAppendInput = DesktopMemoryAppendInput;
export type MemoryDeleteResponse = DesktopMemoryDeleteResponse;
export type MemoryDomain = DesktopMemoryDomain;
export type MemoryKind = DesktopMemoryKind;
export type MemoryListQuery = DesktopMemoryListQuery;
export type MemoryListResponse = DesktopMemoryListResponse;
export type MemoryMaintenanceApply = DesktopMemoryMaintenanceApply;
export type MemoryMaintenanceRequest = DesktopMemoryMaintenanceRequest;
export type MemoryMaintenancePreview = DesktopMemoryMaintenancePreview;
export type MemoryPatchInput = DesktopMemoryPatchInput;
export type MemoryProjection = DesktopMemoryProjection;
export type MemoryProjectionQuery = DesktopMemoryProjectionQuery;
export type MemoryRuntimeContext = DesktopMemoryRuntimeContext;
export type MemorySearchItem = DesktopMemorySearchItem;
export type MemorySearchQuery = DesktopMemorySearchQuery;
export type MemorySearchResponse = DesktopMemorySearchResponse;
export type MemoryScope = DesktopMemoryScope;
export type MemoryScopeFilter = DesktopMemoryScopeFilter;
export type MemoryStatus = DesktopMemoryStatus;
export type MemoryTier = DesktopMemoryTier;
export type MemoryTrace = DesktopMemoryTrace;
export type MemoryUnit = DesktopMemoryUnit;
export type MemoryWorkingSetPullQuery = DesktopMemoryWorkingSetPullQuery;
export type MemoryWorkingSetPullResult = DesktopMemoryWorkingSetPullResult;
export type MemoryWorkingSetPushInput = DesktopMemoryWorkingSetPushInput;
export type MemoryWorkingSetPushResult = DesktopMemoryWorkingSetPushResult;

export const DESKTOP_MEMORY_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopMemoryBridge(): DesktopMemoryBridge {
  const bridge = window.maomiDesktopMemory;
  if (!bridge) {
    throw new Error("Desktop memory bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopMemoryBridge(): boolean {
  return Boolean(window.maomiDesktopMemory);
}

export function fetchMemoryUnits(
  _baseUrl: string | undefined,
  workspaceId?: string,
  query: MemoryListQuery = {},
): Promise<MemoryListResponse> {
  return getDesktopMemoryBridge().listDesktopMemoryUnits({ workspaceId, query });
}

export function fetchMemoryProjection(
  _baseUrl: string | undefined,
  workspaceId?: string,
  query: MemoryProjectionQuery = {},
): Promise<MemoryProjection> {
  return getDesktopMemoryBridge().getDesktopMemoryProjection({ workspaceId, query });
}

export function appendMemoryCandidate(
  _baseUrl: string | undefined,
  workspaceId: string | undefined,
  payload: MemoryAppendInput,
): Promise<MemoryUnit> {
  return getDesktopMemoryBridge().appendDesktopMemory({ workspaceId, input: payload });
}

export function patchMemoryUnit(
  _baseUrl: string | undefined,
  workspaceId: string | undefined,
  unitId: string,
  payload: MemoryPatchInput,
): Promise<MemoryUnit> {
  return getDesktopMemoryBridge().patchDesktopMemoryUnit({
    workspaceId,
    unitId,
    input: payload,
  });
}

export function deleteMemoryUnit(
  _baseUrl: string | undefined,
  workspaceId: string | undefined,
  unitId: string,
): Promise<MemoryDeleteResponse> {
  return getDesktopMemoryBridge().removeDesktopMemoryUnit({ workspaceId, unitId });
}

export function searchMemory(
  _baseUrl: string | undefined,
  workspaceId: string | undefined,
  query: MemorySearchQuery,
): Promise<MemorySearchResponse> {
  return getDesktopMemoryBridge().searchDesktopMemory({ workspaceId, query });
}

export function pullWorkingSet(
  _baseUrl: string | undefined,
  workspaceId: string,
  query: MemoryWorkingSetPullQuery,
): Promise<MemoryWorkingSetPullResult> {
  return getDesktopMemoryBridge().pullDesktopMemoryWorkingSet({ workspaceId, query });
}

export function pushWorkingSet(
  _baseUrl: string | undefined,
  workspaceId: string,
  payload: MemoryWorkingSetPushInput,
): Promise<MemoryWorkingSetPushResult> {
  return getDesktopMemoryBridge().pushDesktopMemoryWorkingSet({ workspaceId, input: payload });
}

export function fetchMemoryTraces(
  _baseUrl: string | undefined,
  workspaceId?: string,
  query: {
    limit?: number;
    queryLike?: string;
    unitId?: string;
    from?: string;
    to?: string;
  } = {},
): Promise<{ items: MemoryTrace[] }> {
  return getDesktopMemoryBridge().listDesktopMemoryTraces({ workspaceId, query });
}

export function previewMemoryMaintenance(
  _baseUrl: string | undefined,
  workspaceId: string | undefined,
  payload: MemoryMaintenanceRequest,
): Promise<MemoryMaintenancePreview> {
  return getDesktopMemoryBridge().previewDesktopMemoryMaintenance({
    workspaceId,
    input: payload,
  });
}

export function applyMemoryMaintenance(
  _baseUrl: string | undefined,
  workspaceId: string | undefined,
  runId: string,
): Promise<MemoryMaintenanceApply> {
  return getDesktopMemoryBridge().applyDesktopMemoryMaintenance({ workspaceId, runId });
}

export function fetchMemoryRuntimeContext(
  _baseUrl: string | undefined,
  workspaceId?: string,
  query?: string,
): Promise<MemoryRuntimeContext> {
  return getDesktopMemoryBridge().getDesktopMemoryRuntimeContext({ workspaceId, query });
}