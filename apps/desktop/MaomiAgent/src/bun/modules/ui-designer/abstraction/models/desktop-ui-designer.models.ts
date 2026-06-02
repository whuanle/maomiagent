import type {
  DesktopUiDesignerDesignPackageFiles,
  DesktopUiDesignerDesignPackageSaveInput,
  DesktopUiDesignerDesignPackageSaveResponse,
  DesktopUiDesignerPreviewState,
  DesktopUiDesignerReadiness,
  DesktopUiDesignerState,
  DesktopUiDesignerStateQuery,
} from "../../../../../shared/desktop-ui-designer";

export type {
  DesktopUiDesignerDesignPackageFiles,
  DesktopUiDesignerDesignPackageSaveInput,
  DesktopUiDesignerDesignPackageSaveResponse,
  DesktopUiDesignerPreviewState,
  DesktopUiDesignerReadiness,
  DesktopUiDesignerState,
  DesktopUiDesignerStateQuery,
};

export type DesktopUiDesignerDesignPackageSnapshot = {
  designPackagePath: string;
  designRoot: string;
  hasDesignSpec: boolean;
  files: DesktopUiDesignerDesignPackageFiles;
  updatedAt: string;
};
