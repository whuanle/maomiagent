import type {
  AgentItem,
  AgentSubAgentPolicy,
  AgentSubAgentPolicyMode,
} from "../../../shared/desktop-agents"
import { DEFAULT_DESKTOP_PRIMARY_AGENT_ID } from "../../../shared/conversation/managed-execution"
import type { AgentsTranslate as Translate } from "./agents-i18n"

export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return "-"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

export function isBuiltin(source: AgentItem["source"]): boolean {
  return source === "builtin-opencode" || source === "builtin-maomi"
}

export function isReadonlyAgent(
  item: Pick<AgentItem, "source" | "metadata">,
): boolean {
  return !isCustomAgentSource(item.source) || item.metadata?.runtimeOnly === true
}

export function isCustomAgentSource(source: AgentItem["source"]): boolean {
  return source === "user-custom" || source === "workspace-local"
}

export function sourceLabel(t: Translate, source: AgentItem["source"]): string {
  if (source === "builtin-opencode") return t("智能体页.值.来源.builtin-opencode")
  if (source === "builtin-maomi") return t("智能体页.值.来源.builtin-maomi")
  if (source === "installed-package") return t("智能体页.值.来源.installed-package")
  if (source === "workspace-local") return t("智能体页.值.来源.workspace-local")
  return t("智能体页.值.来源.user-custom")
}

export function agentOwnershipLabel(t: Translate, source: AgentItem["source"]): string {
  return isBuiltin(source) ? t("智能体页.值.类型.builtin") : t("智能体页.值.类型.custom")
}

export function sourceBadgeLabel(t: Translate, source: AgentItem["source"]): string {
  if (
    source === "builtin-opencode"
    || source === "builtin-maomi"
    || source === "installed-package"
    || source === "workspace-local"
  ) {
    return sourceLabel(t, source)
  }
  return agentOwnershipLabel(t, source)
}

export function modeBadgeClass(mode: AgentItem["mode"]): string {
  if (mode === "primary") return "status-badge-primary"
  if (mode === "subagent") return "status-badge-info"
  return "status-badge-neutral"
}

export function isRootVisibleAgentMode(mode: AgentItem["mode"]): boolean {
  return mode !== "subagent"
}

export function isDelegatableAgentMode(mode: AgentItem["mode"]): boolean {
  return mode === "subagent" || mode === "all"
}

export function normalizeAgentEditorMode(mode: AgentItem["mode"]): AgentItem["mode"] {
  if (mode === "subagent" || mode === "all") {
    return mode
  }
  return "primary"
}

export function getAgentSelectionPolicyFormState(
  item: Pick<AgentItem, "subAgentPolicy"> | null | undefined,
): {
  selectionPolicyMode: AgentSubAgentPolicyMode
  allowedAgentIds: string[]
} {
  if (item?.subAgentPolicy?.mode === "allow_list") {
    return {
      selectionPolicyMode: "allow_list",
      allowedAgentIds: item.subAgentPolicy.allowedAgentIds ?? [],
    }
  }

  return {
    selectionPolicyMode: "all",
    allowedAgentIds: [],
  }
}

export function buildAgentSelectionPolicy(input: {
  mode: AgentItem["mode"]
  selectionPolicyMode: AgentSubAgentPolicyMode
  allowedAgentIds: string[]
}): AgentSubAgentPolicy | null {
  if (input.mode === "subagent") {
    return null
  }

  if (input.selectionPolicyMode === "allow_list") {
    return {
      mode: "allow_list",
      allowedAgentIds: [...new Set(input.allowedAgentIds.map((item) => item.trim()).filter(Boolean))],
    }
  }

  return { mode: "all" }
}

export function sourceBadgeClass(source: AgentItem["source"]): string {
  if (source === "builtin-opencode") return "status-badge-success"
  if (source === "builtin-maomi") return "status-badge-info"
  if (source === "installed-package") return "status-badge-primary"
  return "status-badge-neutral"
}

export function summarizeAgent(item: AgentItem, t: Translate): string {
  const description = item.description?.trim() || ""
  if (description) {
    return description
  }

  const prompt = item.prompt?.trim() || ""
  if (prompt) {
    return prompt.length > 120 ? `${prompt.slice(0, 120)}...` : prompt
  }

  return t("智能体页.提示.无描述")
}

export function matchesAgentQuery(item: AgentItem, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  const haystacks = [
    item.agentId,
    item.name,
    item.description,
    item.prompt,
    item.mode,
    item.source,
    item.version,
  ]
  return haystacks.some((value) => value?.toLowerCase().includes(normalized))
}

export function compareAgentsByName(
  left: Pick<AgentItem, "name" | "agentId">,
  right: Pick<AgentItem, "name" | "agentId">,
): number {
  const defaultAgentRank = Number(right.agentId === DEFAULT_DESKTOP_PRIMARY_AGENT_ID)
    - Number(left.agentId === DEFAULT_DESKTOP_PRIMARY_AGENT_ID)
  if (defaultAgentRank !== 0) {
    return defaultAgentRank
  }

  const byName = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  })
  if (byName !== 0) {
    return byName
  }
  return left.agentId.localeCompare(right.agentId, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export function displayAgentUpdatedAt(item: Pick<AgentItem, "source" | "updatedAt" | "metadata">): string {
  return isReadonlyAgent(item) ? "-" : formatDateTime(item.updatedAt)
}

export function formatAgentMode(t: Translate, mode: AgentItem["mode"]): string {
  return t(`智能体页.值.模式.${mode}`)
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
