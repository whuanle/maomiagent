import { describe, expect, test } from "bun:test";

import {
  buildCustomProtocolProviderType,
  isCustomProtocolProviderType,
  readChannelProtocolMetadata,
} from "./desktop-model-channel-protocol";

describe("desktop model channel protocol metadata", () => {
  test("reads protocol metadata from explicit source fields", () => {
    expect(readChannelProtocolMetadata({
      providerType: "custom-google-generate-content",
      metadata: {
        source: "protocol",
        providerBindingId: "google",
        protocolFamily: "google",
        apiStyle: "generate-content",
        discoveryKind: "manual",
        deploymentKind: "direct",
        runtimeSupport: {
          status: "implemented",
          adapterId: "google-generate-content",
        },
        headers: {
          "x-goog-api-key": " gemini-key ",
        },
      },
    })).toMatchObject({
      source: "protocol",
      providerBindingId: "google",
      protocolFamily: "google",
      apiStyle: "generate-content",
      providerType: "custom-google-generate-content",
      headers: {
        "x-goog-api-key": "gemini-key",
      },
    });
  });

  test("keeps provider binding identity separate from api style selection", () => {
    expect(readChannelProtocolMetadata({
      providerType: "openai",
      metadata: {
        source: "protocol",
        providerBindingId: " openai ",
        apiStyle: "chat-completions",
      },
    })).toMatchObject({
      source: "protocol",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      providerType: "openai",
    });
  });

  test("falls back to custom provider type when metadata.source is missing", () => {
    expect(isCustomProtocolProviderType("custom-openai-responses")).toBe(true);
    expect(isCustomProtocolProviderType("openai")).toBe(false);
    expect(buildCustomProtocolProviderType("anthropic", "messages")).toBe("custom-anthropic-messages");
    expect(readChannelProtocolMetadata({
      providerType: "custom-openai-responses",
      metadata: {},
    })).toMatchObject({
      source: "protocol",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "responses",
    });
  });

  test("normalizes legacy ollama metadata to openai chat completions compatibility", () => {
    expect(readChannelProtocolMetadata({
      providerType: "ollama",
      metadata: {
        source: "provider",
        protocolFamily: "ollama",
        apiStyle: "ollama-chat",
        discoveryKind: "ollama-tags",
        deploymentKind: "local-native",
        runtimeSupport: {
          status: "catalog-only",
          reason: "legacy",
        },
      },
    })).toMatchObject({
      source: "provider",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      discoveryKind: "ollama-tags",
      deploymentKind: "local-native",
      runtimeSupport: {
        status: "implemented",
        adapterId: "openai-chat-completions",
      },
    });

    expect(readChannelProtocolMetadata({
      providerType: "custom-ollama-chat",
      metadata: {
        source: "protocol",
        protocolFamily: "ollama",
        apiStyle: "ollama-chat",
      },
    })).toMatchObject({
      source: "protocol",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      runtimeSupport: {
        status: "implemented",
        adapterId: "openai-chat-completions",
      },
    });
  });
});
