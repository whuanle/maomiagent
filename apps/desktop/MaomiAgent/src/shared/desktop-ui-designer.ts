export type DesktopUiDesignerPreviewMode = "preview-app" | "generated-app";
export type DesktopUiDesignerPreviewStatus = "idle" | "starting" | "ready" | "failed";

export type DesktopUiDesignerReadiness = {
  ready: boolean;
  missing: string[];
};

export type DesktopUiDesignerPreviewState = {
  mode: DesktopUiDesignerPreviewMode;
  status: DesktopUiDesignerPreviewStatus;
  url?: string;
  port?: number;
  message?: string;
};

export type DesktopUiDesignerStateQuery = {
  workspaceId: string;
};

export type DesktopUiDesignerState = {
  workspaceId: string;
  designPackagePath: string;
  designRoot: string;
  hasDesignSpec: boolean;
  shouldSendKickoff: boolean;
  kickoffPrompt?: string;
  updatedAt: string;
  lockReason?: string;
  readiness: DesktopUiDesignerReadiness;
  preview: DesktopUiDesignerPreviewState;
};

export type DesktopUiDesignerDesignPackageFileKey =
  | "designSpecMarkdown"
  | "stackJson"
  | "scopeJson"
  | "themeJson"
  | "patternsJson"
  | "layoutsJson"
  | "pagesJson"
  | "sourcesMarkdown"
  | "generationLogMarkdown";

export type DesktopUiDesignerDesignPackageFiles = Record<
  DesktopUiDesignerDesignPackageFileKey,
  string
>;

export type DesktopUiDesignerDesignPackageSaveInput = {
  workspaceId: string;
  files: Partial<DesktopUiDesignerDesignPackageFiles>;
};

export type DesktopUiDesignerDesignPackageSaveResponse = {
  workspaceId: string;
  designPackagePath: string;
  designRoot: string;
  updatedAt: string;
  savedFiles: DesktopUiDesignerDesignPackageFileKey[];
  state: DesktopUiDesignerState;
};
