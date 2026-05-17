import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopAiExecutionProfileMaterializerPort,
  DesktopAiOneShotPort,
} from "../ports/desktop-ai-one-shot.ports";

const desktopAi = createServiceNamespace("desktop.ai");

export const DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_PORT =
  desktopAi.token<DesktopAiExecutionProfileMaterializerPort>("execution-profile-materializer");

export const DESKTOP_AI_ONE_SHOT_PORT =
  desktopAi.token<DesktopAiOneShotPort>("one-shot");