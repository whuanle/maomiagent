import { expect, test } from "bun:test";

import { buildUiDesignerStageDraft } from "./stage-draft";

test("buildUiDesignerStageDraft creates a composer draft for manual send", () => {
  const draft = buildUiDesignerStageDraft({
    stageKey: "stack",
    title: "技术栈确认",
    summary: "Electron / React 18 / Ant Design",
  });

  expect(draft).toContain("请继续处理「技术栈确认」阶段。");
  expect(draft).toContain("阶段目标：明确技术路线");
  expect(draft).toContain("当前概览：Electron / React 18 / Ant Design");
  expect(draft).toContain("只提出当前阶段最关键的一个问题");
});
