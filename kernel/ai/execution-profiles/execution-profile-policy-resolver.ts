import type {
  AgentDescriptor,
  MessageRecordWithParts,
  RunRecord,
  SessionRecord,
} from "../../src/core"
import type { AiExecutionProfileRef } from "../contracts"
import { ExecutionProfileRegistry } from "./execution-profile-registry"

export type ExecutionProfilePolicyInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
  availableAgents: readonly AgentDescriptor[]
  preferredAgentId?: string
}

export interface ExecutionProfilePolicyResolver {
  resolve(input: ExecutionProfilePolicyInput): Promise<readonly AiExecutionProfileRef[]>
}

export type DefaultExecutionProfilePolicyResolverOptions = {
  executionProfileRegistry: ExecutionProfileRegistry
  defaultExecutionProfile?: AiExecutionProfileRef
}

function matchesExecutionProfileRef(left: AiExecutionProfileRef, right: AiExecutionProfileRef): boolean {
  return left.id === right.id
}

function cloneExecutionProfileRef(profile: AiExecutionProfileRef): AiExecutionProfileRef {
  return {
    id: profile.id,
    modelId: profile.modelId,
    metadata: profile.metadata ? { ...profile.metadata } : undefined,
  }
}

function readPreferredExecutionProfile(
  metadata: SessionRecord["metadata"] | RunRecord["metadata"],
): AiExecutionProfileRef | undefined {
  const preferred = metadata?.preferredExecutionProfile
  if (
    preferred
    && typeof preferred === "object"
    && typeof (preferred as Record<string, unknown>).id === "string"
  ) {
    return {
      id: (preferred as Record<string, unknown>).id as AiExecutionProfileRef["id"],
      modelId: typeof (preferred as Record<string, unknown>).modelId === "string"
        ? (preferred as Record<string, unknown>).modelId as string
        : undefined,
      metadata:
        (preferred as Record<string, unknown>).metadata
        && typeof (preferred as Record<string, unknown>).metadata === "object"
        && !Array.isArray((preferred as Record<string, unknown>).metadata)
          ? (preferred as Record<string, unknown>).metadata as AiExecutionProfileRef["metadata"]
          : undefined,
    }
  }

  const preferredId = metadata?.preferredExecutionProfileId
  if (typeof preferredId === "string") {
    return {
      id: preferredId as AiExecutionProfileRef["id"],
    }
  }

  return undefined
}

function resolveAgentDefaultExecutionProfile(
  input: ExecutionProfilePolicyInput,
): AiExecutionProfileRef | undefined {
  const preferredAgent = input.preferredAgentId
    ? input.availableAgents.find((agent) => agent.id === input.preferredAgentId)
    : input.availableAgents[0]

  return preferredAgent?.defaultExecutionProfile
    ? cloneExecutionProfileRef(preferredAgent.defaultExecutionProfile)
    : undefined
}

function appendExecutionProfile(
  target: AiExecutionProfileRef[],
  seen: Set<string>,
  available: readonly AiExecutionProfileRef[],
  candidate?: AiExecutionProfileRef,
): void {
  if (!candidate) {
    return
  }

  const matched = available.find((profile) => matchesExecutionProfileRef(profile, candidate))
  if (!matched) {
    return
  }

  const key = matched.id
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  target.push(cloneExecutionProfileRef(matched))
}

export class DefaultExecutionProfilePolicyResolver implements ExecutionProfilePolicyResolver {
  constructor(private readonly options: DefaultExecutionProfilePolicyResolverOptions) {}

  async resolve(input: ExecutionProfilePolicyInput): Promise<readonly AiExecutionProfileRef[]> {
    const availableExecutionProfiles = this.options.executionProfileRegistry.listExecutionProfiles()
    if (availableExecutionProfiles.length === 0) {
      throw new Error("Runtime execution profile policy failed: no candidate execution profiles")
    }

    const ordered: AiExecutionProfileRef[] = []
    const seen = new Set<string>()

    appendExecutionProfile(
      ordered,
      seen,
      availableExecutionProfiles,
      readPreferredExecutionProfile(input.run.metadata),
    )
    appendExecutionProfile(
      ordered,
      seen,
      availableExecutionProfiles,
      readPreferredExecutionProfile(input.session.metadata),
    )
    appendExecutionProfile(
      ordered,
      seen,
      availableExecutionProfiles,
      resolveAgentDefaultExecutionProfile(input),
    )
    appendExecutionProfile(
      ordered,
      seen,
      availableExecutionProfiles,
      this.options.defaultExecutionProfile,
    )

    for (const executionProfile of availableExecutionProfiles) {
      appendExecutionProfile(ordered, seen, availableExecutionProfiles, executionProfile)
    }

    return ordered
  }
}
