import type {
  DesktopUiDesignerDesignPackageSaveInput,
  DesktopUiDesignerDesignPackageSaveResponse,
  DesktopUiDesignerState,
  DesktopUiDesignerStateQuery,
} from "../models/desktop-ui-designer.models";

export interface DesktopUiDesignerQueryPort {
  getState(query: DesktopUiDesignerStateQuery): Promise<DesktopUiDesignerState>;
}

export interface DesktopUiDesignerCommandPort {
  saveDesignPackage(
    input: DesktopUiDesignerDesignPackageSaveInput,
  ): Promise<DesktopUiDesignerDesignPackageSaveResponse>;
}

export type DesktopUiDesignerPort = DesktopUiDesignerQueryPort & DesktopUiDesignerCommandPort;
