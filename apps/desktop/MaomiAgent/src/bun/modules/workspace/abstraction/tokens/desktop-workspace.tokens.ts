import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopWorkspaceCommandPort,
  DesktopWorkspacePort,
  DesktopWorkspaceQueryPort,
} from "../ports/desktop-workspace.ports";

const desktopWorkspace = createServiceNamespace("desktop.workspace");

export const DESKTOP_WORKSPACE_PORT =
  desktopWorkspace.token<DesktopWorkspacePort>("workspace");
export const DESKTOP_WORKSPACE_QUERY_PORT =
  desktopWorkspace.token<DesktopWorkspaceQueryPort>("workspace-query");
export const DESKTOP_WORKSPACE_COMMAND_PORT =
  desktopWorkspace.token<DesktopWorkspaceCommandPort>("workspace-command");