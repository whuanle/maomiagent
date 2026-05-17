import {
  cloneAiExecutionProfileRef,
  type AiExecutionProfileRef,
  type AiServiceAdapter,
  type AiTurnPort,
} from "../contracts"
import type {
  AiTurnEvent,
  AiTurnRequest,
} from "../contracts"
import {
  type KernelMetadata,
  type SessionId,
} from "../../src/core"

export type ChannelSelection = {
  channelId: string
  modelId?: string
  metadata?: KernelMetadata
}

export type AiRoutePurpose = "primary" | "compaction" | "child-session"

export type AiRouteRequest = {
  sessionId: SessionId
  workspaceId?: string
  selection: ChannelSelection
  purpose: AiRoutePurpose
  metadata?: KernelMetadata
}

export interface AiRouteResolver {
  resolve(input: AiRouteRequest): Promise<AiExecutionProfileRef>
}

export interface AiTurnPortRouter {
  resolve(input: {
    executionProfile: AiExecutionProfileRef
  }): Promise<AiTurnPort>
}

export type StaticAiRouteDefinition = {
  channelId: string
  modelId?: string
  workspaceId?: string
  purpose?: AiRoutePurpose | readonly AiRoutePurpose[]
  executionProfile: AiExecutionProfileRef
}

type StaticAiRouteResolverOptions = {
  routes: readonly StaticAiRouteDefinition[]
  fallbackExecutionProfile?: AiExecutionProfileRef
}

function matchesPurpose(route: StaticAiRouteDefinition, purpose: AiRoutePurpose): boolean {
  if (!route.purpose) {
    return true
  }

  return Array.isArray(route.purpose)
    ? route.purpose.includes(purpose)
    : route.purpose === purpose
}

function matchesRoute(route: StaticAiRouteDefinition, input: AiRouteRequest): boolean {
  return route.channelId === input.selection.channelId
    && (!route.modelId || route.modelId === input.selection.modelId)
    && (!route.workspaceId || route.workspaceId === input.workspaceId)
    && matchesPurpose(route, input.purpose)
}

function routeScore(route: StaticAiRouteDefinition): number {
  return (route.workspaceId ? 4 : 0)
    + (route.modelId ? 2 : 0)
    + (route.purpose ? 1 : 0)
}

export class StaticAiRouteResolver implements AiRouteResolver {
  constructor(private readonly options: StaticAiRouteResolverOptions) {}

  async resolve(input: AiRouteRequest): Promise<AiExecutionProfileRef> {
    const matches = this.options.routes
      .filter((route) => matchesRoute(route, input))
      .map((route) => ({
        route,
        score: routeScore(route),
      }))
      .sort((left, right) => right.score - left.score)

    if (matches.length === 0) {
      if (this.options.fallbackExecutionProfile) {
        return cloneAiExecutionProfileRef(this.options.fallbackExecutionProfile)
      }

      const modelSuffix = input.selection.modelId ? `/${input.selection.modelId}` : ""
      const workspaceSuffix = input.workspaceId ? ` in workspace ${input.workspaceId}` : ""
      throw new Error(
        `AI route resolution failed for ${input.selection.channelId}${modelSuffix} (${input.purpose})${workspaceSuffix}`,
      )
    }

    const topMatches = matches.filter((candidate) => candidate.score === matches[0]?.score)
    const executionProfileIds = new Set(topMatches.map((candidate) => candidate.route.executionProfile.id))
    if (executionProfileIds.size > 1) {
      throw new Error(
        `AI route resolution is ambiguous for ${input.selection.channelId}: ${Array.from(executionProfileIds).join(", ")}`,
      )
    }

    return cloneAiExecutionProfileRef(topMatches[0]!.route.executionProfile)
  }
}

type DefaultAiTurnPortRouterOptions = {
  adapters: readonly AiServiceAdapter[]
}

export class DefaultAiTurnPortRouter implements AiTurnPortRouter {
  constructor(private readonly options: DefaultAiTurnPortRouterOptions) {}

  async resolve(input: {
    executionProfile: AiExecutionProfileRef
  }): Promise<AiTurnPort> {
    const matches: AiServiceAdapter[] = []

    for (const adapter of this.options.adapters) {
      if (await adapter.supports(input)) {
        matches.push(adapter)
      }
    }

    if (matches.length === 0) {
      throw new Error(`No AI service adapter matched execution profile: ${input.executionProfile.id}`)
    }

    if (matches.length > 1) {
      throw new Error(
        `AI turn port routing is ambiguous for ${input.executionProfile.id}: ${matches.map((adapter) => adapter.service.id).join(", ")}`,
      )
    }

    return matches[0]!.turnPort
  }
}

type RoutedAiTurnPortOptions = {
  router: AiTurnPortRouter
}

export class RoutedAiTurnPort implements AiTurnPort {
  constructor(private readonly options: RoutedAiTurnPortOptions) {}

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    const turnPort = await this.options.router.resolve({
      executionProfile: input.executionProfile,
    })

    for await (const event of turnPort.stream(input)) {
      yield event
    }
  }
}