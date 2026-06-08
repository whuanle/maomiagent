import type {
  ClockPort,
  ContextView,
  ContextCheckpointRecord,
  IdGeneratorPort,
  MessagePart,
  MessageRecordWithParts,
  MessageRecord,
  RunRecord,
  SessionRecord,
} from "../.."
import type { AiExecutionProfileRef } from "../../../../ai/contracts"
import { asContextCheckpointId, asMessageId, asMessagePartId } from "../.."
import { degradeMessageMedia, type MediaDegradeScope } from "./media-degrader"
import { pruneOldToolOutputs } from "./tool-output-pruner"

export type CompactionReason = "context_overflow" | "budget_exceeded" | "manual"

export type CompactionSummaryInput = {
  session: SessionRecord
  run: RunRecord
  contextView: ContextView
  executionProfile?: AiExecutionProfileRef
  prompt: string
  reason: CompactionReason
}

export interface CompactionSummaryGenerator {
  generate(input: CompactionSummaryInput): Promise<string>
}

export type CompactionArtifact = {
  summaryMessage: {
    message: MessageRecord
    parts: readonly MessagePart[]
  }
  replayMessage?: {
    sourceMessageId: MessageRecord["id"]
    message: MessageRecord
    parts: readonly MessagePart[]
  }
  checkpoint: ContextCheckpointRecord
  preparedContextView: ContextView
  continuation:
    | {
      kind: "system_continue"
      reason: CompactionReason
    }
    | {
      kind: "replay_user_message"
      reason: Extract<CompactionReason, "context_overflow">
      sourceMessageId: MessageRecord["id"]
      replayMessageId: MessageRecord["id"]
    }
  decisions: {
    protectedToolNames: readonly string[]
    protectedMessageIds: readonly MessageRecord["id"][]
  }
  stats: {
    mediaDegradedMessages: number
    mediaDegradedParts: number
    prunedMessageIds: readonly MessageRecord["id"][]
    prunedTokens: number
    totalCandidateTokens: number
  }
}

type CompactionEngineOptions = {
  clock: ClockPort
  idGenerator: IdGeneratorPort
  summaryGenerator: CompactionSummaryGenerator
  mediaDegradeScope?: MediaDegradeScope
  promptTemplate?: string
  toolPrune?: {
    protectRecentUserTurns?: number
    protectTokens?: number
    minimumPruneTokens?: number
    protectedToolNames?: readonly string[]
    clearedOutputText?: string
  }
}

const DEFAULT_COMPACTION_PROMPT = `Provide a durable continuation summary so another agent can resume the work without rereading the full conversation.
Do not call tools. Respond only with summary text in the same language as the user's messages.

Use this structure:
## Goal
[What the user is trying to accomplish.]

## Constraints
- [Important instructions, constraints, and boundaries that must continue to be followed.]

## Discoveries
- [Concrete findings, decisions, or observations that matter for the next agent.]

## Accomplished
- [Completed work.]

## Pending
- [What still needs to be done next.]

## Relevant files
- [Files or directories that matter, with a brief note when useful.]

## Open questions
- [Anything still unresolved, if applicable.]`

function cloneMessagePart(input: {
  part: MessagePart
  idGenerator: IdGeneratorPort
}): MessagePart {
  const id = asMessagePartId(input.idGenerator.next("part"))

  switch (input.part.type) {
    case "text":
      return {
        id,
        type: "text",
        text: input.part.text,
      }
    case "reasoning":
      return {
        id,
        type: "reasoning",
        text: input.part.text,
      }
    case "attachment":
      return {
        id,
        type: "attachment",
        attachmentId: input.part.attachmentId,
        mimeType: input.part.mimeType,
        name: input.part.name,
        kind: input.part.kind,
        path: input.part.path,
        assetId: input.part.assetId,
        assetMonth: input.part.assetMonth,
        fileName: input.part.fileName,
        sizeBytes: input.part.sizeBytes,
      }
    case "tool_call_ref":
      return {
        id,
        type: "tool_call_ref",
        toolCallId: input.part.toolCallId,
        toolName: input.part.toolName,
        input: input.part.input,
      }
    case "tool_result_ref":
      return {
        id,
        type: "tool_result_ref",
        toolCallId: input.part.toolCallId,
        toolName: input.part.toolName,
      }
    case "error":
      return {
        id,
        type: "error",
        error: input.part.error,
      }
    case "meta":
      return {
        id,
        type: "meta",
        data: input.part.data,
      }
  }
}

