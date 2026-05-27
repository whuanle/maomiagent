import { createHash } from "node:crypto";

import type {
  FeishuDocIR,
  FeishuDocIRAsset,
  FeishuDocIRBlock,
  FeishuDocIRBlockType,
  FeishuDocIRTextRun,
} from "../../../../../shared/desktop-feishu-doc-ir";

export type FeishuRawDocBlock = Record<string, unknown> & {
  block_id?: string;
  parent_id?: string;
  block_type?: number;
  children?: string[];
};

const BLOCK_TYPE_BY_NUMBER: Record<number, FeishuDocIRBlockType> = {
  1: "page",
  2: "text",
  3: "heading1",
  4: "heading2",
  5: "heading3",
  6: "heading4",
  7: "heading5",
  8: "heading6",
  9: "heading7",
  10: "heading8",
  11: "heading9",
  12: "bullet",
  13: "ordered",
  14: "code",
  15: "quote",
  16: "divider",
  17: "todo",
  19: "callout",
  27: "image",
  28: "file",
  31: "table",
  32: "table-cell",
  34: "bitable",
  35: "sheet",
  36: "mindnote",
  37: "whiteboard",
};

const BLOCK_TYPE_BY_PAYLOAD_KEY: Array<[string, FeishuDocIRBlockType]> = [
  ["page", "page"],
  ["text", "text"],
  ["heading1", "heading1"],
  ["heading2", "heading2"],
  ["heading3", "heading3"],
  ["heading4", "heading4"],
  ["heading5", "heading5"],
  ["heading6", "heading6"],
  ["heading7", "heading7"],
  ["heading8", "heading8"],
  ["heading9", "heading9"],
  ["bullet", "bullet"],
  ["ordered", "ordered"],
  ["code", "code"],
  ["quote", "quote"],
  ["divider", "divider"],
  ["todo", "todo"],
  ["callout", "callout"],
  ["quote_container", "quote-container"],
  ["quoteContainer", "quote-container"],
  ["grid", "grid"],
  ["grid_column", "grid-column"],
  ["gridColumn", "grid-column"],
  ["table", "table"],
  ["table_cell", "table-cell"],
  ["tableCell", "table-cell"],
  ["view", "view"],
  ["image", "image"],
  ["file", "file"],
  ["iframe", "iframe"],
  ["whiteboard", "whiteboard"],
  ["mindnote", "mindnote"],
  ["diagram", "diagram"],
  ["sheet", "sheet"],
  ["bitable", "bitable"],
  ["board", "board"],
  ["chat_card", "chat-card"],
  ["chatCard", "chat-card"],
  ["link_preview", "link-preview"],
  ["linkPreview", "link-preview"],
  ["jira_issue", "jira-issue"],
  ["jiraIssue", "jira-issue"],
  ["add_ons", "add-ons"],
  ["addOns", "add-ons"],
  ["isv", "isv"],
  ["okr", "okr"],
  ["source_synced", "source-synced"],
  ["sourceSynced", "source-synced"],
  ["reference_synced", "reference-synced"],
  ["referenceSynced", "reference-synced"],
  ["ai_template", "ai-template"],
  ["aiTemplate", "ai-template"],
];

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

export function normalizeFeishuDocBlocksToIR(input: {
  documentId: string;
  title: string;
  revisionId: string;
  pulledAt: string;
  documentIdType: "document_id" | "wiki_node_token";
  nodeToken?: string;
  blocks: FeishuRawDocBlock[];
}): FeishuDocIR {
  const blocks: Record<string, FeishuDocIRBlock> = {};
  const assets: Record<string, FeishuDocIRAsset> = {};
  const rootBlockId = resolveRootBlockId(input.blocks, input.documentId);

  for (const [index, rawBlock] of input.blocks.entries()) {
    const id = rawBlock.block_id || `block_${index + 1}`;
    const type = resolveBlockType(rawBlock);
    const resource = extractResource(rawBlock, type);
    const attrs = extractAttrs(rawBlock, type);

    if (resource) {
      assets[resource.token] = {
        token: resource.token,
        kind: resource.kind,
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        width: typeof attrs.width === "number" ? attrs.width : undefined,
        height: typeof attrs.height === "number" ? attrs.height : undefined,
        name: typeof attrs.name === "string" ? attrs.name : undefined,
      };
    }

    blocks[id] = {
      id,
      type,
      parentId: rawBlock.parent_id || null,
      children: Array.isArray(rawBlock.children) ? rawBlock.children.filter((child): child is string => typeof child === "string") : [],
      editable: type !== "page" && type !== "undefined",
      text: extractTextRuns(rawBlock),
      resource,
      attrs,
      raw: rawBlock,
    };
  }

  return {
    schemaVersion: 1,
    document: {
      id: input.documentId,
      title: input.title,
      revisionId: input.revisionId,
      rootBlockId,
      pulledAt: input.pulledAt,
      source: {
        nodeToken: input.nodeToken,
        documentIdType: input.documentIdType,
      },
    },
    blocks,
    assets,
    integrity: {
      contentHash: hashJson(blocks),
      rawHash: hashJson(input.blocks),
    },
  };
}

