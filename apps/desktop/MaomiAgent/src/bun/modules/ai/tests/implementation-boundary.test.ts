import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulesDirectoryPath = fileURLToPath(new URL("../../", import.meta.url));

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

function isAllowedAiImplementationConsumer(relativePath: string): boolean {
  return relativePath.startsWith("ai/implementation/")
    || relativePath.startsWith("ai/tests/");
}

describe("desktop ai implementation boundary", () => {
  test("keeps concrete openai implementation imports inside the ai module", () => {
    const violations: string[] = [];

    for (const filePath of listTypeScriptFiles(modulesDirectoryPath)) {
      const relativePath = relative(modulesDirectoryPath, filePath).replaceAll("\\", "/");
      if (isAllowedAiImplementationConsumer(relativePath)) {
        continue;
      }

      const fileText = readFileSync(filePath, "utf8");
      if (
        fileText.includes("ai/implementation/openai")
        || fileText.includes('from "../../../ai/implementation/openai"')
        || fileText.includes("from '../implementation/openai'")
        || fileText.includes('from "../implementation/openai"')
      ) {
        violations.push(`${relativePath}: must not import concrete ai/openai implementation directly`);
      }
    }

    expect(violations).toEqual([]);
  });
});