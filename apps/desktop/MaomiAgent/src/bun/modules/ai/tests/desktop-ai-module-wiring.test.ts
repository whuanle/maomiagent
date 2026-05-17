import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellModulePath = resolve(currentDir, "../../shell/composition/shell.module.ts");
const desktopHostPath = resolve(currentDir, "../../../desktop-host.ts");

describe("desktop ai module wiring", () => {
  test("desktop shell depends on the desktop ai module", () => {
    const fileText = readFileSync(shellModulePath, "utf8");

    expect(fileText.includes("DesktopAiModule")).toBe(true);
    expect(fileText.includes("DesktopAiModule,")).toBe(true);
  });

  test("desktop host re-exports the desktop ai runtime surface", () => {
    const fileText = readFileSync(desktopHostPath, "utf8");

    expect(fileText.includes("DESKTOP_AI_RUNTIME_PORT")).toBe(true);
    expect(fileText.includes("DESKTOP_AI_ONE_SHOT_PORT")).toBe(true);
    expect(fileText.includes("DesktopAiModule")).toBe(true);
    expect(fileText.includes("DesktopAiRuntimePort")).toBe(true);
    expect(fileText.includes("DesktopAiOneShotPort")).toBe(true);
  });
});