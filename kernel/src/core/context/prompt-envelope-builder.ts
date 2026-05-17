import type { OutputMode } from "../common"
import type { RunId, SessionId, TurnId } from "../ids"
import type { ToolDescriptor } from "../tool-call"
import type { ContextView, PromptEnvelope } from "./index"

export type PromptEnvelopeBuilderInput = {
  sessionId: SessionId
  runId: RunId
  turnId: TurnId
  agentId: string
  contextView: ContextView
  tools: readonly ToolDescriptor[]
  outputMode: OutputMode
}

function hasEnvelopeContent(parts: readonly import("../message").MessagePart[]): boolean {
  return parts.length > 0
}

export function buildPromptEnvelope(input: PromptEnvelopeBuilderInput): PromptEnvelope {
  return {
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId,
    agentId: input.agentId,
    systemBlocks: [...input.contextView.systemBlocks],
    contextBlocks: [...input.contextView.contextBlocks],
    messages: input.contextView.visibleMessages.filter((message) => hasEnvelopeContent(message.parts)),
    tools: [...input.tools],
    outputMode: input.outputMode,
  }
}
