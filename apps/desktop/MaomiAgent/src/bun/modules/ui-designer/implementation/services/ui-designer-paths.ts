import { join } from "node:path";

export function resolveUiDesignerPaths(workspaceRoot: string) {
  return {
    designRoot: join(workspaceRoot, "design"),
    previewAppRoot: join(workspaceRoot, "preview-app"),
    generatedAppRoot: join(workspaceRoot, "generated-app"),
    runtimeRoot: join(workspaceRoot, "runtime"),
  };
}
