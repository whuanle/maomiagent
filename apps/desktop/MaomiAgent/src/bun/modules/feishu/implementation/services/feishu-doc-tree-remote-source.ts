import type { FeishuDocTreeNode, FeishuDocTreeObjectType } from "../../../../../shared/desktop-feishu";

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

export class FeishuDocTreeRemoteSource {
  constructor(private readonly reader: FeishuOpenApiReader) {}

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
    } catch {
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

    const nodes = (response.items ?? []).map((item) => this.toTreeNode(item, root.rootNodeId));
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