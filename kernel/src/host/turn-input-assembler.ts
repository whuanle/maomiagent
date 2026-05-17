import type {
  MessageRecordWithParts,
  RunRecord,
  SessionRecord,
  TurnInputAssemblerPort,
  TurnInputContext,
} from "../core"
import type { AgentPolicyResolver } from "./agents"
import { AgentRegistry } from "./agents"
import {
  RuntimeContextAssembler,
  type RuntimeContextAssemblerOptions,
  type RuntimeContextAssemblerPort,
  type RuntimeContextPolicies,
  type ContextContributorRegistry,
} from "./context"
import type { ExecutionProfilePolicyResolver } from "../../ai/execution-profiles"
import type { DynamicToolRuntimePort } from "./tools"

export type RuntimeTurnInputLoadInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
}

export type RuntimeTurnInputAssemblerOptions = {
  agentRegistry: AgentRegistry
  agentPolicyResolver: AgentPolicyResolver
  executionProfilePolicyResolver: ExecutionProfilePolicyResolver
  dynamicToolRuntime: DynamicToolRuntimePort
  contextContributorRegistry: ContextContributorRegistry
  runtimeContextAssembler?: RuntimeContextAssemblerPort
  outputMode?: RuntimeContextAssemblerOptions["outputMode"]
  policies?:
    | RuntimeContextPolicies
    | ((input: RuntimeTurnInputLoadInput) => Promise<RuntimeContextPolicies> | RuntimeContextPolicies)
}

export class RuntimeTurnInputAssembler implements TurnInputAssemblerPort {
  private readonly runtimeContextAssembler: RuntimeContextAssemblerPort
  private readonly dynamicToolRuntime: DynamicToolRuntimePort

  constructor(private readonly options: RuntimeTurnInputAssemblerOptions) {
    this.dynamicToolRuntime = options.dynamicToolRuntime
    this.runtimeContextAssembler = options.runtimeContextAssembler
      ?? new RuntimeContextAssembler({
        contextContributorRegistry: options.contextContributorRegistry,
        outputMode: options.outputMode,
        policies: options.policies,
      })
  }

  async load(input: RuntimeTurnInputLoadInput): Promise<TurnInputContext> {
    const agentDecision = await this.options.agentPolicyResolver.resolve({
      ...input,
      availableAgents: this.options.agentRegistry.list(),
    })
    const candidateExecutionProfiles = await this.options.executionProfilePolicyResolver.resolve({
      ...input,
      availableAgents: agentDecision.availableAgents,
      preferredAgentId: agentDecision.preferredAgentId,
    })
    const availableTools = await this.dynamicToolRuntime.listTools(input)
    const runtimeContext = await this.runtimeContextAssembler.assemble({
      ...input,
      availableTools,
    })

    return {
      availableAgents: agentDecision.availableAgents,
      preferredAgentId: agentDecision.preferredAgentId,
      candidateExecutionProfiles,
      availableTools,
      systemBlocks: runtimeContext.systemBlocks,
      contextBlocks: runtimeContext.contextBlocks,
      outputMode: runtimeContext.outputMode,
      policies: runtimeContext.policies,
    }
  }
}