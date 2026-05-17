import type { ConversationCheckpointEntry } from "#maomiagent/kernel/src/host/application";

import type { LanguageCode } from "../../../../config/titlebar";
import type { DirectSessionDisplayMessageGroup } from "./direct-session-message-list-grouping";

export type DirectSessionCheckpointRenderItem = {
  kind: "checkpoint";
  key: string;
  checkpoint: ConversationCheckpointEntry;
  label: string;
  detail?: string;
  title: string;
};

export type DirectSessionMessageRenderItem = {
  kind: "message";
  key: string;
  group: DirectSessionDisplayMessageGroup;
};

export type DirectSessionRenderItem = DirectSessionMessageRenderItem | DirectSessionCheckpointRenderItem;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalPositiveFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function readOptionalArrayLength(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? value.length : undefined;
}

function formatCheckpointDetail(checkpoint: ConversationCheckpointEntry, language: LanguageCode) {
  const isEn = language === "en-US";
  const metadata = isRecord(checkpoint.metadata) ? checkpoint.metadata : undefined;
  const prunedMessageCount = readOptionalArrayLength(metadata?.prunedMessageIds);
  const prunedTokens = readOptionalPositiveFiniteNumber(metadata?.prunedTokens);
  const reason = typeof metadata?.reason === "string" ? metadata.reason : undefined;

  const detailParts: string[] = [];
  if (prunedMessageCount) {
    detailParts.push(isEn ? `${prunedMessageCount} earlier messages folded` : `已折叠 ${prunedMessageCount} 条较早消息`);
  }
  if (prunedTokens) {
    detailParts.push(isEn ? `~${prunedTokens} tokens reclaimed` : `约回收 ${prunedTokens} tokens`);
  }
  if (detailParts.length === 0 && reason === "manual") {
    detailParts.push(isEn ? "Manual compression applied" : "已手动压缩");
  }

  return detailParts.length > 0 ? detailParts.join(" · ") : undefined;
}

function buildCheckpointRenderItem(checkpoint: ConversationCheckpointEntry, language: LanguageCode): DirectSessionCheckpointRenderItem {
  const isEn = language === "en-US";
  const label = isEn ? "Earlier context compressed" : "较早上下文已压缩";
  const detail = formatCheckpointDetail(checkpoint, language);

  return {
    kind: "checkpoint",
    key: `checkpoint:${checkpoint.checkpointId}`,
    checkpoint,
    label,
    ...(detail ? { detail } : {}),
    title: detail ? `${label} - ${detail}` : label,
  };
}

export function buildDirectSessionRenderItems(input: {
  groups: readonly DirectSessionDisplayMessageGroup[];
  checkpoints: readonly ConversationCheckpointEntry[];
  language: LanguageCode;
}) {
  const items: DirectSessionRenderItem[] = [];
  const checkpointsBySummaryMessageId = new Map<string, ConversationCheckpointEntry[]>();
  const appendedCheckpointIds = new Set<string>();

  for (const checkpoint of input.checkpoints) {
    const existing = checkpointsBySummaryMessageId.get(checkpoint.summaryMessageId);
    if (existing) {
      existing.push(checkpoint);
      continue;
    }

    checkpointsBySummaryMessageId.set(checkpoint.summaryMessageId, [checkpoint]);
  }

  for (const group of input.groups) {
    items.push({
      kind: "message",
      key: group.key,
      group,
    });

    const messageIds = Array.isArray(group.messageIds) && group.messageIds.length > 0
      ? group.messageIds
      : [group.message.messageId];

    for (const messageId of messageIds) {
      const checkpoints = checkpointsBySummaryMessageId.get(messageId);
      if (!checkpoints) {
        continue;
      }

      for (const checkpoint of checkpoints) {
        if (appendedCheckpointIds.has(checkpoint.checkpointId)) {
          continue;
        }

        appendedCheckpointIds.add(checkpoint.checkpointId);
        items.push(buildCheckpointRenderItem(checkpoint, input.language));
      }
    }
  }

  for (const checkpoint of input.checkpoints) {
    if (appendedCheckpointIds.has(checkpoint.checkpointId)) {
      continue;
    }

    items.unshift(buildCheckpointRenderItem(checkpoint, input.language));
  }

  return items;
}