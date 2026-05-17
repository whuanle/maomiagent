import type { AgentDescriptor } from "../../core"

export type RuntimeAgentDefinition = AgentDescriptor & {
  enabled?: boolean
}

function cloneAgent(agent: AgentDescriptor): AgentDescriptor {
  return {
    ...agent,
    defaultExecutionProfile: agent.defaultExecutionProfile ? { ...agent.defaultExecutionProfile } : undefined,
    metadata: agent.metadata ? { ...agent.metadata } : undefined,
  }
}

function normalizeAgents(agents: readonly RuntimeAgentDefinition[]): AgentDescriptor[] {
  const knownIds = new Set<string>()
  const normalized: AgentDescriptor[] = []

  for (const agent of agents) {
    if (agent.enabled === false) {
      continue
    }

    if (knownIds.has(agent.id)) {
      throw new Error(`Runtime agent registry received duplicate agent id: ${agent.id}`)
    }

    knownIds.add(agent.id)
    normalized.push(cloneAgent(agent))
  }

  return normalized
}

export class AgentRegistry {
  private readonly agents: readonly AgentDescriptor[]

  constructor(agents: readonly RuntimeAgentDefinition[] = []) {
    this.agents = normalizeAgents(agents)
  }

  list(): readonly AgentDescriptor[] {
    return this.agents.map(cloneAgent)
  }

  get(id: string): AgentDescriptor | undefined {
    const agent = this.agents.find((candidate) => candidate.id === id)
    return agent ? cloneAgent(agent) : undefined
  }
}
