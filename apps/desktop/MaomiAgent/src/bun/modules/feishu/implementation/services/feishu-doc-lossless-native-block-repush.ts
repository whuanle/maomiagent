import type { FeishuDocIR, FeishuDocIRBlock } from "../../../../../shared/desktop-feishu-doc-ir";
import { normalizeFeishuDocBlocksToIR, type FeishuRawDocBlock } from "./feishu-doc-ir-normalizer";
import { feishuDocIRToSourceMarkdown } from "./feishu-doc-source-markdown-codec";
import type { FeishuDocSourceSnapshot } from "./feishu-doc-source-workspace-cache";
import { buildFeishuDocCurrentIR } from "./feishu-doc-working-copy-compiler";

const LOSSLESS_NATIVE_BLOCK_TYPES = new Set<FeishuDocIRBlock["type"]>([
  "table",
  "table-cell",
  "bitable",
  "sheet",
]);

const LOSSLESS_NATIVE_BLOCK_TAG_PATTERN = /<(?:feishu-)?(?:table|table-cell|bitable|sheet)\b/i;
const TEXT_CONTAINER_KEYS = [
  "text",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "heading7",
  "heading8",
  "heading9",
  "bullet",
  "ordered",
  "todo",
  "quote",
  "code",
] as const;

export type FeishuDocLosslessNativeBlockRepushPlan =
  | {
      status: "blocked";
      message: string;
    }
  | {
      status: "ready";
      markdown: string;
      ir: FeishuDocIR;
      source: FeishuDocSourceSnapshot;
    };

export function shouldUseLosslessNativeBlockRepush(input: {
  draftMarkdown: string;
  baselineMarkdown?: string;
  baseIr?: FeishuDocIR | null;
}): boolean {
  if (LOSSLESS_NATIVE_BLOCK_TAG_PATTERN.test(input.draftMarkdown)) {
    return true;
  }

  if (input.baselineMarkdown && LOSSLESS_NATIVE_BLOCK_TAG_PATTERN.test(input.baselineMarkdown)) {
    return true;
  }

  return Object.values(input.baseIr?.blocks ?? {}).some((block) => LOSSLESS_NATIVE_BLOCK_TYPES.has(block.type));
}

export function buildLosslessNativeBlockRepushPlan(input: {
  docId: string;
  title: string;
  draftMarkdown: string;
  baseIr: FeishuDocIR | null;
  source: FeishuDocSourceSnapshot | null;
}): FeishuDocLosslessNativeBlockRepushPlan {
  if (!input.baseIr || !input.source?.blocks.length) {
    return {
      status: "blocked",
      message: "请先重新拉取远端文档基线。",
    };
  }

  if (!hasLosslessNativeBlocks(input.baseIr)) {
    return {
      status: "blocked",
      message: "当前文档不包含需要走无损重推的原生块。",
    };
  }

  const missingNativeBlockReason = ensurePreservedNativeBlocksRemainPresent({
    draftMarkdown: input.draftMarkdown,
    baseIr: input.baseIr,
  });
  if (missingNativeBlockReason) {
    return {
      status: "blocked",
      message: `当前改动超出无损重推范围：${missingNativeBlockReason}`,
    };
  }

  const compiled = buildFeishuDocCurrentIR({
    base: input.baseIr,
    draft: input.draftMarkdown,
  });
  const current = applyUnanchoredHeadingFallback({
    base: input.baseIr,
    current: compiled.current,
    draftMarkdown: input.draftMarkdown,
  });
  if (compiled.blockedChanges.length > 0) {
    return {
      status: "blocked",
      message: `当前改动超出无损重推范围：${compiled.blockedChanges[0]?.reason ?? "unsupported structure change"}`,
    };
  }

  const nextSourceBlocks = input.source.blocks.map((block) => rewriteRawTextBlock(block, current));
  const nextSource: FeishuDocSourceSnapshot = {
    ...input.source,
    fetchedAt: new Date().toISOString(),
    document: {
      ...input.source.document,
      title: input.title,
    },
    blocks: nextSourceBlocks,
  };

  const nextIr = normalizeFeishuDocBlocksToIR({
    documentId: input.source.resolvedDocId || input.docId,
    title: input.title,
    revisionId: String(input.source.document.revision_id ?? input.baseIr.document.revisionId ?? ""),
    pulledAt: new Date().toISOString(),
    documentIdType: input.source.documentIdType,
    ...(input.source.documentIdType === "wiki_node_token" ? { nodeToken: input.docId } : {}),
    blocks: nextSourceBlocks,
  });

  return {
    status: "ready",
    markdown: feishuDocIRToSourceMarkdown(nextIr),
    ir: nextIr,
    source: nextSource,
  };
}

function applyUnanchoredHeadingFallback(input: {
  base: FeishuDocIR;
  current: FeishuDocIR;
  draftMarkdown: string;
}): FeishuDocIR {
  if (input.draftMarkdown.includes("<!--feishu:block:")) {
    return input.current;
  }

  const headingMatch = /^#\s+(.+)$/m.exec(input.draftMarkdown);
  if (!headingMatch?.[1]?.trim()) {
    return input.current;
  }

  const firstHeadingId = input.base.blocks[input.base.document.rootBlockId]?.children
    .map((blockId) => input.base.blocks[blockId])
    .find((block) => block?.type === "heading1")?.id;
  if (!firstHeadingId || !input.current.blocks[firstHeadingId]) {
    return input.current;
  }

  const next = structuredClone(input.current);
  next.blocks[firstHeadingId] = {
    ...next.blocks[firstHeadingId]!,
    text: [{
      kind: "text",
      text: headingMatch[1].trim(),
      attrs: {},
      raw: {},
    }],
  };
  return next;
}

function hasLosslessNativeBlocks(baseIr: FeishuDocIR): boolean {
  return Object.values(baseIr.blocks).some((block) => LOSSLESS_NATIVE_BLOCK_TYPES.has(block.type));
}

function ensurePreservedNativeBlocksRemainPresent(input: {
  draftMarkdown: string;
  baseIr: FeishuDocIR;
}): string | null {
  for (const block of Object.values(input.baseIr.blocks)) {
    if (!LOSSLESS_NATIVE_BLOCK_TYPES.has(block.type)) {
      continue;
    }

    if (
      !input.draftMarkdown.includes(`blockId="${block.id}"`)
      && !input.draftMarkdown.includes(`block-id="${block.id}"`)
    ) {
      return `native block ${block.id} was removed from draft`;
    }
  }

  return null;
}

function rewriteRawTextBlock(block: FeishuRawDocBlock, current: FeishuDocIR): FeishuRawDocBlock {
  const blockId = typeof block.block_id === "string" ? block.block_id.trim() : "";
  const currentBlock = blockId ? current.blocks[blockId] : undefined;
  if (!currentBlock?.editable) {
    return structuredClone(block);
  }

  const nextBlock = structuredClone(block);
  const nextText = currentBlock.text.map((run) => run.text).join("");
  for (const key of TEXT_CONTAINER_KEYS) {
    const container = nextBlock[key];
    if (!container || typeof container !== "object") {
      continue;
    }

    (container as { content?: string; elements?: Array<{ text_run: { content: string } }> }).content = nextText;
    (container as { elements?: Array<{ text_run: { content: string } }> }).elements = [{
      text_run: {
        content: nextText,
      },
    }];
    return nextBlock;
  }

  return nextBlock;
}
