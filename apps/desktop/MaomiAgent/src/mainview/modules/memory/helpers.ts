import type {
  MemoryKind,
  MemoryScopeFilter,
  MemorySearchItem,
  MemoryStatus,
  MemoryUnit,
} from "../../lib/desktop-memory";

export type MemoryFormValues = {
  scope: "global" | "workspace";
  workspaceId: string;
  rawContent: string;
  summary: string;
  kind: MemoryKind;
};

export type MemoryEntryKey = "records" | "understand" | "organize";

type LabeledOption<T extends string> = {
  label: string;
  value: T;
};

const memoryKindValues: MemoryKind[] = [
  "fact",
  "preference",
  "constraint",
  "procedure",
  "decision",
  "note",
  "habit",
  "emotion",
  "setting",
  "agent_handoff",
];

const memoryStatusValues: MemoryStatus[] = ["active", "conflicted", "archived", "deleted"];

function capitalize(value: string): string {
  if (!value) {
    return value;
  }

  return value[0].toUpperCase() + value.slice(1);
}

export function formatTokenLabel(value?: string): string {
  if (!value) {
    return "-";
  }

  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((segment) => capitalize(segment))
    .join(" ");
}

export const memoryKindOptions: Array<LabeledOption<MemoryKind>> = memoryKindValues.map((value) => ({
  value,
  label: formatTokenLabel(value),
}));

export const memoryStatusOptions: Array<LabeledOption<MemoryStatus>> = memoryStatusValues.map((value) => ({
  value,
  label: formatTokenLabel(value),
}));

export const initialForm: MemoryFormValues = {
  scope: "global",
  workspaceId: "",
  rawContent: "",
  summary: "",
  kind: "note",
};

export function resolveProjectionWorkspaceId(
  scopeFilter: MemoryScopeFilter,
  workspaceIdInput: string,
): string | undefined {
  if (scopeFilter !== "workspace") {
    return undefined;
  }

  return workspaceIdInput.trim() || undefined;
}

export function createMemoryDraft(
  scopeFilter: MemoryScopeFilter,
  workspaceIdInput: string,
): MemoryFormValues {
  return {
    ...initialForm,
    scope: scopeFilter === "workspace" ? "workspace" : "global",
    workspaceId: scopeFilter === "workspace" ? workspaceIdInput.trim() : "",
  };
}

export function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function truncateText(value: string | undefined, max = 120): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max).trimEnd()}...`;
}

export function getMemoryTitle(unit: Pick<MemoryUnit, "summary" | "rawContent">): string {
  const summary = unit.summary?.trim();
  if (summary) {
    return summary;
  }

  return truncateText(unit.rawContent, 92);
}

export function getMemorySubtitle(unit: Pick<MemoryUnit, "summary" | "rawContent">): string {
  if (!unit.summary?.trim()) {
    return "";
  }

  return truncateText(unit.rawContent, 140);
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function formatScore(value?: number): string {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

export function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function toConfidence(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type { MemorySearchItem };