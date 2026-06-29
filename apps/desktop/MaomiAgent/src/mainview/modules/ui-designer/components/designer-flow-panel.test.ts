import { describe, expect, test } from "bun:test";

import {
  isStageActionVisible,
  resolveStageActionLabel,
} from "../services/stage-action-availability";
import type { UiDesignerStageViewModel } from "../services/stage-view-model-resolver";

const createStage = (
  stageKey: UiDesignerStageViewModel["stageKey"],
  status: UiDesignerStageViewModel["status"],
): UiDesignerStageViewModel => ({
  stageKey,
  title: stageKey,
  status,
  summary: "",
  sections: [],
});

describe("designer flow panel stage actions", () => {
  test("only shows actions for stages whose predecessors are complete", () => {
    const stageViewModels: UiDesignerStageViewModel[] = [
      createStage("projectScope", "empty"),
      createStage("theme", "empty"),
      createStage("patterns", "partial"),
    ];

    expect(isStageActionVisible(stageViewModels, 0)).toBe(true);
    expect(isStageActionVisible(stageViewModels, 1)).toBe(false);
    expect(isStageActionVisible(stageViewModels, 2)).toBe(false);
  });

  test("keeps completed predecessors unlocked and resolves action copy", () => {
    const stageViewModels: UiDesignerStageViewModel[] = [
      createStage("projectScope", "complete"),
      createStage("theme", "partial"),
      createStage("patterns", "empty"),
    ];

    expect(isStageActionVisible(stageViewModels, 1)).toBe(true);
    expect(isStageActionVisible(stageViewModels, 2)).toBe(false);
    expect(resolveStageActionLabel("empty")).toBe("开始设计");
    expect(resolveStageActionLabel("partial")).toBe("继续完善");
    expect(resolveStageActionLabel("complete")).toBe("继续完善");
    expect(resolveStageActionLabel("partial", true)).toBe("继续填写");
  });
});
