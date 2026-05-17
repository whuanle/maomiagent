export const AGENT_MODE_VALUES = ["primary", "subagent", "all"] as const
export const AGENT_SOURCE_VALUES = [
  "builtin-opencode",
  "builtin-maomi",
  "installed-package",
  "user-custom",
  "workspace-local",
] as const

export type AgentMode = (typeof AGENT_MODE_VALUES)[number]
export type AgentSource = (typeof AGENT_SOURCE_VALUES)[number]
export type AgentSubAgentPolicyMode = "all" | "allow_list"
export type OpencodeAgentImportFormat = "json" | "markdown"
export type AgentRuntimeDefaultResolution =
  | "binding-default"
  | "builtin-default"
  | "fallback-first-root-visible"
  | "none"

export type AgentIdentity = {
  name?: string
  emoji?: string
  theme?: string
}

export type AgentModelStrategy = {
  primary?: string
  fallback?: string[]
}

export type AgentSkillBinding = {
  skillId: string
  enabled?: boolean
  params?: Record<string, unknown>
}

export type AgentSkillsConfig = {
  bindings?: AgentSkillBinding[]
}

export type AgentWorkflowConfig = {
  goal?: string
  steps?: string[]
  uiMode?: string
}

export type AgentSubAgentPolicy = {
  mode: AgentSubAgentPolicyMode
  allowedAgentIds?: string[]
}

export type AgentItem = {
  agentId: string
  name: string
  description?: string
  mode: AgentMode
  enabled: boolean
  version: string
  source: AgentSource
  hidden?: boolean
  prompt?: string
  model?: string
  modelStrategy?: AgentModelStrategy
  identity?: AgentIdentity
  tools?: Record<string, unknown>
  skills?: AgentSkillsConfig
  workflow?: AgentWorkflowConfig
  temperature?: number
  topP?: number
  steps?: number
  permission?: Record<string, unknown>
  subAgentPolicy?: AgentSubAgentPolicy
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AgentsStorage = {
  items: AgentItem[]
  version: string
  updatedAt: string
}

export type AgentsListQuery = {
  q?: string
  enabled?: boolean
  source?: AgentSource
  includeRuntimeAgents?: boolean
}

export type AgentsListResponse = {
  items: AgentItem[]
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export type AgentCreateInput = {
  agentId: string
  name?: string
  description?: string
  mode?: AgentMode
  enabled?: boolean
  prompt?: string
  subAgentPolicy?: AgentSubAgentPolicy
}

export type AgentPatchInput = {
  name?: string
  description?: string | null
  mode?: AgentMode
  enabled?: boolean
  prompt?: string | null
  subAgentPolicy?: AgentSubAgentPolicy | null
}

export type AgentBundleMemberInput = {
  agentId: string
  name?: string
  description?: string
  mode?: AgentMode
  enabled?: boolean
  prompt?: string
}

export type DesktopAgentBundleView = {
  rootItem: AgentItem | null
  childItems: AgentItem[]
}

export type DesktopAgentBundleSaveInput = {
  root: AgentBundleMemberInput
  childAgents?: AgentBundleMemberInput[]
  linkedAgentIds?: string[]
  removedAgentIds?: string[]
}

export type DesktopAgentBundleSaveResponse = {
  rootItem: AgentItem
  childItems: AgentItem[]
  linkedAgentIds: string[]
  removedAgentIds: string[]
}

export type OpencodeAgentImportInput = {
  format: OpencodeAgentImportFormat
  content: string
  agentId?: string
  enabled?: boolean
}

export type OpencodeAgentImportPreview = {
  format: OpencodeAgentImportFormat
  items: AgentItem[]
  existingItems: AgentItem[]
  createdCount: number
  updatedCount: number
}

export type OpencodeAgentImportResult = {
  format: OpencodeAgentImportFormat
  items: AgentItem[]
  createdCount: number
  updatedCount: number
}

export type AgentRuntimeConfig = {
  agent: Record<string, unknown>
  default_agent?: string
}

export type AgentRuntimeSnapshot = {
  agent: Record<string, unknown>
  runtime_catalog: Record<string, unknown>
  default_agent?: string
  diagnostics: {
    workspaceId?: string
    enabledAgentIds: string[]
    scopedAgentIds: string[]
    requestedDefaultAgentId?: string
    resolvedDefaultAgentId?: string
    defaultResolution: AgentRuntimeDefaultResolution
  }
}

export type AgentErrorBody = {
  ok: false
  code: string
  message: string
  data?: Record<string, unknown>
}

export type DesktopAgentCreateResponse = {
  item: AgentItem
  created: boolean
}

export type DesktopAgentDeleteResponse = {
  deleted: boolean
  agentId: string
}
