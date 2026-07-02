import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UiDesignerDesignPackageService } from "../implementation/services/ui-designer-design-package";

test("creates default design package files for a workspace", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-ui-designer-"));
  const service = new UiDesignerDesignPackageService();

  try {
    const result = await service.ensureDesignPackage({ workspaceRoot });

    expect(result.designPackagePath.endsWith("design")).toBe(true);
    expect(result.hasDesignSpec).toBe(false);
    expect(result.files.designSpecMarkdown).toContain("# UI Design Spec");
    expect(result.files.stackJson).toContain('"framework"');
    expect(result.files.scopeJson).toContain('"projectType"');
    expect(result.files.scopeJson).toContain('"businessType"');
    expect(result.files.scopeJson).toContain('"selectedSections"');
    expect(result.files.pagesJson).toContain('"modules"');
    expect(await readFile(join(workspaceRoot, "design", "design-spec.md"), "utf8")).toContain(
      "# UI Design Spec",
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("splits a large preview-app index into shell, page, and external assets", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-ui-designer-preview-"));
  const service = new UiDesignerDesignPackageService();
  const largeCss = `.root { color: #111; }\n${".item{padding:8px;}".repeat(1200)}`;
  const largeJs = `const n = 1;\n${"console.log('preview');".repeat(1200)}`;
  const previewIndex = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Preview App</title>
    <style>${largeCss}</style>
  </head>
  <body>
    <div class="root">Hello Preview</div>
    <script>${largeJs}</script>
  </body>
</html>`;

  try {
    await mkdir(join(workspaceRoot, "preview-app"), { recursive: true });
    await writeFile(join(workspaceRoot, "preview-app", "index.html"), previewIndex, "utf8");

    await service.ensureDesignPackage({ workspaceRoot });

    const shellHtml = await readFile(join(workspaceRoot, "preview-app", "index.html"), "utf8");
    const pageHtml = await readFile(join(workspaceRoot, "preview-app", "pages", "app.html"), "utf8");
    const pageCss = await readFile(join(workspaceRoot, "preview-app", "assets", "app.css"), "utf8");
    const pageJs = await readFile(join(workspaceRoot, "preview-app", "assets", "app.js"), "utf8");

    expect(shellHtml).toContain('data-maomi-preview-shell="split-v1"');
    expect(shellHtml).toContain('./pages/app.html');
    expect(pageHtml).toContain("Hello Preview");
    expect(pageHtml).toContain('<link rel="stylesheet" href="./assets/app.css" />');
    expect(pageHtml).toContain('<script type="module" src="./assets/app.js"></script>');
    expect(pageCss.length).toBeGreaterThan(1000);
    expect(pageJs.length).toBeGreaterThan(1000);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
