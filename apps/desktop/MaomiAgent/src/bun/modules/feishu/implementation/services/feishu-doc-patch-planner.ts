import type { FeishuDocIR, FeishuDocIRBlock } from "../../../../../shared/desktop-feishu-doc-ir";

export type FeishuDocPatchOperation =
  | { kind: "update_text"; blockId: string; text: string }
  | { kind: "update_block_attrs"; blockId: string; attrs: Record<string, unknown> }
  | { kind: "insert_block"; parentId: string; afterBlockId?: string; blockId: string }
  | { kind: "delete_block"; blockId: string }
  | { kind: "move_block"; blockId: string; parentId: string; index: number }
  | { kind: "update_asset_block"; blockId: string; token: string }
  | { kind: "blocked_change"; blockId: string; reason: string };

export type FeishuDocPatchPlan = {
  documentId: string;
  baseRevisionId: string;
  operations: FeishuDocPatchOperation[];
};

export function planFeishuDocPatch(base: FeishuDocIR, current: FeishuDocIR): FeishuDocPatchPlan {
  const operations: FeishuDocPatchOperation[] = [];
  const currentIds = new Set(Object.keys(current.blocks));
  const baseOrderedIds = documentOrderedBlockIds(base);
  const currentOrderedIds = documentOrderedBlockIds(current);

  for (const blockId of [...baseOrderedIds].reverse()) {
    if (!currentIds.has(blockId)) {
      operations.push({ kind: "delete_block", blockId });
    }
  }

  for (const blockId of currentOrderedIds) {
    const currentBlock = current.blocks[blockId];
    if (!currentBlock) {
      continue;
    }

    const baseBlock = base.blocks[blockId];
    if (!baseBlock) {
      operations.push(insertOperation(current, currentBlock));
      continue;
    }

    const moveOperation = movedOperation(base, current, baseBlock, currentBlock);
    if (moveOperation) {
      operations.push(moveOperation);
    }

    const baseToken = baseBlock.resource?.token ?? "";
    const currentToken = currentBlock.resource?.token ?? "";
    if (baseToken !== currentToken && currentToken) {
      operations.push({ kind: "update_asset_block", blockId, token: currentToken });
    }

    if (currentBlock.editable) {
      const baseText = blockText(baseBlock);
      const currentText = blockText(currentBlock);
      if (baseText !== currentText) {
        operations.push({ kind: "update_text", blockId, text: currentText });
      } else if (stableJson(baseBlock.text) !== stableJson(currentBlock.text)) {
        operations.push({ kind: "blocked_change", blockId, reason: "rich text run attributes changed" });
      }

      if (stableJson(baseBlock.attrs) !== stableJson(currentBlock.attrs)) {
        operations.push({ kind: "update_block_attrs", blockId, attrs: currentBlock.attrs });
      }
    } else if (stableJson(baseBlock.raw) !== stableJson(currentBlock.raw)) {
      operations.push({ kind: "blocked_change", blockId, reason: "non-editable raw payload changed" });
    }
  }

  return {
    documentId: current.document.id,
    baseRevisionId: base.document.revisionId,
    operations,
  };
}

function insertOperation(current: FeishuDocIR, block: FeishuDocIRBlock): FeishuDocPatchOperation {
  const parentId = block.parentId ?? current.document.rootBlockId;
  const siblings = current.blocks[parentId]?.children ?? [];
  const index = siblings.indexOf(block.id);
  const previousSibling = index > 0 ? siblings[index - 1] : undefined;
  return previousSibling
    ? { kind: "insert_block", parentId, afterBlockId: previousSibling, blockId: block.id }
    : { kind: "insert_block", parentId, blockId: block.id };
}

function movedOperation(
  base: FeishuDocIR,
  current: FeishuDocIR,
  baseBlock: FeishuDocIRBlock,
  currentBlock: FeishuDocIRBlock,
): FeishuDocPatchOperation | null {
  const currentParentId = currentBlock.parentId ?? current.document.rootBlockId;
  const baseParentId = baseBlock.parentId ?? base.document.rootBlockId;
  const currentIndex = current.blocks[currentParentId]?.children.indexOf(currentBlock.id) ?? -1;

  if (currentParentId !== baseParentId) {
    return { kind: "move_block", blockId: currentBlock.id, parentId: currentParentId, index: Math.max(currentIndex, 0) };
  }
  return null;
}

function documentOrderedBlockIds(ir: FeishuDocIR): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (blockId: string): void => {
    if (seen.has(blockId)) {
      return;
    }
    const block = ir.blocks[blockId];
    if (!block) {
      return;
    }
    seen.add(blockId);
    ordered.push(blockId);
    for (const childId of block.children) {
      visit(childId);
    }
  };

  visit(ir.document.rootBlockId);
  for (const blockId of Object.keys(ir.blocks)) {
    visit(blockId);
  }
  return ordered;
}

function blockText(block: FeishuDocIRBlock): string {
  return block.text.map((run) => run.text).join("");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}
