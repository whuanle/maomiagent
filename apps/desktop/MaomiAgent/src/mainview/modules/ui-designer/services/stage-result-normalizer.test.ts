import { expect, test } from "bun:test";

import { normalizeStageResult } from "./stage-result-normalizer";

test("maps allowed artifacts to fixed design files", () => {
  const normalized = normalizeStageResult({
    stageKey: "stack",
    summary: "桌面原生 / WPF / Fluent UI",
    detail: {},
    artifacts: {
      stack: {
        technicalRoute: "桌面原生",
        coreFramework: "WPF",
      },
    },
    nextSuggestedStage: "theme",
  });

  expect(normalized.files).toEqual({
    stackJson: JSON.stringify({
      technicalRoute: "桌面原生",
      coreFramework: "WPF",
    }, null, 2),
  });
});

test("rejects unknown artifact keys", () => {
  expect(() => normalizeStageResult({
    stageKey: "stack",
    summary: "bad",
    detail: {},
    artifacts: {
      randomPath: {},
    },
    nextSuggestedStage: "theme",
  })).toThrow("Unsupported stage artifact: randomPath");
});
