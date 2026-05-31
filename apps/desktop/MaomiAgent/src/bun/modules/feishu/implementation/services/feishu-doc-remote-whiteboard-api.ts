import { randomUUID } from "node:crypto";

import {
  DesktopFeishuOpenApiClient,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";

type FeishuDocRemoteWhiteboardApiDeps = {
  client: DesktopFeishuOpenApiClient;
  baseUrl: string;
  accessToken: (input?: { forceRefresh?: boolean }) => Promise<string>;
};

type WhiteboardCodeResponse = {
  format?: string;
  output_format?: string;
  source?: string;
  code?: string;
  content?: string;
};

type WhiteboardRawNodesResponse = {
  nodes?: unknown[];
  items?: unknown[];
};

type WhiteboardUpdateResponse = {
  result?: string;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class FeishuDocRemoteWhiteboardApi {
  constructor(private readonly deps: FeishuDocRemoteWhiteboardApiDeps) {}

  async queryWhiteboardCode(input: {
    whiteboardToken: string;
  }): Promise<{ format: string; source: string } | null> {
    const url = new URL(
      `${this.deps.baseUrl}/board/v1/whiteboards/${encodeURIComponent(input.whiteboardToken)}/nodes`,
    );
    url.searchParams.set("output_as", "code");

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.getJson<WhiteboardCodeResponse>(
      url.toString(),
      accessToken,
    ));
    const source = trimText(response.source) || trimText(response.code) || trimText(response.content);
    if (!source) {
      return null;
    }

    return {
      format: trimText(response.format) || trimText(response.output_format) || "unknown",
      source,
    };
  }

  async queryWhiteboardRawNodes(input: {
    whiteboardToken: string;
  }): Promise<unknown[]> {
    const url = new URL(
      `${this.deps.baseUrl}/board/v1/whiteboards/${encodeURIComponent(input.whiteboardToken)}/nodes`,
    );
    url.searchParams.set("output_as", "raw");

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.getJson<WhiteboardRawNodesResponse>(
      url.toString(),
      accessToken,
    ));

    if (Array.isArray(response.nodes)) {
      return response.nodes;
    }
    if (Array.isArray(response.items)) {
      return response.items;
    }
    return [];
  }

  async updateWhiteboard(input: {
    whiteboardToken: string;
    inputFormat: "mermaid";
    source: string;
    overwrite: boolean;
  }): Promise<{ result: string }> {
    const url = new URL(
      `${this.deps.baseUrl}/board/v1/whiteboards/${encodeURIComponent(input.whiteboardToken)}/nodes`,
    );
    url.searchParams.set("idempotent_token", randomUUID());

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.postAuthorizedJson<WhiteboardUpdateResponse>(
      url.toString(),
      accessToken,
      {
        input_format: input.inputFormat,
        source: input.source,
        overwrite: input.overwrite,
      },
    ));

    return {
      result: trimText(response.result) || "success",
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
