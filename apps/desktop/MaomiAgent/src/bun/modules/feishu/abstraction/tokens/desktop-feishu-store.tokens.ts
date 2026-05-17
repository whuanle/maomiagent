import { createServiceNamespace } from "../../../../shared/ioc";
import type { DesktopFeishuStorePort } from "../ports/desktop-feishu-store.ports";

const desktopFeishuStoreNamespace = createServiceNamespace("desktop.feishu.store");

export const DESKTOP_FEISHU_STORE_PORT =
  desktopFeishuStoreNamespace.token<DesktopFeishuStorePort>("port");
