import type { AiTurnRequest } from "../../kernel-bridge";

type PromptMessage = AiTurnRequest["prompt"]["messages"][number];
type MessagePart = PromptMessage["parts"][number];

export type SessionHistoryCompactionMode =
  | "raw"
  | "summary_with_recent_tail";

export type SessionHistoryCompactionDiagnostics = {
  historySelectionMs: number;
  turnDigestBuildMs: number;
  sessionSummaryMergeMs: number;
  recentTailUserTurns: number;
  droppedMessageCount: number;
};

export type SessionHistoryCompactionResult = {
  mode: SessionHistoryCompactionMode;
  summaryText?: string;
  messages: PromptMessage[];
  diagnostics: SessionHistoryCompactionDiagnostics;
};

type TurnDigest = {
  userIntent?: string;
  assistantOutcome?: string;
  toolsUsed: string[];
  touchedFiles: string[];
  keyErrors: string[];
  carriedForwardContext: string[];
};

const DEFAULT_SUMMARY_TRIGGER_CHARS = 12_000;
const DEFAULT_RECENT_USER_TURNS = 2;
const TEXT_PREVIEW_MAX_LENGTH = 240;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shortenText(value: string, maxLength = TEXT_PREVIEW_MAX_LENGTH): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectPartTexts(
  parts: readonly MessagePart[],
  types: ReadonlySet<MessagePart["type"]>,
): string[] {
  return parts.flatMap((part) => {
    if (!types.has(part.type)) {
      return [];
    }

    if ("text" in part && typeof part.text === "string") {
      return [part.text];
    }

    return [];
  });
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

function estimateHistoryChars(messages: readonly PromptMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += stringifyUnknown(message.message).length;
    for (const part of message.parts) {
      switch (part.type) {
        case "text":
        case "reasoning":
          total += part.text.length;
          break;
        case "tool_call_ref":
          total += part.toolName.length;
          total += stringifyUnknown(part.input).length;
          break;
        case "tool_result_ref":
          total += part.toolName.length;
          total += stringifyUnknown(part.output).length;
          break;
        case "attachment":
          total += stringifyUnknown({
            mediaType: part.mediaType,
            name: part.name,
            url: part.url,
          }).length;
          break;
        default:
          total += stringifyUnknown(part).length;
          break;
      }
    }
  }
  return total;
}

function extractPathsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractPathsFromUnknown);
  }
  if (!isRecord(value)) {
    return [];
  }

  const results: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && /(?:^|_)(?:path|file|cwd|root)$/i.test(key)) {
      results.push(entry);
      continue;
    }

    results.push(...extractPathsFromUnknown(entry));
  }
  return results;
}

function uniquePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildTurnDigest(messages: readonly PromptMessage[]): TurnDigest | undefined {
  const userMessage = messages.find((message) => message.message.role === "user");
  if (!userMessage) {
    return undefined;
  }

  const assistantMessages = messages.filter((message) => message.message.role === "assistant");
  const toolMessages = messages.filter((message) => message.message.role === "tool");
  const assistantTexts = assistantMessages.flatMap((message) =>
    collectPartTexts(message.parts, new Set(["text"]))
  );
  const reasoningTexts = assistantMessages.flatMap((message) =>
    collectPartTexts(message.parts, new Set(["reasoning"]))
  );
  const toolNames = uniquePreservingOrder(messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type === "tool_call_ref" || part.type === "tool_result_ref") {
        return [part.toolName];
      }
      return [];
    })
  ));
  const touchedFiles = uniquePreservingOrder(messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type === "tool_call_ref") {
        return extractPathsFromUnknown(part.input);
      }
      if (part.type === "tool_result_ref") {
        return extractPathsFromUnknown(part.output);
      }
      return [];
    })
  ));
  const errorTexts = uniquePreservingOrder(toolMessages.flatMap((message) =>
    collectPartTexts(message.parts, new Set(["text"]))
      .filter((text) => /error|failed|timeout|exception|invalid/i.test(text))
      .map((text) => shortenText(text, 160))
  ));

  return {
    userIntent: shortenText(collectPartTexts(userMessage.parts, new Set(["text"])).join("\n"), 200),
    assistantOutcome: assistantTexts.length > 0
      ? shortenText(assistantTexts.at(-1) ?? "")
      : undefined,
    toolsUsed: toolNames,
    touchedFiles,
    keyErrors: errorTexts,
    carriedForwardContext: uniquePreservingOrder([
      ...(touchedFiles.length > 0 ? touchedFiles.map((path) => `Touched file: ${path}`) : []),
      ...(toolNames.length > 0 ? [`Tools used: ${toolNames.join(", ")}`] : []),
      ...(reasoningTexts.length > 0 ? [`Prior reasoning present (${reasoningTexts.join("").length} chars)`] : []),
    ]),
  };
}

function splitIntoTurns(messages: readonly PromptMessage[]): PromptMessage[][] {
  const turns: PromptMessage[][] = [];
  let current: PromptMessage[] = [];

  for (const message of messages) {
    if (message.message.role === "system") {
      continue;
    }

    if (message.message.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }

    current.push(message);
  }

  if (current.length > 0) {
    turns.push(current);
  }

  return turns;
}

