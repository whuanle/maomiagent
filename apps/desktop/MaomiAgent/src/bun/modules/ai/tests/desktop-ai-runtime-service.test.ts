import { describe, expect, test } from "bun:test";

import { DesktopAiRuntimeService } from "../index";
import {
  AnthropicMessagesAiTurnPortAdapter,
} from "../implementation/anthropic";
import {
  GoogleGenerateContentAiTurnPortAdapter,
} from "../implementation/google";
import {
  OpenAIChatCompletionsAiTurnPortAdapter,
  OpenAIResponsesAiTurnPortAdapter,
} from "../implementation/openai";

describe("DesktopAiRuntimeService", () => {
  test("exposes implemented desktop ai runtimes through a module service", () => {
    const service = new DesktopAiRuntimeService();

    expect(service.listProviderRuntimes()).toEqual([{
      id: "openai-responses",
      protocolFamily: "openai",
      apiStyle: "responses",
      adapterId: "openai-responses",
    }, {
      id: "openai-chat-completions",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      adapterId: "openai-chat-completions",
    }, {
      id: "anthropic-messages",
      protocolFamily: "anthropic",
      apiStyle: "messages",
      adapterId: "anthropic-messages",
    }, {
      id: "google-generate-content",
      protocolFamily: "google",
      apiStyle: "generate-content",
      adapterId: "google-generate-content",
    }]);

    expect(service.findProviderRuntime({
      bindingId: "openai-responses",
    })).toEqual({
      id: "openai-responses",
      protocolFamily: "openai",
      apiStyle: "responses",
      adapterId: "openai-responses",
    });
    expect(service.findProviderRuntime({
      bindingId: "openai-chat-completions",
    })).toEqual({
      id: "openai-chat-completions",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      adapterId: "openai-chat-completions",
    });
    expect(service.findProviderRuntime({
      bindingId: "anthropic-messages",
    })).toEqual({
      id: "anthropic-messages",
      protocolFamily: "anthropic",
      apiStyle: "messages",
      adapterId: "anthropic-messages",
    });
    expect(service.findProviderRuntime({
      bindingId: "google-generate-content",
    })).toEqual({
      id: "google-generate-content",
      protocolFamily: "google",
      apiStyle: "generate-content",
      adapterId: "google-generate-content",
    });
  });

  test("creates ai turn ports through the module service boundary", () => {
    const service = new DesktopAiRuntimeService();

    const turnPort = service.createTurnPort({
      bindingId: "openai-responses",
    }, {
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(OpenAIResponsesAiTurnPortAdapter);
    expect(service.createTurnPort({
      bindingId: "openai-chat-completions",
    }, {
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    })).toBeInstanceOf(OpenAIChatCompletionsAiTurnPortAdapter);
    expect(service.createTurnPort({
      bindingId: "anthropic-messages",
    }, {
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    })).toBeInstanceOf(AnthropicMessagesAiTurnPortAdapter);
    expect(service.createTurnPort({
      bindingId: "google-generate-content",
    }, {
      resolveServiceConfig: async () => ({
        apiKey: "google-test-key",
      }),
    })).toBeInstanceOf(GoogleGenerateContentAiTurnPortAdapter);
    expect(service.createTurnPort({
      bindingId: "missing-runtime",
    }, {
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    })).toBeUndefined();
  });
});
