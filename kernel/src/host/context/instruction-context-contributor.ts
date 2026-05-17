import type { KernelMetadata } from "../../core"
import type { ContextContribution, ContextContributor, ContextContributorInput } from "./context-contributor-registry"

type InstructionDefinition = {
  id: string
  content: string
  priority?: number
  metadata?: KernelMetadata
}

type InstructionContextContributorOptions = {
  systemInstructions?: readonly InstructionDefinition[]
  contextInstructions?: readonly InstructionDefinition[]
}

function normalizeInstruction(
  input: InstructionDefinition,
  kind: "system" | "instruction",
  fallbackPriority: number,
) {
  return {
    id: input.id,
    kind,
    content: input.content,
    priority: input.priority ?? fallbackPriority,
    metadata: input.metadata ? { ...input.metadata } : undefined,
  } as const
}

export class InstructionContextContributor implements ContextContributor {
  constructor(private readonly options: InstructionContextContributorOptions = {}) {}

  async contribute(_input: ContextContributorInput): Promise<ContextContribution> {
    return {
      systemBlocks: (this.options.systemInstructions ?? []).map((instruction) =>
        normalizeInstruction(instruction, "system", 100)
      ),
      contextBlocks: (this.options.contextInstructions ?? []).map((instruction) =>
        normalizeInstruction(instruction, "instruction", 80)
      ),
    }
  }
}
