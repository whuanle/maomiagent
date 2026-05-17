export type {
  DesktopConfigurationInput,
  DesktopConfigurationSnapshot,
  DesktopConfigurationSource,
  DesktopConfigurationValues,
} from "./abstraction/models/desktop-configuration.models";
export type { DesktopConfigurationPort } from "./abstraction/ports/desktop-configuration.port";
export { DESKTOP_CONFIGURATION_PORT } from "./abstraction/tokens";
export { DesktopConfigurationModule } from "./composition/configuration.module";
export { DesktopConfigurationService } from "./implementation/services/desktop-configuration-service";