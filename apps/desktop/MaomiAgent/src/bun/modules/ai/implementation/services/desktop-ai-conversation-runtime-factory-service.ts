import type { DesktopAgentsQueryPort } from "../../../agents";
import type { DesktopAiExecutionProfileMaterializerPort } from "../../abstraction/ports/desktop-ai-one-shot.ports";
import type { DesktopAiRuntimePort } from "../../abstraction/ports/desktop-ai-runtime.ports";
import type {
  DesktopAiConversationRuntimeFactoryPort,
  DesktopAiConversationRuntimePort,
} from "../../abstraction/ports/desktop-ai-conversation-runtime.ports";
import type { DesktopAiConversationRuntimeCreateInput } from "../../abstraction/models/desktop-ai-conversation-runtime.models";
import { DesktopAiConversationRuntime } from "./desktop-ai-conversation-runtime";

type DesktopAiConversationRuntimeFactoryServiceOptions = {
  agents: Pick<DesktopAgentsQueryPort, "list">;
  runtime: Pick<DesktopAiRuntimePort, "createTurnPort">;
  materializer: Pick<DesktopAiExecutionProfileMaterializerPort, "materialize">;
};

export class DesktopAiConversationRuntimeFactoryService
implements DesktopAiConversationRuntimeFactoryPort {
  constructor(private readonly options: DesktopAiConversationRuntimeFactoryServiceOptions) {}

  createConversationRuntime(
    input: DesktopAiConversationRuntimeCreateInput,
  ): DesktopAiConversationRuntimePort {
    return new DesktopAiConversationRuntime({
      ...input,
      agents: this.options.agents,
      aiRuntime: this.options.runtime,
      materializer: this.options.materializer,
    });
  }
}