import { createServiceNamespace } from "../../../../shared/ioc";

import type { DesktopAiConversationRuntimeFactoryPort } from "../ports/desktop-ai-conversation-runtime.ports";

const desktopAi = createServiceNamespace("desktop.ai");

export const DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_PORT =
  desktopAi.token<DesktopAiConversationRuntimeFactoryPort>("conversation-runtime-factory");