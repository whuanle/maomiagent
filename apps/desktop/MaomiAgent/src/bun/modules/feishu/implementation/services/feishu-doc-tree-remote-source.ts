import type {
  FeishuDocContentView,
  FeishuDocTreeNode,
  FeishuDocTreeObjectType,
} from "../../../../../shared/desktop-feishu";

export type FeishuOpenApiReader = {
  getJson<T>(url: string, accessToken: string): Promise<T>;
};

export type FeishuDocTreeRecognizedRoot = {
  token: string;
  kind: "wiki_node" | "document";
  rootNodeId: string;
  title: string;
  spaceId?: string;
  docId?: string;
};

export type FeishuDocTreeRemoteChildren = {
  nodes: FeishuDocTreeNode[];
  hasMore: boolean;
  pageToken?: string;
};

type FeishuWikiNodePayload = {
  token?: string;
  node_token?: string;
  obj_token?: string;
  obj_type?: string;
  title?: string;
  has_child?: boolean;
  space_id?: string;
};

type FeishuWikiGetNodeResponse = {
  node?: FeishuWikiNodePayload;
};

type FeishuWikiListNodesResponse = {
  items?: FeishuWikiNodePayload[];
  has_more?: boolean;
  page_token?: string;
};

type FeishuDocumentResponse = {
  document?: {
    document_id?: string;
    title?: string;
  };
};

type FeishuDocumentBlockPayload = {
  block_id?: string;
  block_type?: number;
  text?: {
    content?: string;
    elements?: unknown[];
  };
  heading1?: { elements?: unknown[]; content?: string };
  heading2?: { elements?: unknown[]; content?: string };
  heading3?: { elements?: unknown[]; content?: string };
  heading4?: { elements?: unknown[]; content?: string };
  heading5?: { elements?: unknown[]; content?: string };
  heading6?: { elements?: unknown[]; content?: string };
  bullet?: { elements?: unknown[]; content?: string };
  ordered?: { elements?: unknown[]; content?: string };
  todo?: { elements?: unknown[]; content?: string };
  quote?: { elements?: unknown[]; content?: string };
};

type FeishuDocumentBlocksResponse = {
  items?: FeishuDocumentBlockPayload[];
};

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";
const FEISHU_DOC_TREE_OBJECT_TYPES = new Set<FeishuDocTreeObjectType>([
  "doc",
  "docx",
  "sheet",
  "mindnote",
  "bitable",
  "file",
  "slides",
]);

function openApiUrl(path: string, params: Record<string, string | number | boolean | undefined | null> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = search.toString();
  return `${FEISHU_OPEN_API_BASE_URL}${normalizedPath}${query ? `?${query}` : ""}`;
}

function normalizeObjType(value: unknown): FeishuDocTreeObjectType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return FEISHU_DOC_TREE_OBJECT_TYPES.has(value as FeishuDocTreeObjectType)
    ? (value as FeishuDocTreeObjectType)
    : undefined;
}

function valueOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function shouldFallbackToDocument(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("230027") ||
    message.includes("not found") ||
    message.includes("not_found") ||
    message.includes("bad request") ||
    message.includes("field validation") ||
    message.includes("wrong kind") ||
    message.includes("wrong-kind")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstStringField(record: Record<string, unknown>, fields: readonly string[]): string {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function extractInlineTextFromElement(element: unknown): string {
  if (!isRecord(element)) {
    return "";
  }

  const direct = firstStringField(element, ["content", "text", "title", "name"]);
  if (direct) {
    return direct;
  }

  const knownElementFields = [
    "text_run",
    "mention_user",
    "mention_doc",
    "reminder",
    "equation",
    "file",
    "jira_issue",
    "wiki_catalog",
  ];

  for (const field of knownElementFields) {
    const value = element[field];
    if (!isRecord(value)) {
      continue;
    }

    const nested = firstStringField(value, ["content", "text", "title", "name", "file_name", "url"]);
    if (nested) {
      return nested;
    }
  }

  return "";
}

function extractTextContainerText(container: unknown): string {
  if (!isRecord(container)) {
    return "";
  }

  const direct = firstStringField(container, ["content", "text"]);
  if (direct) {
    return direct;
  }

  const elements = Array.isArray(container.elements) ? container.elements : [];
  return elements
    .map(extractInlineTextFromElement)
    .filter((content) => content.length > 0)
    .join("");
}

function blockTextContainer(block: FeishuDocumentBlockPayload): { key: string; text: string } {
  const candidateKeys = [
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "heading5",
    "heading6",
    "text",
    "bullet",
    "ordered",
    "todo",
    "quote",
  ] as const;

  for (const key of candidateKeys) {
    const text = extractTextContainerText(block[key]);
    if (text.trim().length > 0) {
      return { key, text: text.trim() };
    }
  }

  return { key: "text", text: "" };
}

function formatBlockMarkdown(block: FeishuDocumentBlockPayload): string {
  const { key, text } = blockTextContainer(block);
  if (!text) {
    return "";
  }

  const headingLevelByKey: Record<string, number> = {
    heading1: 1,
    heading2: 2,
    heading3: 3,
    heading4: 4,
    heading5: 5,
    heading6: 6,
  };
  const headingLevel = headingLevelByKey[key];
  if (headingLevel) {
    return `${"#".repeat(headingLevel)} ${text}`;
  }

  if (key === "bullet") {
    return `- ${text}`;
  }
  if (key === "ordered") {
    return `1. ${text}`;
  }
  if (key === "todo") {
    return `- [ ] ${text}`;
  }
  if (key === "quote") {
    return text.split("\n").map((line) => `> ${line}`).join("\n");
  }

  return text;
}

export class FeishuDocTreeRemoteSource {
  constructor(private readonly reader: FeishuOpenApiReader) {}

  async readDocumentContent(accessToken: string, docId: string): Promise<FeishuDocContentView> {
    try {
      return await this.readDocxDocumentContent(accessToken, docId, "document_id");
    } catch (error) {
      if (!shouldFallbackToDocument(error)) {
        throw error;
      }

      return this.readDocxDocumentContent(accessToken, docId, "wiki_node_token");
    }
  }

  private async readDocxDocumentContent(
    accessToken: string,
    docId: string,
    documentIdType: "document_id" | "wiki_node_token",
  ): Promise<FeishuDocContentView> {
    const documentQuery = documentIdType === "wiki_node_token"
      ? { document_id_type: documentIdType }
      : {};
    const [documentResponse, blocksResponse] = await Promise.all([
      this.reader.getJson<FeishuDocumentResponse>(
        openApiUrl(`/docx/v1/documents/${encodeURIComponent(docId)}`, documentQuery),
        accessToken,
      ),
      this.reader.getJson<FeishuDocumentBlocksResponse>(
        openApiUrl(`/docx/v1/documents/${encodeURIComponent(docId)}/blocks`, {
          page_size: 500,
          ...documentQuery,
        }),
        accessToken,
      ),
    ]);

    const document = documentResponse.document ?? {};
    const resolvedDocId = valueOrFallback(document.document_id, docId);
    const title = valueOrFallback(document.title, resolvedDocId);
    const blocks = blocksResponse.items ?? [];
    const markdown = blocks
      .map(formatBlockMarkdown)
      .filter((content) => content.length > 0)
      .join("\n\n");

    return {
      docId: resolvedDocId,
      title,
      markdown,
      length: markdown.length,
      totalLength: markdown.length,
      offset: 0,
      updatedAt: new Date().toISOString(),
      blocks,
      analysis: {
        riskyBlocks: [],
        riskySync: false,
        syncMode: null,
        riskyBlockMode: "safe",
      },
    } as FeishuDocContentView;
  }

  async recognizeRoot(accessToken: string, token: string): Promise<FeishuDocTreeRecognizedRoot> {
    try {
      const response = await this.reader.getJson<FeishuWikiGetNodeResponse>(
        openApiUrl("/wiki/v2/spaces/get_node", { token }),
        accessToken,
      );
      const node = response.node ?? {};
      const rootNodeId = valueOrFallback(node.token ?? node.node_token, token);
      const root: FeishuDocTreeRecognizedRoot = {
        token: rootNodeId,
        kind: "wiki_node",
        rootNodeId,
        title: valueOrFallback(node.title, token),
      };

      if (node.space_id) {
        root.spaceId = node.space_id;
      }
      if (node.obj_token) {
        root.docId = node.obj_token;
      }

      return root;
    } catch (wikiError) {
      if (!shouldFallbackToDocument(wikiError)) {
        throw wikiError;
      }

      const response = await this.reader.getJson<FeishuDocumentResponse>(
        openApiUrl(`/docx/v1/documents/${encodeURIComponent(token)}`),
        accessToken,
      );
      const document = response.document ?? {};
      const docId = valueOrFallback(document.document_id, token);
      return {
        token,
        kind: "document",
        rootNodeId: token,
        title: valueOrFallback(document.title, token),
        docId,
      };
    }
  }

  async listChildren(
    accessToken: string,
    root: FeishuDocTreeRecognizedRoot,
    pageToken?: string,
  ): Promise<FeishuDocTreeRemoteChildren> {
    if (root.kind === "document" || !root.spaceId) {
      return { nodes: [], hasMore: false };
    }

    const response = await this.reader.getJson<FeishuWikiListNodesResponse>(
      openApiUrl(`/wiki/v2/spaces/${encodeURIComponent(root.spaceId)}/nodes`, {
        parent_node_token: root.rootNodeId,
        page_token: pageToken,
        page_size: 50,
      }),
      accessToken,
    );

    const nodes = (response.items ?? [])
      .map((item) => this.toTreeNode(item, root.rootNodeId))
      .filter((node) => node.token.length > 0);
    const children: FeishuDocTreeRemoteChildren = {
      nodes,
      hasMore: response.has_more === true,
    };

    if (response.page_token) {
      children.pageToken = response.page_token;
    }

    return children;
  }

  private toTreeNode(item: FeishuWikiNodePayload, parentToken: string): FeishuDocTreeNode {
    const token = valueOrFallback(item.node_token ?? item.token ?? item.obj_token, "");
    const node: FeishuDocTreeNode = {
      id: token,
      token,
      kind: "wiki_node",
      title: valueOrFallback(item.title, token),
      hasChild: item.has_child === true,
      parentToken,
    };

    if (item.obj_token) {
      node.docId = item.obj_token;
    }
    const objType = normalizeObjType(item.obj_type);
    if (objType) {
      node.objType = objType;
    }

    return node;
  }
}