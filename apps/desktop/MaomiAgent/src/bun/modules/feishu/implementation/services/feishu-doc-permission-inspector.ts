import type {
  FeishuDocPermissionInspectView,
  FeishuDocPermissionProbeView,
} from "../../../../../shared/desktop-feishu";
import { classifyFeishuDocDiagnosticError } from "./feishu-doc-permission-diagnostics";

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";

function openApiUrl(path: string, params: Record<string, string | undefined> = {}): string {
  const url = new URL(`${FEISHU_OPEN_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value?.trim()) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function unknownProbe(message: string): FeishuDocPermissionProbeView {
  return {
    ok: false,
    category: "unknown",
    message,
  };
}

async function probe(getter: () => Promise<unknown>): Promise<FeishuDocPermissionProbeView> {
  try {
    await getter();
    return { ok: true, category: "unknown", message: "ok" };
  } catch (error) {
    const classified = classifyFeishuDocDiagnosticError(error);
    return {
      ok: false,
      category: classified.category,
      code: classified.code,
      message: classified.message,
    };
  }
}

export async function inspectFeishuDocPermissions(input: {
  client: { getJson<T>(url: string, accessToken: string): Promise<T> };
  accessToken: string;
  docId: string;
  resolvedDocId?: string;
  documentIdType?: "document_id" | "wiki_node_token";
  nodeToken?: string;
  whiteboardTokens: string[];
}): Promise<Pick<FeishuDocPermissionInspectView, "document" | "whiteboards">> {
  const requestedDocId = input.docId.trim();
  const resolvedDocId = input.resolvedDocId?.trim() || requestedDocId;
  const documentIdType = input.documentIdType === "wiki_node_token" ? "wiki_node_token" : "document_id";
  const wikiToken = input.nodeToken?.trim() || requestedDocId;
  const docxToken = documentIdType === "wiki_node_token"
    ? (input.nodeToken?.trim() || requestedDocId)
    : resolvedDocId;

  const [wiki, docx, whiteboards] = await Promise.all([
    wikiToken
      ? probe(() => input.client.getJson(
          openApiUrl("/wiki/v2/spaces/get_node", { token: wikiToken }),
          input.accessToken,
        ))
      : Promise.resolve(unknownProbe("Current document does not include a wiki node token")),
    probe(() => input.client.getJson(
      openApiUrl(`/docx/v1/documents/${encodeURIComponent(docxToken)}`, documentIdType === "wiki_node_token"
        ? { document_id_type: "wiki_node_token" }
        : {}),
      input.accessToken,
    )),
    Promise.all(input.whiteboardTokens.slice(0, 3).map(async (token) => ({
      token,
      probeResult: await probe(() => input.client.getJson(
        openApiUrl(`/board/v1/whiteboards/${encodeURIComponent(token)}/nodes`, { output_as: "code" }),
        input.accessToken,
      )),
    }))),
  ]);

  return {
    document: { wiki, docx },
    whiteboards,
  };
}
