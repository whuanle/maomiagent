import type { DesktopFeishuActionExecutorPort } from "../../abstraction/ports/desktop-feishu-action-executor.ports";
import type { DesktopFeishuSmartAssistantActionRegistryPort } from "../../abstraction/ports/desktop-feishu-smart-assistant-action-registry.ports";
import type {
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
} from "../../../../../shared/desktop-feishu";

export class DesktopFeishuSmartAssistantActionExecutor
  implements DesktopFeishuActionExecutorPort {
  constructor(private readonly registry: DesktopFeishuSmartAssistantActionRegistryPort) {}

  async executeSmartAssistantAction(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView> {
    return this.registry.execute(input);
  }
}
