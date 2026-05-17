import { createServiceNamespace } from "../../../../shared/ioc";
import type { DesktopFeishuSmartAssistantActionRegistryPort } from "../ports/desktop-feishu-smart-assistant-action-registry.ports";

const desktopFeishuActionRegistryNamespace =
  createServiceNamespace("desktop.feishu.smart-assistant.action-registry");

export const DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT =
  desktopFeishuActionRegistryNamespace.token<DesktopFeishuSmartAssistantActionRegistryPort>("port");
