import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopConversationTaskBridgePort,
  DesktopScheduledTaskHandler,
  DesktopScheduledTaskRegistryPort,
  DesktopTasksCommandPort,
  DesktopTasksPort,
  DesktopTasksQueryPort,
} from "../ports/desktop-tasks.ports";

const desktopTasks = createServiceNamespace("desktop.tasks");

export const DESKTOP_TASKS_PORT =
  desktopTasks.token<DesktopTasksPort>("tasks");
export const DESKTOP_TASKS_QUERY_PORT =
  desktopTasks.token<DesktopTasksQueryPort>("tasks-query");
export const DESKTOP_TASKS_COMMAND_PORT =
  desktopTasks.token<DesktopTasksCommandPort>("tasks-command");
export const DESKTOP_CONVERSATION_TASK_BRIDGE_PORT =
  desktopTasks.token<DesktopConversationTaskBridgePort>("conversation-task-bridge");
export const DESKTOP_SCHEDULED_TASK_HANDLER =
  desktopTasks.token<DesktopScheduledTaskHandler>("scheduled-task-handler");
export const DESKTOP_SCHEDULED_TASK_REGISTRY_PORT =
  desktopTasks.token<DesktopScheduledTaskRegistryPort>("scheduled-task-registry");