function resolveReplaySourceMessage(input: {
  reason: CompactionReason
  run: RunRecord
  messages: readonly MessageRecordWithParts[]
}): MessageRecordWithParts | undefined {
  if (input.reason !== "context_overflow") {
    return undefined
  }

  if (input.run.trigger.kind !== "user_message" || !input.run.trigger.refId) {
    return undefined
  }

  const source = input.messages.find((message) =>
    message.message.id === input.run.trigger.refId
    && message.message.role === "user")

  if (!source) {
    return undefined
  }

  if (source.parts.length === 0) {
    return undefined
  }

  return source
}

function extractCompactionMessagePreview(message: MessageRecordWithParts | undefined): string | undefined {
  if (!message) {
    return undefined
  }

  const text = message.parts
    .flatMap((part) => part.type === "text" && typeof part.text === "string" && part.text.trim() ? [part.text.trim()] : [])
    .join("\n")
    .trim()
  if (text) {
    return text.length > 240 ? `${text.slice(0, 237)}...` : text
  }

  const fallback = message.parts.map((part) => `[${part.type}]`).join(" ").trim()
  if (!fallback) {
    return undefined
  }

  return fallback.length > 240 ? `${fallback.slice(0, 237)}...` : fallback
}

function extractLatestUserMessage(messages: readonly MessageRecordWithParts[]): MessageRecordWithParts | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]
    if (candidate?.message.role === "user") {
      return candidate
    }
  }

  return undefined
}

export function buildCompactionPrompt(input: {
  template: string
  reason: CompactionReason
  run: RunRecord
  contextView: ContextView
}): string {
  const latestUserMessage = extractLatestUserMessage(input.contextView.visibleMessages)
  const latestUserPreview = extractCompactionMessagePreview(latestUserMessage)
  const promptSuffix: string[] = []

  if (input.run.trigger.kind === "tool_result" || input.run.trigger.kind === "system_continue") {
    promptSuffix.push(
      "This compaction was triggered during a continuation turn, not by a new user message.",
      "Do not write that the user said something, said nothing, changed goals, or asked a new question in this turn unless a visible user message explicitly shows it.",
      "Summarize only confirmed facts: the established goal, completed work, tool or system outcomes, changed artifacts, and the next step.",
    )
    if (latestUserMessage) {
      promptSuffix.push(`Latest confirmed user message id: ${latestUserMessage.message.id}.`)
    }
    if (latestUserPreview) {
      promptSuffix.push(`Latest confirmed user message preview: ${latestUserPreview}`)
    }
  } else if (input.run.trigger.kind === "user_message") {
    promptSuffix.push(
      "If you describe the latest user intent, base it only on the visible user message content and avoid adding claims that are not explicitly supported.",
    )
  }

  if (input.reason === "context_overflow") {
    promptSuffix.push(
      "The previous request exceeded the model context window. Preserve the latest actionable user intent for replay, and note that attachments or older tool outputs may already have been reduced before summarization.",
    )
  } else if (input.reason === "budget_exceeded") {
    promptSuffix.push(
      "The previous request exceeded the prompt budget. Prefer the most actionable continuation state, and keep the summary compact enough to fit on the next attempt.",
    )
  }

  return promptSuffix.length > 0 ? `${input.template}\n\n${promptSuffix.join("\n")}` : input.template
}

function validateSummaryText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim()
  if (!normalized) {
    throw new Error("Compaction summary generator returned empty text")
  }

  return normalized
}

export class CompactionEngine {
  private readonly mediaDegradeScope: MediaDegradeScope
  private readonly promptTemplate: string

  constructor(private readonly options: CompactionEngineOptions) {
    this.mediaDegradeScope = options.mediaDegradeScope ?? "all_messages"
    this.promptTemplate = options.promptTemplate ?? DEFAULT_COMPACTION_PROMPT
  }

