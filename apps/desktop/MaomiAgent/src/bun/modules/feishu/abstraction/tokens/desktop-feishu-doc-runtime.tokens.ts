import { createServiceNamespace } from "../../../../shared/ioc";
import type { DesktopFeishuDocRuntimePort } from "../ports/desktop-feishu-doc-runtime.ports";

const desktopFeishuDocRuntimeNamespace = createServiceNamespace("desktop.feishu.doc-runtime");

export const DESKTOP_FEISHU_DOC_RUNTIME_PORT =
  desktopFeishuDocRuntimeNamespace.token<DesktopFeishuDocRuntimePort>("port");
