import type {
  DesktopUiDesignerDesignPackageSaveInput,
  DesktopUiDesignerDesignPackageSaveResponse,
  DesktopUiDesignerState,
  DesktopUiDesignerStateQuery,
} from "../../shared/desktop-ui-designer";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopUiDesignerBridge = {
  getDesktopUiDesignerState: (query: DesktopUiDesignerStateQuery) => Promise<DesktopUiDesignerState>;
  saveDesktopUiDesignerDesignPackage: (
    input: DesktopUiDesignerDesignPackageSaveInput,
  ) => Promise<DesktopUiDesignerDesignPackageSaveResponse>;
};

declare global {
  interface Window {
    maomiDesktopUiDesigner?: DesktopUiDesignerBridge;
  }
}

export const DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopUiDesignerBridge(): DesktopUiDesignerBridge {
  const bridge = window.maomiDesktopUiDesigner;
  if (!bridge) {
    throw new Error("Desktop UI designer bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopUiDesignerBridge(): boolean {
  return Boolean(window.maomiDesktopUiDesigner);
}

export function getDesktopUiDesignerState(
  query: DesktopUiDesignerStateQuery,
): Promise<DesktopUiDesignerState> {
  return getDesktopUiDesignerBridge().getDesktopUiDesignerState(query);
}

export function saveDesktopUiDesignerDesignPackage(
  input: DesktopUiDesignerDesignPackageSaveInput,
): Promise<DesktopUiDesignerDesignPackageSaveResponse> {
  return getDesktopUiDesignerBridge().saveDesktopUiDesignerDesignPackage(input);
}
