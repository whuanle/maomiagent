import { createServiceNamespace } from "../../../../shared/ioc";

import type { DesktopAiRuntimePort } from "../ports/desktop-ai-runtime.ports";

const desktopAi = createServiceNamespace("desktop.ai");

export const DESKTOP_AI_RUNTIME_PORT =
  desktopAi.token<DesktopAiRuntimePort>("runtime");