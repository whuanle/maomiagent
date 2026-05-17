import type {
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
} from "../../../../../shared/desktop-feishu";

export interface DesktopFeishuSmartAssistantActionRegistryPort {
  execute(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView>;
}
