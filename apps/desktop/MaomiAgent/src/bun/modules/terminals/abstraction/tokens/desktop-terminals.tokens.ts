import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopTerminalsCommandPort,
  DesktopTerminalsPort,
  DesktopTerminalsQueryPort,
} from "../ports/desktop-terminals.ports";

const desktopTerminals = createServiceNamespace("desktop.terminals");

export const DESKTOP_TERMINALS_PORT =
  desktopTerminals.token<DesktopTerminalsPort>("terminals");
export const DESKTOP_TERMINALS_QUERY_PORT =
  desktopTerminals.token<DesktopTerminalsQueryPort>("terminals-query");
export const DESKTOP_TERMINALS_COMMAND_PORT =
  desktopTerminals.token<DesktopTerminalsCommandPort>("terminals-command");