import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aiModuleDirectoryPath = fileURLToPath(new URL("..", import.meta.url));

const kernelAliasImportPattern = /(?:from|import\()\s*["']#maomiagent\/kernel\/[^"']+["']|export\s+\*\s+from\s*["']#maomiagent\/kernel\/[^"']+["']/g;
const kernelSourceAliasImportPattern = /(?:from|import\()\s*["']#maomiagent\/kernel\/src\/[^"']+["']|export\s+\*\s+from\s*["']#maomiagent\/kernel\/src\/[^"']+["']/g;
const relativeKernelImportPattern = /(?:from|import\()\s*["'][^"']*(?:\.\.\/)+kernel(?:\/[^"']*)?["']|export\s+\*\s+from\s*["'][^"']*(?:\.\.\/)+kernel(?:\/[^"']*)?["']/g;

function listTypeScriptFiles(directoryPath: string): string[] {
  const filePaths: string[] = [];

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...listTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

describe("desktop ai kernel bridge boundary", () => {
  test("only kernel-bridge.ts imports kernel surfaces directly", () => {
    const violations: string[] = [];

    for (const filePath of listTypeScriptFiles(aiModuleDirectoryPath)) {
      const relativePath = relative(aiModuleDirectoryPath, filePath).replaceAll("\\", "/");
      const fileText = readFileSync(filePath, "utf8");
      const hasKernelAliasImport = kernelAliasImportPattern.test(fileText);
      const hasKernelSourceAliasImport = kernelSourceAliasImportPattern.test(fileText);
      const hasRelativeKernelImport = relativeKernelImportPattern.test(fileText);

      kernelAliasImportPattern.lastIndex = 0;
      kernelSourceAliasImportPattern.lastIndex = 0;
      relativeKernelImportPattern.lastIndex = 0;

      if (relativePath === "kernel-bridge.ts") {
        if (hasKernelSourceAliasImport) {
          violations.push(`${relativePath}: must use kernel public subpaths instead of kernel/src aliases`);
        }
        if (hasRelativeKernelImport) {
          violations.push(`${relativePath}: must use #maomiagent/kernel aliases instead of relative kernel source imports`);
        }
        continue;
      }

      if (hasKernelAliasImport || hasKernelSourceAliasImport || hasRelativeKernelImport) {
        violations.push(`${relativePath}: must import kernel types and helpers through kernel-bridge.ts`);
      }
    }

    expect(violations).toEqual([]);
  });
});