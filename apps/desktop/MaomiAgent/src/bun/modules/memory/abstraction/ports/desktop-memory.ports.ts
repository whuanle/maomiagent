import type {
  DesktopMemoryAgentMemoryPack,
  DesktopMemoryAppendInput,
  DesktopMemoryDeleteResponse,
  DesktopMemoryListQuery,
  DesktopMemoryListResponse,
  DesktopMemoryMaintenanceApply,
  DesktopMemoryMaintenancePreview,
  DesktopMemoryMaintenanceRequest,
  DesktopMemoryPatchInput,
  DesktopMemoryProjection,
  DesktopMemoryRuntimeContext,
  DesktopMemorySearchQuery,
  DesktopMemorySearchResponse,
  DesktopMemoryTrace,
  DesktopMemoryTraceListQuery,
  DesktopMemoryUnit,
  DesktopMemoryWorkingSetPullQuery,
  DesktopMemoryWorkingSetPullResult,
  DesktopMemoryWorkingSetPushInput,
  DesktopMemoryWorkingSetPushResult,
} from "../models/desktop-memory.models";

export interface DesktopMemoryQueryPort {
  listUnits(input?: {
    workspaceId?: string;
  } & DesktopMemoryListQuery): Promise<DesktopMemoryListResponse>;
  getProjection(input?: {
    workspaceId?: string;
    units?: DesktopMemoryListQuery;
    traces?: DesktopMemoryTraceListQuery;
    runtimeContextQuery?: string;
  }): Promise<DesktopMemoryProjection>;
  search(input: {
    workspaceId?: string;
  } & DesktopMemorySearchQuery): Promise<DesktopMemorySearchResponse>;
  listRetrievalTraces(input?: {
    workspaceId?: string;
  } & DesktopMemoryTraceListQuery): Promise<DesktopMemoryTrace[]>;
  getRuntimeContext(input?: {
    workspaceId?: string;
    query?: string;
  }): Promise<DesktopMemoryRuntimeContext>;
  pullWorkingSet(input: {
    workspaceId: string;
  } & DesktopMemoryWorkingSetPullQuery): Promise<DesktopMemoryWorkingSetPullResult>;
}

export interface DesktopMemoryCommandPort {
  append(input: DesktopMemoryAppendInput): Promise<DesktopMemoryUnit>;
  patch(input: {
    workspaceId?: string;
    unitId: string;
    patch: DesktopMemoryPatchInput;
  }): Promise<DesktopMemoryUnit>;
  remove(input: {
    workspaceId?: string;
    unitId: string;
  }): Promise<DesktopMemoryDeleteResponse>;
  previewMaintenance(input: {
    workspaceId?: string;
  } & DesktopMemoryMaintenanceRequest): Promise<DesktopMemoryMaintenancePreview>;
  applyMaintenance(input: {
    workspaceId?: string;
    runId: string;
  }): Promise<DesktopMemoryMaintenanceApply>;
  pushWorkingSet(input: {
    workspaceId: string;
  } & DesktopMemoryWorkingSetPushInput): Promise<DesktopMemoryWorkingSetPushResult>;
}

export interface DesktopMemoryRuntimePort {
  buildAgentMemoryPack(input: {
    workspaceId?: string;
    runId?: string;
    agentId?: string;
    query?: string;
    topK?: number;
  }): Promise<DesktopMemoryAgentMemoryPack>;
}

export type DesktopMemoryPort =
  & DesktopMemoryQueryPort
  & DesktopMemoryCommandPort
  & DesktopMemoryRuntimePort;