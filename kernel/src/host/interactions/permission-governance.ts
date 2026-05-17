import type {
  InteractionPermissionDecision,
  InteractionRecord,
  InteractionResourceDescriptor,
  KernelMetadata,
  PermissionInteractionRequest,
  SessionRecord,
} from "../../core"
import { isPermissionInteractionRequest } from "../../core"

export type SessionPermissionDecision = "approve_always" | "reject"

export type ParsedPermissionDecisionResponse = {
  decision: InteractionPermissionDecision
  note?: string
}

type SessionPermissionRule = {
  scope: string
  permission: string
  decision: SessionPermissionDecision
  updatedAt: number
  note?: string
}

type SessionPermissionOnceGrant = {
  scope: string
  permission: string
  updatedAt: number
  note?: string
}

const INTERACTION_GOVERNANCE_KEY = "interactionGovernance"
const PERMISSION_RULES_KEY = "permissionRules"
const PERMISSION_ONCE_GRANTS_KEY = "permissionOnceGrants"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPermissionDecision(value: unknown): value is InteractionPermissionDecision {
  return value === "approve_once" || value === "approve_always" || value === "reject"
}

function cloneMetadata(metadata: SessionRecord["metadata"]): Record<string, unknown> {
  return metadata ? { ...metadata } : {}
}

function normalizePermissionResource(resource: InteractionResourceDescriptor): string {
  return JSON.stringify({
    kind: resource.kind,
    path: resource.path ?? null,
    uri: resource.uri ?? null,
    command: resource.command ?? null,
    workspaceId: resource.workspaceId ?? null,
    worktreeId: resource.worktreeId ?? null,
    toolName: resource.toolName ?? null,
  })
}

function parsePermissionRule(value: unknown): SessionPermissionRule | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (
    typeof value.scope !== "string"
    || typeof value.permission !== "string"
    || (value.decision !== "approve_always" && value.decision !== "reject")
    || typeof value.updatedAt !== "number"
    || (value.note !== undefined && typeof value.note !== "string")
  ) {
    return undefined
  }

  return {
    scope: value.scope,
    permission: value.permission,
    decision: value.decision,
    updatedAt: value.updatedAt,
    ...(value.note ? { note: value.note } : {}),
  }
}

function parsePermissionOnceGrant(value: unknown): SessionPermissionOnceGrant | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (
    typeof value.scope !== "string"
    || typeof value.permission !== "string"
    || typeof value.updatedAt !== "number"
    || (value.note !== undefined && typeof value.note !== "string")
  ) {
    return undefined
  }

  return {
    scope: value.scope,
    permission: value.permission,
    updatedAt: value.updatedAt,
    ...(value.note ? { note: value.note } : {}),
  }
}

function readPermissionRules(metadata: SessionRecord["metadata"]): SessionPermissionRule[] {
  if (!metadata || !isRecord(metadata)) {
    return []
  }

  const governance = metadata[INTERACTION_GOVERNANCE_KEY]
  if (!isRecord(governance) || !Array.isArray(governance[PERMISSION_RULES_KEY])) {
    return []
  }

  return governance[PERMISSION_RULES_KEY]
    .map(parsePermissionRule)
    .filter((rule): rule is SessionPermissionRule => Boolean(rule))
}

function readPermissionOnceGrants(metadata: SessionRecord["metadata"]): SessionPermissionOnceGrant[] {
  if (!metadata || !isRecord(metadata)) {
    return []
  }

  const governance = metadata[INTERACTION_GOVERNANCE_KEY]
  if (!isRecord(governance) || !Array.isArray(governance[PERMISSION_ONCE_GRANTS_KEY])) {
    return []
  }

  return governance[PERMISSION_ONCE_GRANTS_KEY]
    .map(parsePermissionOnceGrant)
    .filter((grant): grant is SessionPermissionOnceGrant => Boolean(grant))
}

function writePermissionGovernance(input: {
  session: SessionRecord
  rules: readonly SessionPermissionRule[]
  onceGrants: readonly SessionPermissionOnceGrant[]
  updatedAt: number
}): SessionRecord {
  const metadata = cloneMetadata(input.session.metadata)
  const governance = isRecord(metadata[INTERACTION_GOVERNANCE_KEY])
    ? { ...(metadata[INTERACTION_GOVERNANCE_KEY] as Record<string, unknown>) }
    : {}

  if (input.rules.length > 0) {
    governance[PERMISSION_RULES_KEY] = input.rules.map((rule) => ({ ...rule }))
  } else {
    delete governance[PERMISSION_RULES_KEY]
  }

  if (input.onceGrants.length > 0) {
    governance[PERMISSION_ONCE_GRANTS_KEY] = input.onceGrants.map((grant) => ({ ...grant }))
  } else {
    delete governance[PERMISSION_ONCE_GRANTS_KEY]
  }

  if (Object.keys(governance).length > 0) {
    metadata[INTERACTION_GOVERNANCE_KEY] = governance
  } else {
    delete metadata[INTERACTION_GOVERNANCE_KEY]
  }

  return {
    ...input.session,
    updatedAt: input.updatedAt,
    metadata: Object.keys(metadata).length > 0 ? metadata as KernelMetadata : undefined,
  }
}

