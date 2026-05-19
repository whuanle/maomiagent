import { describe, expect, test } from "bun:test";

import {
  LAYER_A_ROOT,
  LAYER_B_ROOT,
  TARGET_ROOT,
  RECOVERY_DATE,
  classifyModuleBucket,
  isDocsPath,
  normalizeRepoPath,
  resolveLayerPath,
  resolveRecoveryOutputPath,
} from "./recovery-paths";

function normalizeFsPath(value: string) {
  return value.replaceAll("\\", "/").toLowerCase();
}

describe("recovery-paths", () => {
  test("pins the three recovery roots and the recovery date", () => {
    expect(normalizeFsPath(TARGET_ROOT)).toBe("e:/workspace/maomiagent");
    expect(normalizeFsPath(LAYER_A_ROOT)).toBe("g:/demo/a/maomiagent");
    expect(normalizeFsPath(LAYER_B_ROOT)).toBe("g:/demo/maomiagent");
    expect(RECOVERY_DATE).toBe("2026-05-18");
  });

  test("normalizes repo paths and resolves layer-relative paths", () => {
    expect(
      normalizeRepoPath("apps\\desktop\\MaomiAgent\\src\\mainview\\modules\\chat\\page.tsx"),
    ).toBe("apps/desktop/MaomiAgent/src/mainview/modules/chat/page.tsx");

    expect(
      normalizeFsPath(
        resolveLayerPath("layerB", "apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts"),
      ),
    ).toContain("g:/demo/maomiagent/apps/desktop/maomiagent/src/shared/desktop-conversation.ts");
  });

  test("detects docs paths and buckets modules", () => {
    expect(isDocsPath("docs/superpowers/specs/2026-05-18-code-recovery-layered-restore-design.md")).toBe(true);
    expect(classifyModuleBucket("apps/desktop/MaomiAgent/src/mainview/modules/chat/page.tsx")).toBe("chat");
    expect(
      classifyModuleBucket(
        "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts",
      ),
    ).toBe("feishu");
    expect(classifyModuleBucket("apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts")).toBe("shared");
    expect(
      classifyModuleBucket("apps/desktop/MaomiAgent/src/mainview/lib/desktop-conversation.ts"),
    ).toBe("mainview-lib");
  });

  test("resolves recovery output under the dated working-artifact directory", () => {
    expect(normalizeFsPath(resolveRecoveryOutputPath("batches", "B-SKILLS-001.json"))).toContain(
      "/docs/superpowers/recovery/2026-05-18/batches/b-skills-001.json",
    );
  });
});
