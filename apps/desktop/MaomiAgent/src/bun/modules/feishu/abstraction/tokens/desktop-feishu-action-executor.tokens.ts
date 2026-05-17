import { createServiceNamespace } from "../../../../shared/ioc";
import type { DesktopFeishuActionExecutorPort } from "../ports/desktop-feishu-action-executor.ports";

const desktopFeishuActionNamespace = createServiceNamespace("desktop.feishu.action-executor");

export const DESKTOP_FEISHU_ACTION_EXECUTOR_PORT =
  desktopFeishuActionNamespace.token<DesktopFeishuActionExecutorPort>("port");
