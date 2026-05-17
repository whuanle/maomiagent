import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const aiIndexPath = fileURLToPath(new URL("../index.ts", import.meta.url));

describe("desktop ai root barrel boundary", () => {
  test("exports module-level abstractions without re-exporting concrete provider implementations", () => {
    const fileText = readFileSync(aiIndexPath, "utf8");

    expect(fileText.includes("DESKTOP_AI_RUNTIME_PORT")).toBe(true);
    expect(fileText.includes("DESKTOP_AI_ONE_SHOT_PORT")).toBe(true);
    expect(fileText.includes("DesktopAiModule")).toBe(true);
    expect(fileText.includes("DesktopAiOneShotService")).toBe(true);
    expect(fileText.includes("DesktopAiRuntimeService")).toBe(true);
    expect(fileText.includes('export * from "./provider-runtime-support";')).toBe(true);
    expect(fileText.includes('export * from "./provider-runtime-registry";')).toBe(true);
    expect(fileText.includes('export * from "./implementation/openai";')).toBe(false);
  });
});