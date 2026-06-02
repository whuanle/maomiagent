import type { DesktopUiDesignerPreviewState } from "../../abstraction/models/desktop-ui-designer.models";

export class UiDesignerPreviewRuntimeService {
  async getState(): Promise<DesktopUiDesignerPreviewState> {
    return {
      mode: "preview-app",
      status: "idle",
    };
  }
}
