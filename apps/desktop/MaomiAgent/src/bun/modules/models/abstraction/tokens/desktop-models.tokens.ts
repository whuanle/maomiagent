import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopModelsCommandPort,
  DesktopModelsPort,
  DesktopModelsQueryPort,
} from "../ports/desktop-models.ports";

const desktopModels = createServiceNamespace("desktop.models");

export const DESKTOP_MODELS_PORT =
  desktopModels.token<DesktopModelsPort>("models");
export const DESKTOP_MODELS_QUERY_PORT =
  desktopModels.token<DesktopModelsQueryPort>("models-query");
export const DESKTOP_MODELS_COMMAND_PORT =
  desktopModels.token<DesktopModelsCommandPort>("models-command");