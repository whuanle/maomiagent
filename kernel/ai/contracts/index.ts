import type { KernelMetadata } from "../../src/core"
import type { AiExecutionProfileRef, AiTurnPort } from "./ai-turn-contracts"

export * from "./ai-turn-contracts"

export type AiServiceDescriptor = {
  id: string
  displayName?: string
  metadata?: KernelMetadata
}

export interface AiServiceAdapter {
  readonly service: AiServiceDescriptor
  readonly turnPort: AiTurnPort

  supports(input: {
    executionProfile: AiExecutionProfileRef
  }): boolean | Promise<boolean>
}