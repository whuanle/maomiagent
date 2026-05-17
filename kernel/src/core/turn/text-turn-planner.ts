import { buildPromptEnvelope } from "../context"
import { asTurnId } from "../ids"
import type { AiExecutionProfileRef } from "../../../ai/contracts"
import { matchesAiExecutionProfileRef } from "../../../ai/contracts"
import type {
  AgentDescriptor,
  ClockPort,
  ContextViewBuilderPort,
  IdGeneratorPort,
  TurnPlannerPort,
  TurnPlanningInput,
} from "../ports"
import type { TurnPlan } from "./index"

type TextTurnPlannerOptions = {
  clock: ClockPort
  idGenerator: IdGeneratorPort
  contextViewBuilder: ContextViewBuilderPort
}

function matchesExecutionProfileRef(left: AiExecutionProfileRef, right: AiExecutionProfileRef): boolean {
  return matchesAiExecutionProfileRef(left, right)
}

function resolveAgent(input: TurnPlanningInput): AgentDescriptor {
  const preferred = input.turnInput.preferredAgentId
    ? input.turnInput.availableAgents.find((agent) => agent.id === input.turnInput.preferredAgentId)
    : undefined
  const selected = preferred ?? input.turnInput.availableAgents[0]

  if (!selected) {
    throw new Error("Turn planning failed: no available agent")
  }

  return selected
}

function resolveExecutionProfile(input: TurnPlanningInput, agent: AgentDescriptor): AiExecutionProfileRef {
  const preferredExecutionProfile = agent.defaultExecutionProfile
    ? input.turnInput.candidateExecutionProfiles.find((candidate) =>
        matchesExecutionProfileRef(candidate, agent.defaultExecutionProfile!))
    : undefined
  const selected =
    preferredExecutionProfile
    ?? input.turnInput.candidateExecutionProfiles[0]
    ?? agent.defaultExecutionProfile

  if (!selected) {
    throw new Error(`Turn planning failed: no candidate execution profile for agent ${agent.id}`)
  }

  return selected
}

export class TextTurnPlanner implements TurnPlannerPort {
  constructor(private readonly options: TextTurnPlannerOptions) {}

  async plan(input: TurnPlanningInput): Promise<TurnPlan> {
    const contextView = await this.options.contextViewBuilder.build({
      session: input.session,
      run: input.run,
      messages: input.visibleMessages,
      checkpoints: input.checkpoints,
      turnInput: input.turnInput,
    })
    const agent = resolveAgent(input)
    const executionProfile = resolveExecutionProfile(input, agent)
    const turnId = asTurnId(this.options.idGenerator.next("turn"))
    const maxTurnsPerRun = typeof input.turnInput.policies.maxTurnsPerRun === "number"
      ? input.turnInput.policies.maxTurnsPerRun
      : undefined

    return {
      turn: {
        id: turnId,
        runId: input.run.id,
        sessionId: input.session.id,
        status: "planned",
        sequence: input.nextSequence,
        agentId: agent.id,
        executionProfile,
        startedAt: this.options.clock.now(),
      },
      agentId: agent.id,
      executionProfile,
      tools: input.turnInput.availableTools,
      contextView,
      envelope: buildPromptEnvelope({
        sessionId: input.session.id,
        runId: input.run.id,
        turnId,
        agentId: agent.id,
        contextView,
        tools: input.turnInput.availableTools,
        outputMode: input.turnInput.outputMode,
      }),
      outputMode: input.turnInput.outputMode,
      visibleMessages: contextView.visibleMessages,
      stopAfterThisTurn:
        maxTurnsPerRun !== undefined
        && input.nextSequence >= maxTurnsPerRun,
      metadata: maxTurnsPerRun === undefined
        ? undefined
        : {
            maxTurnsPerRun,
          },
    }
  }
}
