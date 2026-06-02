import type { RuntimeLogger } from "../../../logs";
import type { DesktopWorkspaceQueryPort } from "../../../workspace/abstraction/ports/desktop-workspace.ports";
import type {
  DesktopUiDesignerDesignPackageSaveInput,
  DesktopUiDesignerDesignPackageSaveResponse,
  DesktopUiDesignerDesignPackageSnapshot,
  DesktopUiDesignerReadiness,
  DesktopUiDesignerState,
  DesktopUiDesignerStateQuery,
} from "../../abstraction/models/desktop-ui-designer.models";
import type { DesktopUiDesignerPort } from "../../abstraction/ports/desktop-ui-designer.ports";
import { UiDesignerDesignPackageService } from "./ui-designer-design-package";
import { UiDesignerPreviewRuntimeService } from "./ui-designer-preview-runtime";

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function resolveReadiness(snapshot: DesktopUiDesignerDesignPackageSnapshot): DesktopUiDesignerReadiness {
  const stack = parseJsonObject(snapshot.files.stackJson);
  const theme = parseJsonObject(snapshot.files.themeJson);
  const pages = parseJsonObject(snapshot.files.pagesJson);
  const missing: string[] = [];

  if (typeof stack.framework !== "string" || !stack.framework.trim()) {
    missing.push("stack.framework");
  }
  if (typeof theme.style !== "string" || !theme.style.trim()) {
    missing.push("theme.style");
  }
  if (!Array.isArray(pages.templates) || pages.templates.length === 0) {
    missing.push("pages.templates");
  }
  if (
    stack.requiresDocumentation === true
    && !snapshot.files.sourcesMarkdown.includes("http")
  ) {
    missing.push("sources.documentation");
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export class DesktopUiDesignerService implements DesktopUiDesignerPort {
  constructor(
    private readonly workspaceQuery: DesktopWorkspaceQueryPort,
    private readonly logger: RuntimeLogger,
    private readonly designPackageService = new UiDesignerDesignPackageService(),
    private readonly previewRuntimeService = new UiDesignerPreviewRuntimeService(),
  ) {}

  async getState(query: DesktopUiDesignerStateQuery): Promise<DesktopUiDesignerState> {
    const workspace = await this.workspaceQuery.get(query.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${query.workspaceId}`);
    }

    const snapshot = await this.designPackageService.ensureDesignPackage({
      workspaceRoot: workspace.directoryPath,
    });
    const preview = await this.previewRuntimeService.getState();

    await this.logger.info("Loaded UI designer state", {
      context: {
        workspaceId: query.workspaceId,
        designRoot: snapshot.designRoot,
      },
    });

    return {
      workspaceId: workspace.workspaceId,
      designPackagePath: snapshot.designPackagePath,
      designRoot: snapshot.designRoot,
      hasDesignSpec: snapshot.hasDesignSpec,
      shouldSendKickoff: !snapshot.hasDesignSpec,
      ...(!snapshot.hasDesignSpec
        ? { kickoffPrompt: "我们先确认技术栈。请告诉我你要使用的前端框架和 UI 组件库。" }
        : {}),
      updatedAt: snapshot.updatedAt,
      readiness: resolveReadiness(snapshot),
      preview,
    };
  }

  async saveDesignPackage(
    input: DesktopUiDesignerDesignPackageSaveInput,
  ): Promise<DesktopUiDesignerDesignPackageSaveResponse> {
    const workspace = await this.workspaceQuery.get(input.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    }

    const snapshot = await this.designPackageService.saveDesignPackage({
      ...input,
      workspaceRoot: workspace.directoryPath,
    });

    return {
      workspaceId: input.workspaceId,
      designPackagePath: snapshot.designPackagePath,
      designRoot: snapshot.designRoot,
      updatedAt: snapshot.updatedAt,
      savedFiles: Object.keys(input.files) as Array<keyof typeof input.files>,
      state: await this.getState({ workspaceId: input.workspaceId }),
    };
  }
}
