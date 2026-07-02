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

const PREVIEW_APP_SPLIT_MARKER = "data-maomi-preview-shell=\"split-v1\"";
const PREVIEW_APP_INDEX_BYTES_THRESHOLD = 32 * 1024;
const PREVIEW_APP_SHELL_CSS_PATH = "assets/shell.css";
const PREVIEW_APP_SHELL_JS_PATH = "assets/shell.js";
const PREVIEW_APP_PAGE_HTML_PATH = "pages/app.html";
const PREVIEW_APP_PAGE_CSS_PATH = "assets/app.css";
const PREVIEW_APP_PAGE_JS_PATH = "assets/app.js";

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readHtmlTitle(source: string): string | undefined {
  const match = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeOptionalText(match?.[1]);
}

function readBodyHtml(source: string): string {
  const match = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match?.[1] ?? source).trim();
}

function isExecutableInlineScript(attrs: string): boolean {
  const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
  if (!typeMatch?.[1]) {
    return true;
  }

  const normalizedType = typeMatch[1].trim().toLowerCase();
  return normalizedType === "module"
    || normalizedType === "text/javascript"
    || normalizedType === "application/javascript"
    || normalizedType === "application/ecmascript"
    || normalizedType === "text/ecmascript";
}

function extractInlineExecutableScripts(source: string): {
  html: string;
  scripts: string[];
} {
  const scripts: string[] = [];
  const html = source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, rawAttrs: string, rawContent: string) => {
    if (/\bsrc\s*=\s*/i.test(rawAttrs) || !isExecutableInlineScript(rawAttrs)) {
      return full;
    }

    const content = normalizeOptionalText(rawContent);
    if (content) {
      scripts.push(content);
    }
    return "";
  });

  return {
    html,
    scripts,
  };
}

function extractInlineStyles(source: string): {
  html: string;
  styles: string[];
} {
  const styles: string[] = [];
  const html = source.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, rawContent: string) => {
    const content = normalizeOptionalText(rawContent);
    if (content) {
      styles.push(content);
    }
    return "";
  });

  return {
    html,
    styles,
  };
}

function createPreviewShellHtml(title: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="./${PREVIEW_APP_SHELL_CSS_PATH}" />
  </head>
  <body ${PREVIEW_APP_SPLIT_MARKER}>
    <div class="preview-shell">
      <aside class="preview-shell-nav" aria-label="预览页面导航">
        <button
          type="button"
          class="preview-shell-tab is-active"
          data-preview-page="./${PREVIEW_APP_PAGE_HTML_PATH}"
        >
          主预览
        </button>
      </aside>
      <main class="preview-shell-main">
        <iframe
          class="preview-shell-frame"
          title="UI Preview"
          src="./${PREVIEW_APP_PAGE_HTML_PATH}"
          loading="eager"
        ></iframe>
      </main>
    </div>
    <script type="module" src="./${PREVIEW_APP_SHELL_JS_PATH}"></script>
  </body>
</html>
`;
}

function createPreviewShellCss() {
  return `.preview-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
  background: #0f172a;
  color: #e2e8f0;
}

.preview-shell-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: #111827;
  border-right: 1px solid rgba(148, 163, 184, 0.24);
}

.preview-shell-tab {
  appearance: none;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: #1f2937;
  color: #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}

.preview-shell-tab.is-active {
  border-color: #22d3ee;
  color: #cffafe;
  background: #0f3440;
}

.preview-shell-main {
  min-height: 100vh;
}

.preview-shell-frame {
  display: block;
  width: 100%;
  min-height: 100vh;
  border: none;
  background: #ffffff;
}

@media (max-width: 900px) {
  .preview-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .preview-shell-nav {
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.24);
  }
}
`;
}

function createPreviewShellJs() {
  return `const frame = document.querySelector(".preview-shell-frame");
const tabs = Array.from(document.querySelectorAll(".preview-shell-tab"));

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const nextPage = tab.getAttribute("data-preview-page");
    if (!frame || !nextPage) {
      return;
    }

    frame.setAttribute("src", nextPage);
    for (const item of tabs) {
      item.classList.toggle("is-active", item === tab);
    }
  });
}
`;
}

function createPreviewPageHtml(input: {
  title: string;
  bodyHtml: string;
  hasExternalCss: boolean;
  hasExternalJs: boolean;
}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="../" />
    <title>${input.title}</title>
    ${input.hasExternalCss ? `<link rel="stylesheet" href="./${PREVIEW_APP_PAGE_CSS_PATH}" />` : ""}
  </head>
  <body>
${input.bodyHtml}
${input.hasExternalJs ? `    <script type="module" src="./${PREVIEW_APP_PAGE_JS_PATH}"></script>` : ""}
  </body>
</html>
`;
}

async function normalizePreviewAppIndex(previewAppRoot: string) {
  const previewIndexPath = join(previewAppRoot, "index.html");
  if (!(await fileExists(previewIndexPath))) {
    return;
  }

  const source = await readFile(previewIndexPath, "utf8");
  if (!source.trim() || source.includes(PREVIEW_APP_SPLIT_MARKER)) {
    return;
  }

  const inlineStylesResult = extractInlineStyles(source);
  const inlineScriptsResult = extractInlineExecutableScripts(inlineStylesResult.html);
  const bodyHtml = readBodyHtml(inlineScriptsResult.html);
  const sourceBytes = Buffer.byteLength(source, "utf8");

  const shouldSplit = sourceBytes >= PREVIEW_APP_INDEX_BYTES_THRESHOLD
    || inlineStylesResult.styles.length > 0
    || inlineScriptsResult.scripts.length > 0;
  if (!shouldSplit || !bodyHtml) {
    return;
  }

  await mkdir(join(previewAppRoot, "assets"), { recursive: true });
  await mkdir(join(previewAppRoot, "pages"), { recursive: true });

  const title = readHtmlTitle(source) ?? "UI Preview";
  const pageCss = inlineStylesResult.styles.join("\n\n").trim();
  const pageJs = inlineScriptsResult.scripts.join("\n\n").trim();

  await writeFile(join(previewAppRoot, PREVIEW_APP_SHELL_CSS_PATH), createPreviewShellCss(), "utf8");
  await writeFile(join(previewAppRoot, PREVIEW_APP_SHELL_JS_PATH), createPreviewShellJs(), "utf8");
  if (pageCss) {
    await writeFile(join(previewAppRoot, PREVIEW_APP_PAGE_CSS_PATH), `${pageCss}\n`, "utf8");
  }
  if (pageJs) {
    await writeFile(join(previewAppRoot, PREVIEW_APP_PAGE_JS_PATH), `${pageJs}\n`, "utf8");
  }

  await writeFile(join(previewAppRoot, PREVIEW_APP_PAGE_HTML_PATH), createPreviewPageHtml({
    title,
    bodyHtml,
    hasExternalCss: pageCss.length > 0,
    hasExternalJs: pageJs.length > 0,
  }), "utf8");

  await writeFile(previewIndexPath, createPreviewShellHtml(title), "utf8");
}

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
    await normalizePreviewAppIndex(paths.previewAppRoot);

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
