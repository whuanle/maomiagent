import type { AgentItem } from "../../../../shared/desktop-agents"
import type { AgentsTranslate as Translate } from "../agents-i18n"
import { isRootVisibleAgentMode } from "../helpers"

export type AgentRelationGroupKind = "plugin" | "primary" | "custom"

export type AgentRelationGroup = {
  key: string
  kind: AgentRelationGroupKind
  label: string
}

export type AgentRelationPeer = {
  agentId: string
  name: string
}

export type AgentRelationInfo = {
  ownerPluginName?: string
  groups: AgentRelationGroup[]
  primaryAgentIds: string[]
  primaryAgents: AgentRelationPeer[]
  childAgentIds: string[]
  childAgents: AgentRelationPeer[]
}

export type AgentListItem = AgentItem & {
  relationInfo: AgentRelationInfo
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const next = value.trim()
  return next || undefined
}

function uniqStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function readStringList(source: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!source) return []
  for (const key of keys) {
    const value = source[key]
    if (!Array.isArray(value)) continue
    const items = uniqStrings(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    )
    if (items.length > 0) {
      return items
    }
  }
  return []
}

function readSingleOrList(source: Record<string, unknown> | undefined, keys: string[]): string[] {
  const list = readStringList(source, keys)
  if (list.length > 0) {
    return list
  }

  for (const key of keys) {
    const value = normalizeText(source?.[key])
    if (value) {
      return [value]
    }
  }

  return []
}

function collectPrimaryChildIds(item: AgentItem): string[] {
  const allowedIds =
    item.subAgentPolicy?.mode === "allow_list"
      ? item.subAgentPolicy.allowedAgentIds ?? []
      : []
  const delegatedIds = readStringList(
    isRecord(item.metadata) ? item.metadata : undefined,
    ["delegates", "relatedAgentIds", "related_agent_ids"],
  )
  return uniqStrings(
    [...allowedIds, ...delegatedIds]
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry) && entry !== item.agentId),
  )
}

function collectExplicitPrimaryIds(item: AgentItem): string[] {
  return uniqStrings(
    readStringList(isRecord(item.metadata) ? item.metadata : undefined, [
      "primaryAgentIds",
      "primary_agent_ids",
    ])
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry) && entry !== item.agentId),
  )
}

function collectCustomGroupLabels(item: AgentItem): string[] {
  return uniqStrings(
    readSingleOrList(isRecord(item.metadata) ? item.metadata : undefined, [
      "displayGroups",
      "display_groups",
      "displayGroup",
      "display_group",
      "uiGroup",
      "ui_group",
    ])
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry)),
  )
}

function normalizeGroupKey(kind: AgentRelationGroupKind, label: string): string {
  return `${kind}:${label.trim().toLowerCase()}`
}

function extractPluginNameFromPrompt(prompt?: string): string | undefined {
  const text = normalizeText(prompt)
  if (!text) return undefined
  const quotedMatch =
    text.match(/running as part of the ["']([^"']+)["']\s+opencode plugin/i)
    ?? text.match(/part of the ["']([^"']+)["']\s+opencode plugin/i)
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim()
  }
  const bareMatch = text.match(/part of the ([a-z0-9._-]+)\s+opencode plugin/i)
  if (bareMatch?.[1]) {
    return bareMatch[1].trim()
  }
  return undefined
}