  async compact(input: {
    session: SessionRecord
    run: RunRecord
    contextView: ContextView
    reason?: CompactionReason
    executionProfile?: AiExecutionProfileRef
  }): Promise<CompactionArtifact> {
    const reason = input.reason ?? "manual"
    const lastVisibleMessage = input.contextView.visibleMessages.at(-1)
    if (!lastVisibleMessage) {
      throw new Error("Compaction requires at least one visible message")
    }

    const degraded = degradeMessageMedia({
      messages: input.contextView.visibleMessages,
      scope: this.mediaDegradeScope,
    })
    const pruned = pruneOldToolOutputs({
      messages: degraded.messages,
      ...this.options.toolPrune,
    })
    const preparedContextView: ContextView = {
      visibleMessages: [...pruned.messages],
      checkpoints: [...input.contextView.checkpoints],
      systemBlocks: [...input.contextView.systemBlocks],
      contextBlocks: [...input.contextView.contextBlocks],
    }
    const replaySourceMessage = resolveReplaySourceMessage({
      reason,
      run: input.run,
      messages: preparedContextView.visibleMessages,
    })

    const summaryText = validateSummaryText(await this.options.summaryGenerator.generate({
      session: input.session,
      run: input.run,
      contextView: preparedContextView,
      executionProfile: input.executionProfile,
      prompt: buildCompactionPrompt({
        template: this.promptTemplate,
        reason,
        run: input.run,
        contextView: preparedContextView,
      }),
      reason,
    }))
    const now = this.options.clock.now()
    const summaryMessage: CompactionArtifact["summaryMessage"] = {
      message: {
        id: asMessageId(this.options.idGenerator.next("message")),
        sessionId: input.session.id,
        runId: input.run.id,
        role: "assistant",
        createdAt: now,
        metadata: {
          kind: "compaction_summary",
          reason,
        },
      },
      parts: [
        {
          id: asMessagePartId(this.options.idGenerator.next("part")),
          type: "text",
          text: summaryText,
        },
      ],
    }
    const replayMessage = replaySourceMessage
      ? {
          sourceMessageId: replaySourceMessage.message.id,
          message: {
            id: asMessageId(this.options.idGenerator.next("message")),
            sessionId: input.session.id,
            runId: input.run.id,
            role: "user" as const,
            createdAt: this.options.clock.now(),
            metadata: {
              kind: "compaction_replay",
              reason,
              sourceMessageId: replaySourceMessage.message.id,
            },
          },
          parts: replaySourceMessage.parts.map((part) =>
            cloneMessagePart({
              part,
              idGenerator: this.options.idGenerator,
            })),
        }
      : undefined
    const continuation = replayMessage
      ? {
          kind: "replay_user_message" as const,
          reason: "context_overflow" as const,
          sourceMessageId: replayMessage.sourceMessageId,
          replayMessageId: replayMessage.message.id,
        }
      : {
          kind: "system_continue" as const,
          reason,
        }
    const checkpoint: ContextCheckpointRecord = {
      id: asContextCheckpointId(this.options.idGenerator.next("checkpoint")),
      sessionId: input.session.id,
      kind: "summary",
      replacesThroughMessageId: lastVisibleMessage.message.id,
      summaryMessageId: summaryMessage.message.id,
      createdAt: now,
      metadata: {
        reason,
        mediaDegradedMessages: degraded.degradedMessages,
        mediaDegradedParts: degraded.degradedParts,
        prunedMessageIds: pruned.prunedMessageIds,
        protectedMessageIds: pruned.protectedMessageIds,
        protectedToolNames: pruned.protectedToolNames,
        prunedTokens: pruned.prunedTokens,
        totalCandidateTokens: pruned.totalCandidateTokens,
        continuation,
      },
    }

    return {
      summaryMessage,
      replayMessage,
      checkpoint,
      preparedContextView,
      continuation,
      decisions: {
        protectedToolNames: pruned.protectedToolNames,
        protectedMessageIds: pruned.protectedMessageIds,
      },
      stats: {
        mediaDegradedMessages: degraded.degradedMessages,
        mediaDegradedParts: degraded.degradedParts,
        prunedMessageIds: pruned.prunedMessageIds,
        prunedTokens: pruned.prunedTokens,
        totalCandidateTokens: pruned.totalCandidateTokens,
      },
    }
  }
}
