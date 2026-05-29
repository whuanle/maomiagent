import { randomUUID } from "node:crypto";

import {
  DesktopFeishuOpenApiClient,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";

type FeishuDocRemotePatchApiDeps = {
  client: DesktopFeishuOpenApiClient;
  baseUrl: string;
  accessToken: (input?: { forceRefresh?: boolean }) => Promise<string>;
};

type TextElement = {
  text_run: {
    content: string;
  };
};

export class FeishuDocRemotePatchApi {
  constructor(private readonly deps: FeishuDocRemotePatchApiDeps) {}

  async updateText(input: {
    documentId: string;
    revisionId: string;
    blockId: string;
    text: string;
  }): Promise<void> {
    const url = new URL(
      `${this.deps.baseUrl}/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.blockId)}`,
    );
    if (input.revisionId.trim()) {
      url.searchParams.set("document_revision_id", input.revisionId);
    }
    url.searchParams.set("client_token", randomUUID());

    const body = {
      update_text_elements: {
        elements: this.createTextElements(input.text),
      },
    };

    const request = async (forceRefresh = false) => {
      await this.deps.client.patchAuthorizedJson(
        url.toString(),
        await this.deps.accessToken({ forceRefresh }),
        body,
      );
    };

    try {
      await request(false);
    } catch (error) {
      if (!isDesktopFeishuAccessTokenExpiredError(error)) {
        throw error;
      }
      await request(true);
    }
  }

  private createTextElements(text: string): TextElement[] {
    return [{
      text_run: {
        content: text,
      },
    }];
  }
}
