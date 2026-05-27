import type { FeishuDocIR, FeishuDocIRBlock } from "../../../../../shared/desktop-feishu-doc-ir";

export type FeishuDocWorkingCopyBlockedChange = {
  blockId: string;
  reason: string;
};

export type FeishuDocWorkingCopyResult = {
  current: FeishuDocIR;
  blockedChanges: FeishuDocWorkingCopyBlockedChange[];
  preservedUnknownBlocks: string[];
};

const EDITABLE_BLOCK_PATTERN = /<!--feishu:block:([^>]+)-->([\s\S]*?)<!--\/feishu:block:\1-->/g;

export function buildFeishuDocCurrentIR(input: { base: FeishuDocIR; draft: string }): FeishuDocWorkingCopyResult {
  const current = structuredClone(input.base);
  const blockedChanges: FeishuDocWorkingCopyBlockedChange[] = [];
  const preservedUnknownBlocks = Object.values(input.base.blocks)
    .filter((block) => block.type === "undefined")
    .map((block) => block.id);

  for (const [blockId, rawBody] of extractAnchoredEditableBodies(input.draft)) {
    const block = current.blocks[blockId];
    if (!block || !block.editable) {
      continue;
    }

    const normalized = normalizeEditableBody(block.type, rawBody);
    block.text = [{ kind: "text", text: normalized, attrs: {}, raw: {} }];
  }

  for (const blockId of preservedUnknownBlocks) {
    if (!input.draft.includes(`blockId="${blockId}"`) && !input.draft.includes(`block-id="${blockId}"`)) {
      blockedChanges.push({ blockId, reason: "unsupported or unknown block removed from draft" });
    }
  }

  return {
    current,
    blockedChanges,
    preservedUnknownBlocks,
  };
}

function extractAnchoredEditableBodies(draft: string): Array<[string, string]> {
  const matches: Array<[string, string]> = [];
  for (const match of draft.matchAll(EDITABLE_BLOCK_PATTERN)) {
    const blockId = match[1]?.trim();
    if (!blockId) {
      continue;
    }
    matches.push([blockId, (match[2] ?? "").trim()]);
  }
  return matches;
}

function normalizeEditableBody(type: FeishuDocIRBlock["type"], rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return "";
  }

  if (type.startsWith("heading")) {
    return trimmed.replace(/^#{1,9}\s+/, "").trim();
  }

  switch (type) {
    case "bullet":
      return trimmed.replace(/^-\s+/, "").trim();
    case "ordered":
      return trimmed.replace(/^\d+\.\s+/, "").trim();
    case "quote":
      return trimmed
        .split(/\r?\n/)
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
    case "todo":
      return trimmed.replace(/^-\s+\[[ xX]?\]\s+/, "").trim();
    case "code": {
      const fenced = /^```[^\n]*\n([\s\S]*?)\n```$/m.exec(trimmed);
      return fenced ? fenced[1] ?? "" : trimmed;
    }
    default:
      return trimmed;
  }
}