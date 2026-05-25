import { describe, expect, test } from "bun:test";

import { resolveDesktopChannelModelMetadata } from "./desktop-model-metadata";
import type { DesktopModelChannelItem, DesktopModelProviderItem } from "./desktop-models";

describe("resolveDesktopChannelModelMetadata", () => {
  test("prefers custom channel metadata over provider catalog capability flags", () => {
    const providers: DesktopModelProviderItem[] = [{
      providerType: "xiaomi",
      displayName: "Xiaomi",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      models: [{
        providerType: "xiaomi",
        modelId: "mimo-v2.5-pro",
        displayName: "mimo-v2.5-pro",
        supportsFunctionCall: true,
        contextWindow: 1048576,
      }],
    }];
    const channel: DesktopModelChannelItem = {
      providerType: "xiaomi",
      channelId: "xiaomi",
      name: "xiaomi",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      models: [],
      metadata: {
        customModels: [{
          modelId: "mimo-v2.5-pro",
          displayName: "mimo-v2.5-pro",
          supportsFunctionCall: false,
          contextWindow: 65536,
        }],
      },
    };

    expect(resolveDesktopChannelModelMetadata(
      providers,
      channel,
      "mimo-v2.5-pro",
    )).toMatchObject({
      modelId: "mimo-v2.5-pro",
      supportsFunctionCall: false,
      contextWindow: 65536,
    });
  });
});
