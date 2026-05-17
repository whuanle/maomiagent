import type { ContextBlock, MessageRecordWithParts, RunRecord, SessionRecord, ToolDescriptor } from "../../core"

export type ContextContributorInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
  availableTools?: readonly ToolDescriptor[]
}

export type ContextContribution = {
  systemBlocks?: readonly ContextBlock[]
  contextBlocks?: readonly ContextBlock[]
}

export interface ContextContributor {
  contribute(input: ContextContributorInput): Promise<ContextContribution>
}

export type CollectedContextContribution = {
  systemBlocks: readonly ContextBlock[]
  contextBlocks: readonly ContextBlock[]
}

function cloneBlock(block: ContextBlock): ContextBlock {
  return {
    ...block,
    metadata: block.metadata ? { ...block.metadata } : undefined,
  }
}

function appendUniqueBlocks(
  target: ContextBlock[],
  blocks: readonly ContextBlock[] | undefined,
  seenIds: Set<string>,
): void {
  for (const block of blocks ?? []) {
    if (seenIds.has(block.id)) {
      continue
    }

    seenIds.add(block.id)
    target.push(cloneBlock(block))
  }
}

export class ContextContributorRegistry {
  constructor(private readonly contributors: readonly ContextContributor[] = []) {}

  async collect(input: ContextContributorInput): Promise<CollectedContextContribution> {
    const systemBlocks: ContextBlock[] = []
    const contextBlocks: ContextBlock[] = []
    const seenSystemBlockIds = new Set<string>()
    const seenContextBlockIds = new Set<string>()

    for (const contributor of this.contributors) {
      const contribution = await contributor.contribute(input)
      appendUniqueBlocks(systemBlocks, contribution.systemBlocks, seenSystemBlockIds)
      appendUniqueBlocks(contextBlocks, contribution.contextBlocks, seenContextBlockIds)
    }

    return {
      systemBlocks,
      contextBlocks,
    }
  }
}