function selectRecentTailMessages(
  messages: readonly PromptMessage[],
  maxRecentUserTurns: number,
): PromptMessage[] {
  if (maxRecentUserTurns <= 0) {
    return [];
  }

  let seenUserTurns = 0;
  let tailStartIndex = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    if (message.message.role === "user") {
      seenUserTurns += 1;
      tailStartIndex = index;
      if (seenUserTurns >= maxRecentUserTurns) {
        break;
      }
    }
  }

  if (seenUserTurns < maxRecentUserTurns) {
    return [...messages];
  }

  const systemMessages = messages.filter((message) => message.message.role === "system");
  return [
    ...systemMessages,
    ...messages.slice(tailStartIndex).filter((message) => message.message.role !== "system"),
  ];
}

function mergeDigestsIntoSummary(input: {
  digests: readonly TurnDigest[];
}): string | undefined {
  if (input.digests.length === 0) {
    return undefined;
  }

  const goals = uniquePreservingOrder(input.digests.flatMap((digest) =>
    digest.userIntent ? [digest.userIntent] : []
  ));
  const outcomes = uniquePreservingOrder(input.digests.flatMap((digest) =>
    digest.assistantOutcome ? [digest.assistantOutcome] : []
  ));
  const tools = uniquePreservingOrder(input.digests.flatMap((digest) => digest.toolsUsed));
  const files = uniquePreservingOrder(input.digests.flatMap((digest) => digest.touchedFiles));
  const errors = uniquePreservingOrder(input.digests.flatMap((digest) => digest.keyErrors));
  const carry = uniquePreservingOrder(input.digests.flatMap((digest) => digest.carriedForwardContext));

  const section = (title: string, values: readonly string[]) => [
    `## ${title}`,
    ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- (none)"]),
  ];

  return [
    "# Session Summary",
    "",
    ...section("Goal", goals.slice(0, 4)),
    "",
    ...section("Progress", outcomes.slice(0, 6)),
    "",
    ...section("Key Decisions", carry.slice(0, 6)),
    "",
    ...section("Relevant Files", files.slice(0, 8)),
    "",
    ...section("Open Issues", errors.slice(0, 6)),
    "",
    ...section("Tools Used", tools.slice(0, 8)),
  ].join("\n");
}

export function buildSessionHistoryCompaction(input: {
  messages: readonly PromptMessage[];
  maxRecentUserTurns?: number;
  summaryTriggerChars?: number;
}): SessionHistoryCompactionResult {
  const startedAt = performance.now();
  const maxRecentUserTurns = input.maxRecentUserTurns ?? DEFAULT_RECENT_USER_TURNS;
  const summaryTriggerChars = input.summaryTriggerChars ?? DEFAULT_SUMMARY_TRIGGER_CHARS;
  const userTurnCount = input.messages.filter((message) => message.message.role === "user").length;

  if (userTurnCount <= maxRecentUserTurns) {
    return {
      mode: "raw",
      messages: [...input.messages],
      diagnostics: {
        historySelectionMs: performance.now() - startedAt,
        turnDigestBuildMs: 0,
        sessionSummaryMergeMs: 0,
        recentTailUserTurns: maxRecentUserTurns,
        droppedMessageCount: 0,
      },
    };
  }

  const estimatedChars = estimateHistoryChars(input.messages);
  if (estimatedChars <= summaryTriggerChars) {
    return {
      mode: "raw",
      messages: [...input.messages],
      diagnostics: {
        historySelectionMs: performance.now() - startedAt,
        turnDigestBuildMs: 0,
        sessionSummaryMergeMs: 0,
        recentTailUserTurns: maxRecentUserTurns,
        droppedMessageCount: 0,
      },
    };
  }

  const tailMessages = selectRecentTailMessages(input.messages, maxRecentUserTurns);
  if (tailMessages.length >= input.messages.length) {
    return {
      mode: "raw",
      messages: [...input.messages],
      diagnostics: {
        historySelectionMs: performance.now() - startedAt,
        turnDigestBuildMs: 0,
        sessionSummaryMergeMs: 0,
        recentTailUserTurns: maxRecentUserTurns,
        droppedMessageCount: 0,
      },
    };
  }

  const tailMessageIds = new Set(tailMessages.map((message) => message.message.id));
  const olderMessages = input.messages.filter((message) => !tailMessageIds.has(message.message.id));
  const digestStartedAt = performance.now();
  const digests = splitIntoTurns(olderMessages)
    .map((turnMessages) => buildTurnDigest(turnMessages))
    .filter((digest): digest is TurnDigest => Boolean(digest));
  const turnDigestBuildMs = performance.now() - digestStartedAt;

  const summaryStartedAt = performance.now();
  const summaryText = mergeDigestsIntoSummary({
    digests,
  });
  const sessionSummaryMergeMs = performance.now() - summaryStartedAt;

  if (!summaryText) {
    return {
      mode: "raw",
      messages: [...input.messages],
      diagnostics: {
        historySelectionMs: performance.now() - startedAt,
        turnDigestBuildMs,
        sessionSummaryMergeMs,
        recentTailUserTurns: maxRecentUserTurns,
        droppedMessageCount: 0,
      },
    };
  }

  return {
    mode: "summary_with_recent_tail",
    summaryText,
    messages: tailMessages,
    diagnostics: {
      historySelectionMs: performance.now() - startedAt,
      turnDigestBuildMs,
      sessionSummaryMergeMs,
      recentTailUserTurns: maxRecentUserTurns,
      droppedMessageCount: Math.max(0, input.messages.length - tailMessages.length),
    },
  };
}
