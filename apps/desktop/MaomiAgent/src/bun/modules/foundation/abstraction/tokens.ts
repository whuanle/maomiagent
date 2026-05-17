import { createServiceNamespace } from "../../../shared/ioc";

import type { DesktopAppInfo } from "./models/desktop-app-info";
import type { DesktopRuntimeContext } from "./models/desktop-runtime-context";

const desktopFoundationNamespace = createServiceNamespace("desktop.foundation");

export const DESKTOP_APP_INFO =
  desktopFoundationNamespace.token<DesktopAppInfo>("app-info");
export const DESKTOP_STARTUP_TRACE =
  desktopFoundationNamespace.token<string[]>("startup-trace");
export const DESKTOP_RUNTIME_CONTEXT =
  desktopFoundationNamespace.token<DesktopRuntimeContext>("runtime-context");