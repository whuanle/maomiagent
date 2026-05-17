import { createServiceNamespace } from "../../../../shared/ioc";
import type {
  DesktopFeishuCommandPort,
  DesktopFeishuPort,
  DesktopFeishuQueryPort,
} from "../ports/desktop-feishu.ports";

const desktopFeishuNamespace = createServiceNamespace("desktop.feishu");

export const DESKTOP_FEISHU_PORT =
  desktopFeishuNamespace.token<DesktopFeishuPort>("port");

export const DESKTOP_FEISHU_QUERY_PORT =
  desktopFeishuNamespace.token<DesktopFeishuQueryPort>("query-port");

export const DESKTOP_FEISHU_COMMAND_PORT =
  desktopFeishuNamespace.token<DesktopFeishuCommandPort>("command-port");
