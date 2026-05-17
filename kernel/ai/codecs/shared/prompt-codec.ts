import type { AiTurnRequest } from "../../contracts"

export interface PromptCodec<TPayload> {
  encode(input: AiTurnRequest): TPayload
}