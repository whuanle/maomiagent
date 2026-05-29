import { randomUUID } from "node:crypto";

import type { FeishuRawDocBlock } from "./feishu-doc-ir-normalizer";
import {
  DesktopFeishuOpenApiClient,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";

type FeishuDocRemoteMarkdownApiDeps = {
  client: DesktopFeishuOpenApiClient;
  baseUrl: string;
  accessToken: (input?: { forceRefresh?: boolean }) => Promise<string>;
};

type ConvertMarkdownResponse = {
  first_level_block_ids?: string[];
  blocks?: FeishuRawDocBlock[];
};

type DeleteChildrenResponse = {
  document_revision_id?: number | string;
};

type CreateDescendantsResponse = {
  document_revision_id?: number | string;
};

type DocsAiBlockSummary = {
  block_id?: string;
  block_type?: string | number;
  block_token?: string;
};

type DocsAiOverwriteResponse = {
  document?: {
    revision_id?: number | string;
    new_blocks?: DocsAiBlockSummary[];
  };
  result?: string;
  updated_blocks_count?: number;
  warnings?: string[];
};

function normalizeDocsAiRevisionId(value: string | number | undefined): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return -1;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

export class FeishuDocRemoteMarkdownApi {
  constructor(private readonly deps: FeishuDocRemoteMarkdownApiDeps) {}

  async convertMarkdown(input: { markdown: string }): Promise<{ firstLevelBlockIds: string[]; blocks: FeishuRawDocBlock[] }> {
    const response = await this.requestWithRefresh((accessToken) => this.deps.client.postAuthorizedJson<ConvertMarkdownResponse>(
      `${this.deps.baseUrl}/docx/v1/documents/blocks/convert`,
      accessToken,
      {
        content_type: "markdown",
        content: input.markdown,
      },
    ));

    return {
      firstLevelBlockIds: Array.isArray(response.first_level_block_ids)
        ? response.first_level_block_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      blocks: Array.isArray(response.blocks)
        ? response.blocks.filter((value): value is FeishuRawDocBlock => !!value && typeof value === "object")
        : [],
    };
  }

  async deleteChildren(input: {
    documentId: string;
    blockId: string;
    revisionId?: string;
    startIndex: number;
    endIndex: number;
  }): Promise<{ revisionId?: string }> {
    const url = new URL(
      `${this.deps.baseUrl}/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.blockId)}/children/batch_delete`,
    );
    url.searchParams.set("document_revision_id", input.revisionId?.trim() || "-1");
    url.searchParams.set("client_token", randomUUID());

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.deleteAuthorizedJson<DeleteChildrenResponse>(
      url.toString(),
      accessToken,
      {
        start_index: input.startIndex,
        end_index: input.endIndex,
      },
    ));

    return {
      ...(response.document_revision_id != null ? { revisionId: String(response.document_revision_id) } : {}),
    };
  }

  async createDescendants(input: {
    documentId: string;
    blockId: string;
    revisionId?: string;
    childrenId: string[];
    descendants: FeishuRawDocBlock[];
  }): Promise<{ revisionId?: string }> {
    const url = new URL(
      `${this.deps.baseUrl}/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.blockId)}/descendant`,
    );
    url.searchParams.set("document_revision_id", input.revisionId?.trim() || "-1");
    url.searchParams.set("client_token", randomUUID());

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.postAuthorizedJson<CreateDescendantsResponse>(
      url.toString(),
      accessToken,
      {
        children_id: input.childrenId,
        descendants: input.descendants,
      },
    ));

    return {
      ...(response.document_revision_id != null ? { revisionId: String(response.document_revision_id) } : {}),
    };
  }

  async overwriteDocumentV2(input: {
    documentToken: string;
    content: string;
    format: "markdown" | "xml";
    revisionId?: string | number;
  }): Promise<{
    revisionId?: string;
    result?: string;
    warnings: string[];
    newBlocks: Array<{
      blockId: string;
      blockType?: string;
      blockToken?: string;
    }>;
  }> {
    const response = await this.requestWithRefresh((accessToken) => this.deps.client.putAuthorizedJson<DocsAiOverwriteResponse>(
      `${this.deps.baseUrl}/docs_ai/v1/documents/${encodeURIComponent(input.documentToken)}`,
      accessToken,
      {
        command: "overwrite",
        content: input.content,
        format: input.format,
        revision_id: normalizeDocsAiRevisionId(input.revisionId),
      },
    ));

    return {
      ...(response.document?.revision_id != null ? { revisionId: String(response.document.revision_id) } : {}),
      ...(typeof response.result === "string" && response.result.trim() ? { result: response.result.trim() } : {}),
      warnings: Array.isArray(response.warnings)
        ? response.warnings.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      newBlocks: Array.isArray(response.document?.new_blocks)
        ? response.document.new_blocks
          .map((item) => ({
            blockId: typeof item?.block_id === "string" ? item.block_id.trim() : "",
            ...(item?.block_type != null ? { blockType: String(item.block_type) } : {}),
            ...(typeof item?.block_token === "string" && item.block_token.trim() ? { blockToken: item.block_token.trim() } : {}),
          }))
          .filter((item) => item.blockId.length > 0)
        : [],
    };
  }

  private async requestWithRefresh<T>(request: (accessToken: string) => Promise<T>): Promise<T> {
    const run = async (forceRefresh: boolean) => request(await this.deps.accessToken({ forceRefresh }));

    try {
      return await run(false);
    } catch (error) {
      if (!isDesktopFeishuAccessTokenExpiredError(error)) {
        throw error;
      }
      return run(true);
    }
  }
}
