import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { MemoryUnit } from "../../../lib/desktop-memory";
import { createMemoryTranslator } from "../i18n";
import { type MemoryFormValues } from "../helpers";
import { createMemoryColumns } from "./table-columns";
import { MemoryDetailDialogContent } from "./detail-dialog";
import { MemoryEditorDialogContent } from "./editor-dialog";

const t = createMemoryTranslator("zh-CN");

const workspaceOptions = [
  { label: "Memory Workspace (ws-memory)", value: "ws-memory" },
];

const sampleUnit: MemoryUnit = {
  unitId: "mem_001",
  scope: "workspace",
  workspaceId: "ws-memory",
  tier: "mid",
  kind: "preference",
  rawContent: "用户喜欢把长期记忆放在主列表中管理。",
  summary: "记忆管理偏好",
  canonicalSlots: { topic: "memory" },
  evidenceRefs: [{ source: "test" }],
  confidence: 0.88,
  status: "active",
  memoryDomain: "project_context",
  createdAt: "2026-05-16T08:00:00.000Z",
  updatedAt: "2026-05-16T09:00:00.000Z",
};

const form: MemoryFormValues = {
  scope: "workspace",
  workspaceId: "",
  rawContent: "记录一条新的长期记忆",
  summary: "新的记忆",
  kind: "note",
};

function renderContentCell(unit: MemoryUnit) {
  const columns = createMemoryColumns({
    deletingUnitId: null,
    t,
    onDelete: () => undefined,
    onEdit: () => undefined,
    onView: () => undefined,
  });
  const contentColumn = columns.find((column) => column.key === "content");

  if (!contentColumn || typeof contentColumn.render !== "function") {
    throw new Error("content column render is unavailable");
  }

  return renderToStaticMarkup(<>{contentColumn.render(sampleUnit.summary, unit, 0)}</>);
}

describe("memory dialogs", () => {
  test("content column keeps user-facing scope and workspace cues without raw unit ids", () => {
    const markup = renderContentCell(sampleUnit);

    expect(markup).toContain("工作区记忆");
    expect(markup).toContain("工作区：ws-memory");
    expect(markup).not.toContain("mem_001");
  });

  test("detail dialog content hides internal modeling fields", () => {
    const markup = renderToStaticMarkup(
      <MemoryDetailDialogContent
        selectedUnit={sampleUnit}
        t={t}
      />,
    );

    expect(markup).toContain("范围");
  expect(markup).toContain("工作区记忆");
  expect(markup).not.toContain("仅工作区记忆");
    expect(markup).toContain("内容");
    expect(markup).not.toContain("canonicalSlots");
    expect(markup).not.toContain("evidenceRefs");
    expect(markup).not.toContain("置信度");
    expect(markup).not.toContain("领域");
  });

  test("editor dialog content keeps only user-facing fields", () => {
    const markup = renderToStaticMarkup(
      <MemoryEditorDialogContent
        editingUnit={null}
        form={form}
        t={t}
        workspaceOptions={workspaceOptions}
        onFormChange={() => undefined}
      />,
    );

    expect(markup).toContain("范围");
    expect(markup).toContain("工作区");
    expect(markup).toContain("选择工作区");
    expect(markup).toMatch(/class="[^"]*(?:memory-page-workspace-select[^"]*ant-select|ant-select[^"]*memory-page-workspace-select)[^"]*"/);
    expect(markup).not.toContain("工作区 ID");
    expect(markup).toContain("摘要");
    expect(markup).toContain("内容");
    expect(markup).toContain("类型");
    expect(markup).not.toContain("置信度");
    expect(markup).not.toContain("领域");
    expect(markup).not.toContain("层级");
    expect(markup).not.toContain("原始内容");
  });
});