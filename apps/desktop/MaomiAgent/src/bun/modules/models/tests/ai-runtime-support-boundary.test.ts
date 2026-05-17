import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const desktopModelsServicePath = fileURLToPath(
  new URL("../implementation/services/desktop-models-service.ts", import.meta.url),
);

describe("desktop models ai boundary", () => {
  test("depends on the ai runtime-support registry instead of the ai barrel", () => {
    const fileText = readFileSync(desktopModelsServicePath, "utf8");

    expect(fileText.includes('from "../../../ai/provider-runtime-support"')).toBe(true);
    expect(fileText.includes('from "../../../ai"')).toBe(false);
  });
});