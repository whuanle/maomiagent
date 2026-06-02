import { describe, expect, test } from "bun:test";

import {
  buildPresetProviderChannelMetadata,
  buildCustomChannelProtocolMetadata,
  CUSTOM_CHANNEL_PROTOCOL_PRESETS,
  getPresetProviderProtocolPresets,
  getCustomChannelProtocolPreset,
  resolveChannelProtocolLabelKey,
  resolveChannelEditorMode,
  resolveCustomChannelProtocolPresetId,
  resolvePresetProviderProtocolPresetId,
} from "./channel-protocol";
import type { DesktopModelProviderItem } from "../../../../shared/desktop-models";

describe("custom channel protocol presets", () => {
  test("exposes the supported custom protocol presets", () => {
    expect(CUSTOM_CHANNEL_PROTOCOL_PRESETS.map((item) => item.id)).toEqual([
      "openai-responses",
      "openai-chat-completions",
      "anthropic-messages",
      "google-generate-content",
    ]);
  });

  test("marks gemini as an implemented protocol", () => {
    expect(getCustomChannelProtocolPreset("google-generate-content")?.runtimeSupport).toEqual({
      status: "implemented",
      adapterId: "google-generate-content",
    });
    expect(getCustomChannelProtocolPreset("google-generate-content")?.sdkProviderPackage).toBe("@ai-sdk/google");
  });

  test("resolves edit mode and preset id from stored protocol metadata", () => {
    expect(resolveChannelEditorMode({
      providerType: "custom-google-generate-content",
      metadata: {
        source: "protocol",
        protocolFamily: "google",
        apiStyle: "generate-content",
      },
    })).toBe("protocol");
    expect(resolveCustomChannelProtocolPresetId("openai", "chat-completions")).toBe("openai-chat-completions");
  });

  test("exposes the full supported protocol format set for preset providers", () => {
    expect(getPresetProviderProtocolPresets({
      providerType: "openai",
      protocolFamily: "openai",
    }).map((item) => item.id)).toEqual([
      "openai-responses",
      "openai-chat-completions",
      "anthropic-messages",
      "google-generate-content",
    ]);

    expect(getPresetProviderProtocolPresets({
      providerType: "anthropic",
      protocolFamily: "anthropic",
    }).map((item) => item.id)).toEqual([
      "openai-responses",
      "openai-chat-completions",
      "anthropic-messages",
      "google-generate-content",
    ]);

    expect(getPresetProviderProtocolPresets({
      providerType: "ollama",
      protocolFamily: "ollama",
    }).some((item) => item.id.startsWith("ollama"))).toBe(false);
  });

  test("resolves preset provider protocol ids from channel metadata before provider defaults", () => {
    expect(resolvePresetProviderProtocolPresetId({
      providerType: "openai",
      protocolFamily: "openai",
      apiStyle: "responses",
    }, {
      providerType: "openai",
      metadata: {
        source: "provider",
        providerBindingId: "openai",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
      },
    })).toBe("openai-chat-completions");

    expect(resolvePresetProviderProtocolPresetId({
      providerType: "anthropic",
      protocolFamily: "anthropic",
      apiStyle: "messages",
    })).toBe("anthropic-messages");

    expect(resolvePresetProviderProtocolPresetId({
      providerType: "ollama",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
    }, {
      providerType: "ollama",
      metadata: {
        source: "provider",
        protocolFamily: "ollama",
        apiStyle: "ollama-chat",
      },
    })).toBe("openai-chat-completions");
  });

  test("builds protocol metadata and resolves label keys for custom channels", () => {
    const preset = getCustomChannelProtocolPreset("openai-chat-completions");
    expect(buildCustomChannelProtocolMetadata(preset, {
      apiKey: " secret-key ",
      organization: " maomi-team ",
    }, {
      Authorization: "Bearer override",
      "X-Maomi-Proxy": "edge",
    })).toEqual({
      source: "protocol",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      deploymentKind: "direct",
      discoveryKind: "openai-models",
      runtimeSupport: {
        status: "implemented",
        adapterId: "openai-chat-completions",
      },
      config: {
        apiKey: "secret-key",
        organization: "maomi-team",
      },
      headers: {
        Authorization: "Bearer override",
        "X-Maomi-Proxy": "edge",
      },
    });

    expect(resolveChannelProtocolLabelKey({
      providerType: "custom-openai-chat-completions",
      metadata: {
        source: "protocol",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
      },
    })).toBe("模型页.协议.OpenAIChatCompletions");
  });

  test("builds preset provider metadata with explicit binding fields and preserved env handling", () => {
    expect(buildPresetProviderChannelMetadata({
      channel: {
        providerType: "openai",
        channelId: "primary",
        name: "Primary",
        enabled: true,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        models: [],
        metadata: {
          env: {
            OPENAI_API_KEY: "old-key",
            MAOMI_REGION: "cn",
          },
        },
      },
      provider: {
        providerType: "openai",
        displayName: "OpenAI",
        protocolFamily: "openai",
        apiStyle: "responses",
        deploymentKind: "direct",
        discoveryKind: "openai-models",
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-responses",
        },
        configSchema: [{
          key: "apiKey",
          label: "API Key",
          type: "secret",
          envKey: "OPENAI_API_KEY",
        }, {
          key: "organization",
          label: "Organization",
          type: "text",
        }],
        models: [],
      },
      providerProtocolId: "openai-chat-completions",
      config: {
        apiKey: " secret-key ",
        organization: " maomi-team ",
      },
      configSchema: [{
        key: "apiKey",
        label: "API Key",
        type: "secret",
        envKey: "OPENAI_API_KEY",
      }, {
        key: "organization",
        label: "Organization",
        type: "text",
      }],
    })).toMatchObject({
      env: {
        OPENAI_API_KEY: "secret-key",
        MAOMI_REGION: "cn",
      },
      config: {
        apiKey: "secret-key",
        organization: "maomi-team",
      },
      source: "provider",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      deploymentKind: "direct",
      discoveryKind: "openai-models",
      runtimeSupport: {
        status: "implemented",
        adapterId: "openai-chat-completions",
      },
    });
  });

  test("uses selected preset protocol semantics instead of provider discovery defaults", () => {
    const baseProvider: DesktopModelProviderItem = {
      providerType: "openai",
      displayName: "OpenAI",
      protocolFamily: "openai",
      apiStyle: "responses",
      deploymentKind: "direct" as const,
      discoveryKind: "openai-models" as const,
      runtimeSupport: {
        status: "implemented" as const,
        adapterId: "openai-responses",
      },
      configSchema: [{
        key: "apiKey",
        label: "API Key",
        type: "secret" as const,
        envKey: "OPENAI_API_KEY",
      }],
      models: [],
    };

    expect(buildPresetProviderChannelMetadata({
      provider: baseProvider,
      providerProtocolId: "anthropic-messages",
      config: {
        apiKey: "anthropic-key",
      },
      configSchema: baseProvider.configSchema,
    })).toMatchObject({
      providerBindingId: "anthropic",
      protocolFamily: "anthropic",
      apiStyle: "messages",
      discoveryKind: "manual",
      deploymentKind: "direct",
      runtimeSupport: {
        status: "implemented",
        adapterId: "anthropic-messages",
      },
    });

    expect(buildPresetProviderChannelMetadata({
      provider: baseProvider,
      providerProtocolId: "google-generate-content",
      config: {
        apiKey: "google-key",
      },
      configSchema: baseProvider.configSchema,
    })).toMatchObject({
      providerBindingId: "google",
      protocolFamily: "google",
      apiStyle: "generate-content",
      discoveryKind: "manual",
      deploymentKind: "direct",
      runtimeSupport: {
        status: "implemented",
        adapterId: "google-generate-content",
      },
    });
  });
});
