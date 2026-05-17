export type {
  DesktopMemoryAgentMemoryPack,
  DesktopMemoryAppendInput,
  DesktopMemoryDeleteResponse,
  DesktopMemoryDomain,
  DesktopMemoryKind,
  DesktopMemoryListQuery,
  DesktopMemoryListResponse,
  DesktopMemoryMaintenanceApply,
  DesktopMemoryMaintenancePreview,
  DesktopMemoryPatchInput,
  DesktopMemoryProjection,
  DesktopMemoryProjectionQuery,
  DesktopMemoryRuntimeContext,
  DesktopMemorySearchItem,
  DesktopMemorySearchQuery,
  DesktopMemorySearchResponse,
  DesktopMemoryStatus,
  DesktopMemoryTier,
  DesktopMemoryTrace,
  DesktopMemoryTraceListQuery,
  DesktopMemoryUnit,
  DesktopMemoryWorkingSetPullQuery,
  DesktopMemoryWorkingSetPullResult,
  DesktopMemoryWorkingSetPushInput,
  DesktopMemoryWorkingSetPushResult,
} from "./abstraction/models/desktop-memory.models";
export type {
  DesktopMemoryCommandPort,
  DesktopMemoryPort,
  DesktopMemoryQueryPort,
  DesktopMemoryRuntimePort,
} from "./abstraction/ports/desktop-memory.ports";
export {
  DESKTOP_MEMORY_COMMAND_PORT,
  DESKTOP_MEMORY_PORT,
  DESKTOP_MEMORY_QUERY_PORT,
  DESKTOP_MEMORY_RUNTIME_PORT,
} from "./abstraction/tokens/desktop-memory.tokens";
export { DesktopMemoryModule } from "./composition/memory.module";
export {
  DesktopMemoryService,
  DesktopMemoryServiceError,
} from "./implementation/services/desktop-memory-service";