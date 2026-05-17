import type {
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantDomainKey,
  FeishuSmartAssistantExecuteActionInput,
} from "../../../../../../shared/desktop-feishu";

export type DomainHandlerContext = {
  input: FeishuSmartAssistantExecuteActionInput;
  domain: FeishuSmartAssistantDomainKey;
  availableRuntimeCount: number;
};

export interface DesktopFeishuDomainActionHandler {
  supports(domain: FeishuSmartAssistantDomainKey): boolean;
  execute(context: DomainHandlerContext): Promise<FeishuSmartAssistantActionExecuteResultView>;
}
