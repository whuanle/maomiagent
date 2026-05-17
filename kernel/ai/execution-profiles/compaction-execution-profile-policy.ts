import type { AiExecutionProfileRef } from "../contracts"
import type {
  ContextView,
  RunBoundary,
  RunRecord,
  SessionRecord,
  TurnInputContext,
} from "../../src/core"

export type CompactionExecutionProfilePolicyInput = {
  session: SessionRecord
  run: RunRecord
  reason: Extract<RunBoundary, { kind: "awaiting_compaction" }>["reason"]
  turnInput: TurnInputContext
  contextView: ContextView
}

export type CompactionExecutionProfileSelection = {
  executionProfile?: AiExecutionProfileRef
}

export interface CompactionExecutionProfilePolicy {
  resolve(
    input: CompactionExecutionProfilePolicyInput,
  ): Promise<CompactionExecutionProfileSelection>
}

function matchesExecutionProfileRef(
  left: AiExecutionProfileRef,
  right: AiExecutionProfileRef,
): boolean {
  return left.id === right.id
}

function resolvePreferredExecutionProfile(turnInput: TurnInputContext): AiExecutionProfileRef | undefined {
  const preferredAgent = turnInput.preferredAgentId
    ? turnInput.availableAgents.find((agent) => agent.id === turnInput.preferredAgentId)
    : turnInput.availableAgents[0]
  const preferredExecutionProfile = preferredAgent?.defaultExecutionProfile

  if (!preferredExecutionProfile) {
    return turnInput.candidateExecutionProfiles[0]
  }

  return turnInput.candidateExecutionProfiles.find((candidate) =>
    matchesExecutionProfileRef(candidate, preferredExecutionProfile))
    ?? preferredExecutionProfile
}

export class DefaultCompactionExecutionProfilePolicy implements CompactionExecutionProfilePolicy {
  async resolve(
    input: CompactionExecutionProfilePolicyInput,
  ): Promise<CompactionExecutionProfileSelection> {
    return {
      executionProfile: resolvePreferredExecutionProfile(input.turnInput),
    }
  }
}
