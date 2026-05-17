import type { SingleInstanceController } from "../../../../single-instance";
import type { ModuleHost } from "../../../../shared/ioc";
import type { DesktopConfigurationInput } from "../../../configuration";
import type { DesktopObservabilityConfigInput } from "../../../observability/abstraction/models/desktop-observability-config";
import type {
  DesktopBrowserWindow,
  DesktopWindowFrame,
} from "../../../window/abstraction/models/desktop-window";

export type DesktopLogger = Pick<typeof console, "log" | "warn" | "error">;

export type DesktopBootstrapInput = {
  appIdentifier: string;
  appName: string;
  channel: string;
  mainViewUrl: string;
  singleInstance: SingleInstanceController;
  window: {
    title: string;
    frame: DesktopWindowFrame;
  };
  logger?: DesktopLogger;
  configuration?: DesktopConfigurationInput;
  observability?: DesktopObservabilityConfigInput;
  createWindow: (options: {
    title: string;
    url: string;
    frame: DesktopWindowFrame;
  }) => DesktopBrowserWindow;
  onHostCreated?: (host: ModuleHost) => void;
  installProcessHandlers?: boolean;
};

export type DesktopRuntimeContext = {
  appIdentifier: string;
  appName: string;
  channel: string;
  mainViewUrl: string;
  singleInstance: SingleInstanceController;
  logger: DesktopLogger;
  configuration?: DesktopConfigurationInput;
  observability?: DesktopObservabilityConfigInput;
  window: {
    title: string;
    frame: DesktopWindowFrame;
  };
  createWindow: (options: {
    title: string;
    url: string;
    frame: DesktopWindowFrame;
  }) => DesktopBrowserWindow;
  installProcessHandlers: boolean;
};