function resolveBlockType(block: FeishuRawDocBlock): FeishuDocIRBlockType {
  if (typeof block.block_type === "number") {
    return BLOCK_TYPE_BY_NUMBER[block.block_type] || inferBlockTypeFromPayload(block);
  }

  return inferBlockTypeFromPayload(block);
}

function inferBlockTypeFromPayload(block: FeishuRawDocBlock): FeishuDocIRBlockType {
  for (const [key, type] of BLOCK_TYPE_BY_PAYLOAD_KEY) {
    if (block[key] !== undefined) {
      return type;
    }
  }

  return "undefined";
}

function resolveRootBlockId(blocks: FeishuRawDocBlock[], documentId: string): string {
  return blocks.find((block) => block.block_id === documentId)?.block_id
    || blocks.find((block) => block.block_type === 1)?.block_id
    || blocks[0]?.block_id
    || documentId;
}

function extractTextRuns(block: FeishuRawDocBlock): FeishuDocIRTextRun[] {
  const container = findTextContainer(block);
  if (!container) {
    return [];
  }

  const elements = Array.isArray(container.elements) ? container.elements : [];
  const runs = elements.flatMap(extractTextRunFromElement);
  const directContent = typeof container.content === "string" ? container.content : "";
  return runs.length > 0 || directContent.length === 0
    ? runs
    : [{ kind: "text", text: directContent, attrs: {}, raw: container }];
}

function findTextContainer(block: FeishuRawDocBlock): Record<string, unknown> | null {
  for (const key of TEXT_CONTAINER_KEYS) {
    const value = block[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}

function extractTextRunFromElement(element: unknown): FeishuDocIRTextRun[] {
  if (!isRecord(element)) {
    return [];
  }

  const textRun = element.text_run;
  if (isRecord(textRun) && typeof textRun.content === "string") {
    return [{ kind: "text", text: textRun.content, attrs: {}, raw: element }];
  }

  return [];
}

function extractResource(
  block: FeishuRawDocBlock,
  type: FeishuDocIRBlockType,
): { token: string; kind: FeishuDocIRAsset["kind"] } | null {
  if (type === "image") {
    return resourceFromContainer(block.image, "image");
  }
  if (type === "file") {
    return resourceFromContainer(block.file, "file");
  }
  if (type === "whiteboard") {
    return resourceFromContainer(block.whiteboard, "whiteboard");
  }
  if (type === "mindnote") {
    return resourceFromContainer(block.mindnote, "mindnote");
  }
  if (type === "diagram") {
    return resourceFromContainer(block.diagram, "diagram");
  }
  return null;
}

function resourceFromContainer(value: unknown, kind: FeishuDocIRAsset["kind"]): { token: string; kind: FeishuDocIRAsset["kind"] } | null {
  if (!isRecord(value) || typeof value.token !== "string" || value.token.length === 0) {
    return null;
  }
  return { token: value.token, kind };
}

function extractAttrs(block: FeishuRawDocBlock, type: FeishuDocIRBlockType): Record<string, unknown> {
  if (type === "callout") {
    const container = block.callout;
    if (!isRecord(container)) {
      return {};
    }

    const attrs: Record<string, unknown> = {};
    copyPrimitiveAttr(container, attrs, "emoji", "emoji");
    copyPrimitiveAttr(container, attrs, "emoji_id", "emoji");
    copyPrimitiveAttr(container, attrs, "emojiId", "emoji");
    copyPrimitiveAttr(container, attrs, "title", "title");
    copyPrimitiveAttr(container, attrs, "name", "name");
    copyPrimitiveAttr(container, attrs, "background_color", "background-color");
    copyPrimitiveAttr(container, attrs, "backgroundColor", "background-color");
    copyPrimitiveAttr(container, attrs, "border_color", "border-color");
    copyPrimitiveAttr(container, attrs, "borderColor", "border-color");
    return attrs;
  }

  const container = type === "image" ? block.image : type === "file" ? block.file : null;
  if (!isRecord(container)) {
    return {};
  }

  const attrs: Record<string, unknown> = {};
  for (const key of ["width", "height", "name", "file_name", "mime", "mime_type"]) {
    if (container[key] !== undefined) {
      attrs[key === "file_name" ? "name" : key === "mime_type" ? "mime" : key] = container[key];
    }
  }
  return attrs;
}

function copyPrimitiveAttr(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  sourceKey: string,
  targetKey: string,
) {
  const value = source[sourceKey];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    target[targetKey] = value;
  }
}

function hashJson(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}