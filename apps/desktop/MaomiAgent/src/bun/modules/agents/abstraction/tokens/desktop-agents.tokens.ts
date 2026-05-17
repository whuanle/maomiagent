import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopAgentsCommandPort,
  DesktopAgentsPort,
  DesktopAgentsQueryPort,
} from "../ports/desktop-agents.ports";

const desktopAgents = createServiceNamespace("desktop.agents");

export const DESKTOP_AGENTS_PORT =
  desktopAgents.token<DesktopAgentsPort>("agents");
export const DESKTOP_AGENTS_QUERY_PORT =
  desktopAgents.token<DesktopAgentsQueryPort>("agents-query");
export const DESKTOP_AGENTS_COMMAND_PORT =
  desktopAgents.token<DesktopAgentsCommandPort>("agents-command");