export function deriveAgentListItems(items: AgentItem[]): AgentListItem[] {
  const itemById = new Map(items.map((item) => [item.agentId, item]))
  const childIdsByPrimary = new Map<string, string[]>()
  const parentIdsByChild = new Map<string, Set<string>>()

  for (const item of items) {
    const childIds = collectPrimaryChildIds(item).filter((agentId) => itemById.has(agentId))
    if (childIds.length > 0 && isRootVisibleAgentMode(item.mode)) {
      childIdsByPrimary.set(item.agentId, childIds)
      for (const childId of childIds) {
        const parentIds = parentIdsByChild.get(childId) ?? new Set<string>()
        parentIds.add(item.agentId)
        parentIdsByChild.set(childId, parentIds)
      }
    }
  }

  for (const item of items) {
    const explicitPrimaryIds = collectExplicitPrimaryIds(item).filter((agentId) =>
      itemById.has(agentId),
    )
    if (explicitPrimaryIds.length === 0) continue
    for (const primaryId of explicitPrimaryIds) {
      const parentIds = parentIdsByChild.get(item.agentId) ?? new Set<string>()
      parentIds.add(primaryId)
      parentIdsByChild.set(item.agentId, parentIds)
      const childIds = childIdsByPrimary.get(primaryId) ?? []
      if (!childIds.includes(item.agentId)) {
        childIdsByPrimary.set(primaryId, [...childIds, item.agentId])
      }
    }
  }

  return items.map((item) => {
    const relationGroups = new Map<string, AgentRelationGroup>()
    const ownerPluginName = extractPluginNameFromPrompt(item.prompt)
    if (ownerPluginName) {
      relationGroups.set(`plugin:${ownerPluginName.toLowerCase()}`, {
        key: `plugin:${ownerPluginName.toLowerCase()}`,
        kind: "plugin",
        label: ownerPluginName,
      })
    }

    const childAgentIds = [...(childIdsByPrimary.get(item.agentId) ?? [])].sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )
    const childAgents = childAgentIds.map((agentId) => ({
      agentId,
      name: itemById.get(agentId)?.name ?? agentId,
    }))
    if (childAgentIds.length > 0) {
      relationGroups.set(`primary:${item.agentId}`, {
        key: `primary:${item.agentId}`,
        kind: "primary",
        label: item.name,
      })
    }

    const primaryAgentIds = [...(parentIdsByChild.get(item.agentId) ?? new Set<string>())].sort(
      (left, right) => {
        const leftName = itemById.get(left)?.name ?? left
        const rightName = itemById.get(right)?.name ?? right
        return leftName.localeCompare(rightName, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      },
    )
    const primaryAgents = primaryAgentIds.map((agentId) => ({
      agentId,
      name: itemById.get(agentId)?.name ?? agentId,
    }))

    for (const primaryId of primaryAgentIds) {
      const primary = itemById.get(primaryId)
      relationGroups.set(`primary:${primaryId}`, {
        key: `primary:${primaryId}`,
        kind: "primary",
        label: primary?.name ?? primaryId,
      })
    }

    for (const label of collectCustomGroupLabels(item)) {
      relationGroups.set(normalizeGroupKey("custom", label), {
        key: normalizeGroupKey("custom", label),
        kind: "custom",
        label,
      })
    }

    const groups = [...relationGroups.values()].sort((left, right) => {
      const order = (kind: AgentRelationGroupKind) => {
        if (kind === "primary") return 0
        if (kind === "plugin") return 1
        return 2
      }
      if (order(left.kind) !== order(right.kind)) {
        return order(left.kind) - order(right.kind)
      }
      return left.label.localeCompare(right.label, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    })

    return {
      ...item,
      relationInfo: {
        ownerPluginName,
        groups,
        primaryAgentIds,
        primaryAgents,
        childAgentIds,
        childAgents,
      },
    }
  })
}

export function formatAgentRelationGroupFilterLabel(group: AgentRelationGroup, t: Translate): string {
  if (group.kind === "primary") {
    return t("智能体页.筛选.关联.主链路", { 名称: group.label })
  }
  if (group.kind === "plugin") {
    return t("智能体页.筛选.关联.插件", { 名称: group.label })
  }
  return t("智能体页.筛选.关联.分组", { 名称: group.label })
}

export function formatAgentRelationGroupTitle(group: AgentRelationGroup, t: Translate): string {
  if (group.kind === "primary") {
    return t("智能体页.关联.标签.主链路", { 名称: group.label })
  }
  if (group.kind === "plugin") {
    return t("智能体页.关联.标签.插件", { 名称: group.label })
  }
  return t("智能体页.关联.标签.分组", { 名称: group.label })
}
