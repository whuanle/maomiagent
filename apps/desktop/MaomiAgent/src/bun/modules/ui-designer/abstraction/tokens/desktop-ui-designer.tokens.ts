import { createServiceToken } from "../../../../shared/ioc";
import type {
  DesktopUiDesignerCommandPort,
  DesktopUiDesignerPort,
  DesktopUiDesignerQueryPort,
} from "../ports/desktop-ui-designer.ports";

export const DESKTOP_UI_DESIGNER_PORT =
  createServiceToken<DesktopUiDesignerPort>("desktop.ui-designer.port");
export const DESKTOP_UI_DESIGNER_QUERY_PORT =
  createServiceToken<DesktopUiDesignerQueryPort>("desktop.ui-designer.query-port");
export const DESKTOP_UI_DESIGNER_COMMAND_PORT =
  createServiceToken<DesktopUiDesignerCommandPort>("desktop.ui-designer.command-port");
