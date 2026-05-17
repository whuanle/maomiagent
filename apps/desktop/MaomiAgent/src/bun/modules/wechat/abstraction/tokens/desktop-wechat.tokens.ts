import { createServiceNamespace } from "../../../../shared/ioc";
import type {
  DesktopWechatCommandPort,
  DesktopWechatPort,
  DesktopWechatQueryPort,
} from "../ports/desktop-wechat.ports";

const desktopWechatNamespace = createServiceNamespace("desktop.wechat");

export const DESKTOP_WECHAT_PORT =
  desktopWechatNamespace.token<DesktopWechatPort>("port");

export const DESKTOP_WECHAT_QUERY_PORT =
  desktopWechatNamespace.token<DesktopWechatQueryPort>("query-port");

export const DESKTOP_WECHAT_COMMAND_PORT =
  desktopWechatNamespace.token<DesktopWechatCommandPort>("command-port");
