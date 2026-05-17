import type { AgentDescriptor, MessageRecordWithParts, RunRecord, SessionRecord } from "../../core"

export type AgentPolicyInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
  availableAgents: readonly AgentDescriptor[]
}

export type AgentPolicyDecision = {
  availableAgents: readonly AgentDescriptor[]
  preferredAgentId?: string
}

export interface AgentPolicyResolver {
  resolve(input: AgentPolicyInput): Promise<AgentPolicyDecision>
}

type DefaultAgentPolicyResolverOptions = {
  defaultAgentId?: string
}

function cloneAgent(agent: AgentDescriptor): AgentDescriptor {
  return {
    ...agent,
    defaultExecutionProfile: agent.defaultExecutionProfile ? { ...agent.defaultExecutionProfile } : undefined,
    metadata: agent.metadata ? { ...agent.metadata } : undefined,
  }
}

function readStringField(metadata: SessionRecord["metadata"] | RunRecord["metadata"], key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === "string" ? value : undefined
}

function resolvePreferredAgentId(input: AgentPolicyInput, fallback?: string): string | undefined {
  return readStringField(input.run.metadata, "preferredAgentId")
    ?? readStringField(input.run.metadata, "agentId")
    ?? readStringField(input.session.metadata, "preferredAgentId")
    ?? readStringField(input.session.metadata, "agentId")
    ?? fallback
}

export class DefaultAgentPolicyResolver implements AgentPolicyResolver {
  constructor(private readonly options: DefaultAgentPolicyResolverOptions = {}) {}

  async resolve(input: AgentPolicyInput): Promise<AgentPolicyDecision> {
    const availableAgents = input.availableAgents.map(cloneAgent)
    if (availableAgents.length === 0) {
      throw new Error("Runtime agent policy failed: no available agents")
    }

    const preferredAgentId = resolvePreferredAgentId(input, this.options.defaultAgentId)
    const preferred =
      preferredAgentId && availableAgents.some((agent) => agent.id === preferredAgentId)
        ? preferredAgentId
        : availableAgents[0]?.id

    return {
      availableAgents,
      preferredAgentId: preferred,
    }
  }
}
