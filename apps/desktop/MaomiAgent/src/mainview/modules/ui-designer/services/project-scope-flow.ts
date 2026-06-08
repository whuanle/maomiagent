export type ProjectScopeFormValues = {
  projectType: string;
  businessType: string;
  targetPlatform: string;
  currentObjective: string;
  deliverySummary: string;
};

const EMPTY_PROJECT_SCOPE: ProjectScopeFormValues = {
  projectType: "",
  businessType: "",
  targetPlatform: "",
  currentObjective: "",
  deliverySummary: "",
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createEmptyProjectScopeFormValues(): ProjectScopeFormValues {
  return { ...EMPTY_PROJECT_SCOPE };
}

export function normalizeProjectScopeFormValues(
  values: Partial<ProjectScopeFormValues> | Record<string, unknown>,
): ProjectScopeFormValues {
  return {
    projectType: readText(values.projectType),
    businessType: readText(values.businessType),
    targetPlatform: readText(values.targetPlatform),
    currentObjective: readText(values.currentObjective),
    deliverySummary: readText(values.deliverySummary),
  };
}

export function parseProjectScopeJson(text: string): ProjectScopeFormValues {
  const normalized = text.trim();
  if (!normalized) {
    return createEmptyProjectScopeFormValues();
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createEmptyProjectScopeFormValues();
    }

    return normalizeProjectScopeFormValues(parsed as Record<string, unknown>);
  } catch {
    return createEmptyProjectScopeFormValues();
  }
}

export function hasConfirmedProjectScope(scope: ProjectScopeFormValues) {
  return [scope.projectType, scope.businessType, scope.targetPlatform].some(Boolean);
}

export function stringifyProjectScope(scope: ProjectScopeFormValues) {
  return JSON.stringify(scope, null, 2);
}

export function buildProjectScopeDraft(scope: ProjectScopeFormValues) {
  return [
    "项目范围确认：",
    `- 项目形态：${scope.projectType || "未确认"}`,
    `- 业务类型：${scope.businessType || "未确认"}`,
    `- 目标平台：${scope.targetPlatform || "未确认"}`,
    `- 当前目标：${scope.currentObjective || "未确认"}`,
    `- 交付范围：${scope.deliverySummary || "未确认"}`,
    "",
    "请基于以上范围，先提出第一个最关键的问题，不要一次问很多。",
  ].join("\n");
}
