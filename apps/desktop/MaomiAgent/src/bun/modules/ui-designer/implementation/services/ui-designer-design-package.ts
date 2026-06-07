import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  DesktopUiDesignerDesignPackageFiles,
  DesktopUiDesignerDesignPackageSaveInput,
  DesktopUiDesignerDesignPackageSnapshot,
} from "../../abstraction/models/desktop-ui-designer.models";
import { resolveUiDesignerPaths } from "./ui-designer-paths";

const DEFAULT_FILES: DesktopUiDesignerDesignPackageFiles = {
  designSpecMarkdown: `# UI Design Spec

## 技术栈

- framework:
- uiLibrary:

## 主题

- style:
`,
  stackJson: JSON.stringify({
    framework: "",
    uiLibrary: "",
    packageManager: "",
    buildTool: "",
    styleSolution: "",
    iconStyle: "",
    requiresDocumentation: false,
  }, null, 2),
  scopeJson: JSON.stringify({
    projectType: "",
    businessType: "",
    selectedSections: [],
  }, null, 2),
  themeJson: JSON.stringify({
    style: "",
    colorPalette: [],
    radiusScale: "md",
  }, null, 2),
  patternsJson: JSON.stringify({ groups: [] }, null, 2),
  layoutsJson: JSON.stringify({ items: [] }, null, 2),
  pagesJson: JSON.stringify({ templates: [], modules: [] }, null, 2),
  sourcesMarkdown: `# References

`,
  generationLogMarkdown: `# Generation Log

`,
};

const FILE_NAME_MAP: Record<keyof DesktopUiDesignerDesignPackageFiles, string> = {
  designSpecMarkdown: "design-spec.md",
  stackJson: "stack.json",
  scopeJson: "scope.json",
  themeJson: "theme.json",
  patternsJson: "patterns.json",
  layoutsJson: "layouts.json",
  pagesJson: "pages.json",
  sourcesMarkdown: "sources.md",
  generationLogMarkdown: "generation-log.md",
};

async function readFileOrDefault(path: string, fallback: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return fallback;
  }
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class UiDesignerDesignPackageService {
  async ensureDesignPackage(input: {
    workspaceRoot: string;
  }): Promise<DesktopUiDesignerDesignPackageSnapshot> {
    const paths = resolveUiDesignerPaths(input.workspaceRoot);
    const designSpecPath = join(paths.designRoot, FILE_NAME_MAP.designSpecMarkdown);
    const hasDesignSpec = await fileExists(designSpecPath);
    await mkdir(paths.designRoot, { recursive: true });
    await mkdir(paths.previewAppRoot, { recursive: true });
    await mkdir(paths.generatedAppRoot, { recursive: true });
    await mkdir(paths.runtimeRoot, { recursive: true });

    const files = {} as DesktopUiDesignerDesignPackageFiles;
    const keys = Object.keys(FILE_NAME_MAP) as Array<keyof DesktopUiDesignerDesignPackageFiles>;

    for (const key of keys) {
      const targetPath = join(paths.designRoot, FILE_NAME_MAP[key]);
      const content = await readFileOrDefault(targetPath, DEFAULT_FILES[key]);
      await writeFile(targetPath, content, "utf8");
      files[key] = content;
    }

    return {
      designPackagePath: paths.designRoot,
      designRoot: paths.designRoot,
      hasDesignSpec,
      files,
      updatedAt: new Date().toISOString(),
    };
  }

  async saveDesignPackage(
    input: {
      workspaceRoot: string;
    } & DesktopUiDesignerDesignPackageSaveInput,
  ): Promise<DesktopUiDesignerDesignPackageSnapshot> {
    const current = await this.ensureDesignPackage({ workspaceRoot: input.workspaceRoot });
    const paths = resolveUiDesignerPaths(input.workspaceRoot);
    const files = {
      ...current.files,
      ...input.files,
    };

    const keys = Object.keys(FILE_NAME_MAP) as Array<keyof DesktopUiDesignerDesignPackageFiles>;
    for (const key of keys) {
      if (!(key in input.files)) {
        continue;
      }
      await writeFile(join(paths.designRoot, FILE_NAME_MAP[key]), files[key], "utf8");
    }

    return {
      designPackagePath: paths.designRoot,
      designRoot: paths.designRoot,
      hasDesignSpec: true,
      files,
      updatedAt: new Date().toISOString(),
    };
  }
}
