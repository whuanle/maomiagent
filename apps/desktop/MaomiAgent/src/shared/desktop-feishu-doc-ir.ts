export type FeishuDocIRBlockType =
  | "page" | "text" | "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6" | "heading7" | "heading8" | "heading9"
  | "bullet" | "ordered" | "code" | "quote" | "todo"
  | "callout" | "quote-container" | "grid" | "grid-column" | "table" | "table-cell" | "view"
  | "image" | "file" | "iframe" | "whiteboard" | "mindnote" | "diagram"
  | "sheet" | "bitable" | "board" | "chat-card" | "link-preview" | "jira-issue" | "add-ons" | "isv" | "okr"
  | "source-synced" | "reference-synced" | "ai-template" | "undefined";

export type FeishuDocIRTextRun = {
  kind: "text" | "mention_user" | "mention_doc" | "equation" | "reminder" | "inline_file" | "unknown";
  text: string;
  attrs: Record<string, unknown>;
  raw: unknown;
};

export type FeishuDocIRAsset = {
  token: string;
  kind: "image" | "file" | "whiteboard" | "mindnote" | "diagram" | "unknown";
  mime: string;
  cacheKey: string;
  status: "missing" | "cached" | "error";
  localPath: string;
  absolutePath?: string;
  checksum: string;
  width?: number;
  height?: number;
  name?: string;
  error?: string;
};

export type FeishuDocIRBlock = {
  id: string;
  type: FeishuDocIRBlockType;
  parentId: string | null;
  children: string[];
  editable: boolean;
  text: FeishuDocIRTextRun[];
  resource: { token: string; kind: FeishuDocIRAsset["kind"] } | null;
  attrs: Record<string, unknown>;
  raw: unknown;
};

export type FeishuDocIR = {
  schemaVersion: 1;
  document: {
    id: string;
    title: string;
    revisionId: string;
    rootBlockId: string;
    pulledAt: string;
    source: {
      nodeToken?: string;
      documentIdType: "document_id" | "wiki_node_token";
    };
  };
  blocks: Record<string, FeishuDocIRBlock>;
  assets: Record<string, FeishuDocIRAsset>;
  integrity: {
    contentHash: string;
    rawHash: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isFeishuDocIR(value: unknown): value is FeishuDocIR {
  if (!isRecord(value)) {
    return false;
  }
  if (value.schemaVersion !== 1) {
    return false;
  }
  return (
    isRecord(value.document)
    && isRecord(value.blocks)
    && isRecord(value.assets)
    && isRecord(value.integrity)
  );
}