export function parsePermissionInteractionRequest(
  interaction: InteractionRecord,
): PermissionInteractionRequest | undefined {
  if (interaction.kind !== "permission") {
    return undefined
  }

  return isPermissionInteractionRequest(interaction.request)
    ? interaction.request
    : undefined
}

export function parsePermissionDecisionResponse(
  response: unknown,
): ParsedPermissionDecisionResponse | undefined {
  if (!isRecord(response) || !isPermissionDecision(response.decision)) {
    return undefined
  }

  if (response.kind !== undefined && response.kind !== "permission") {
    return undefined
  }

  if (response.note !== undefined && typeof response.note !== "string") {
    return undefined
  }

  return {
    decision: response.decision,
    ...(response.note ? { note: response.note } : {}),
  }
}

export function buildPermissionRuleScope(request: PermissionInteractionRequest): string {
  return JSON.stringify({
    permission: request.permission,
    operationKind: request.operation?.kind ?? null,
    resources: (request.resources ?? []).map(normalizePermissionResource).sort(),
  })
}

export function clearSessionPermissionRule(input: {
  session: SessionRecord
  request: PermissionInteractionRequest
  updatedAt: number
}): SessionRecord {
  const scope = buildPermissionRuleScope(input.request)
  const nextRules = readPermissionRules(input.session.metadata).filter((rule) => rule.scope !== scope)

  return writePermissionGovernance({
    session: input.session,
    rules: nextRules,
    onceGrants: readPermissionOnceGrants(input.session.metadata),
    updatedAt: input.updatedAt,
  })
}

export function upsertSessionPermissionRule(input: {
  session: SessionRecord
  request: PermissionInteractionRequest
  decision: SessionPermissionDecision
  updatedAt: number
  note?: string
}): SessionRecord {
  const scope = buildPermissionRuleScope(input.request)
  const nextRule: SessionPermissionRule = {
    scope,
    permission: input.request.permission,
    decision: input.decision,
    updatedAt: input.updatedAt,
    ...(input.note ? { note: input.note } : {}),
  }

  const nextRules = readPermissionRules(input.session.metadata)
    .filter((rule) => rule.scope !== scope)
    .concat(nextRule)

  return writePermissionGovernance({
    session: input.session,
    rules: nextRules,
    onceGrants: readPermissionOnceGrants(input.session.metadata)
      .filter((grant) => grant.scope !== scope),
    updatedAt: input.updatedAt,
  })
}

export function upsertSessionPermissionOnceGrant(input: {
  session: SessionRecord
  request: PermissionInteractionRequest
  updatedAt: number
  note?: string
}): SessionRecord {
  const scope = buildPermissionRuleScope(input.request)
  const nextGrant: SessionPermissionOnceGrant = {
    scope,
    permission: input.request.permission,
    updatedAt: input.updatedAt,
    ...(input.note ? { note: input.note } : {}),
  }

  return writePermissionGovernance({
    session: input.session,
    rules: readPermissionRules(input.session.metadata)
      .filter((rule) => rule.scope !== scope),
    onceGrants: readPermissionOnceGrants(input.session.metadata)
      .filter((grant) => grant.scope !== scope)
      .concat(nextGrant),
    updatedAt: input.updatedAt,
  })
}

export function consumeSessionPermissionOnceGrant(input: {
  session: SessionRecord
  request: PermissionInteractionRequest
  updatedAt: number
}): { granted: boolean; session: SessionRecord } {
  const scope = buildPermissionRuleScope(input.request)
  const grants = readPermissionOnceGrants(input.session.metadata)
  if (!grants.some((grant) => grant.scope === scope)) {
    return {
      granted: false,
      session: input.session,
    }
  }

  return {
    granted: true,
    session: writePermissionGovernance({
      session: input.session,
      rules: readPermissionRules(input.session.metadata),
      onceGrants: grants.filter((grant) => grant.scope !== scope),
      updatedAt: input.updatedAt,
    }),
  }
}