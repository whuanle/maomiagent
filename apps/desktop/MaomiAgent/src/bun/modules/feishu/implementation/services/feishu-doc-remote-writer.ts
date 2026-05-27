import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";

type CreateDocumentResponse = {
  document?: {
    document_id?: string;
    title?: string;
  };
};

export class FeishuDocRemoteWriter {
  constructor(private readonly deps: { client: DesktopFeishuOpenApiClient; baseUrl: string }) {}

  async createDocument(input: { accessToken: string; title: string }): Promise<{ documentId: string; title: string }> {
    const response = await this.deps.client.postAuthorizedJson<CreateDocumentResponse>(
      `${this.deps.baseUrl}/docx/v1/documents`,
      input.accessToken,
      { title: input.title },
    );

    const documentId = response.document?.document_id?.trim();
    if (!documentId) {
      throw new Error("Feishu API response missing document id");
    }

    return {
      documentId,
      title: response.document?.title?.trim() || input.title,
    };
  }
}