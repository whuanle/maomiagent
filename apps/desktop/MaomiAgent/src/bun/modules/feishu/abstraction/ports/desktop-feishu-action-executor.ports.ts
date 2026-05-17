import type {
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
} from "../../../../../shared/desktop-feishu";

export interface DesktopFeishuActionExecutorPort {
  executeSmartAssistantAction(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView>;
}
