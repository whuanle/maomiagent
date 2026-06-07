import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
