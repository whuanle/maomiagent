import { createServiceNamespace } from "../../../../shared/ioc";
import type {
  DesktopMemoryCommandPort,
  DesktopMemoryPort,
  DesktopMemoryQueryPort,
  DesktopMemoryRuntimePort,
} from "../ports/desktop-memory.ports";

const desktopMemory = createServiceNamespace("desktop.memory");

export const DESKTOP_MEMORY_PORT =
  desktopMemory.token<DesktopMemoryPort>("memory");
export const DESKTOP_MEMORY_QUERY_PORT =
  desktopMemory.token<DesktopMemoryQueryPort>("memory-query");
export const DESKTOP_MEMORY_COMMAND_PORT =
  desktopMemory.token<DesktopMemoryCommandPort>("memory-command");
export const DESKTOP_MEMORY_RUNTIME_PORT =
  desktopMemory.token<DesktopMemoryRuntimePort>("memory-runtime");