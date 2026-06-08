import { describe, expect, test } from "bun:test";

import {
  buildProjectScopeDraft,
  createEmptyProjectScopeFormValues,
  hasConfirmedProjectScope,
  normalizeProjectScopeFormValues,
  parseProjectScopeJson,
  stringifyProjectScope,
} from "./project-scope-flow";

describe("project-scope-flow", () => {
  test("treats blank or invalid scope json as empty", () => {
    expect(parseProjectScopeJson("")).toEqual(createEmptyProjectScopeFormValues());
    expect(parseProjectScopeJson("{invalid")).toEqual(createEmptyProjectScopeFormValues());
    expect(parseProjectScopeJson("[]")).toEqual(createEmptyProjectScopeFormValues());
    expect(hasConfirmedProjectScope(createEmptyProjectScopeFormValues())).toBe(false);
  });

  test("normalizes submitted values and builds the kickoff draft", () => {
    const normalized = normalizeProjectScopeFormValues({
      projectType: " Web ",
      businessType: "后台管理系统",
      targetPlatform: "桌面浏览器优先",
      currentObjective: "先确认首批页面",
      deliverySummary: "输出第一版 UI 方案",
    });

    expect(normalized).toEqual({
      projectType: "Web",
      businessType: "后台管理系统",
      targetPlatform: "桌面浏览器优先",
      currentObjective: "先确认首批页面",
      deliverySummary: "输出第一版 UI 方案",
    });
    expect(hasConfirmedProjectScope(normalized)).toBe(true);
    expect(parseProjectScopeJson(stringifyProjectScope(normalized))).toEqual(normalized);
    expect(buildProjectScopeDraft(normalized)).toContain("项目范围确认：");
    expect(buildProjectScopeDraft(normalized)).toContain("请基于以上范围，先提出第一个最关键的问题，不要一次问很多。");
  });
});
