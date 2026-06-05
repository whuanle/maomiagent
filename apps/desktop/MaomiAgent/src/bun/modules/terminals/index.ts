export type {
  DesktopTerminalCloseResponse,
  DesktopTerminalCreateInput,
  DesktopTerminalDetailQuery,
  DesktopTerminalExecuteInput,
  DesktopTerminalListQuery,
  DesktopTerminalSessionDetail,
  DesktopTerminalSessionListResponse,
  DesktopTerminalSessionRecord,
  DesktopTerminalShellKind,
  DesktopTerminalStatus,
} from "./abstraction/models/desktop-terminals.models";
export type {
  DesktopTerminalsCommandPort,
  DesktopTerminalsPort,
  DesktopTerminalsQueryPort,
} from "./abstraction/ports/desktop-terminals.ports";
export {
  DESKTOP_TERMINALS_COMMAND_PORT,
  DESKTOP_TERMINALS_PORT,
  DESKTOP_TERMINALS_QUERY_PORT,
} from "./abstraction/tokens/desktop-terminals.tokens";
export { DesktopTerminalsModule } from "./composition/terminals.module";
export { DesktopTerminalsService } from "./implementation/services/desktop-terminals-service";
export type {
  DesktopResolvedShellKind,
  DesktopShellProfile,
} from "./implementation/services/desktop-shell-profile.models";
export type { DesktopShellExecutableProbe } from "./implementation/services/desktop-shell-profile-service";
export { DesktopShellProfileService } from "./implementation/services/desktop-shell-profile-service";
