import { describe, expect, test } from "bun:test";

import {
  findDesktopAiProviderRuntimeDescriptor,
  listDesktopAiProviderRuntimeDescriptors,
} from "../index";
import {
  AnthropicMessagesAiTurnPortAdapter,
} from "../implementation/anthropic";
import {
  OpenAIChatCompletionsAiTurnPortAdapter,
  OpenAIResponsesAiTurnPortAdapter,
} from "../implementation/openai";

describe("desktop ai provider runtime registry", () => {
  test("lists the implemented runtime descriptors", () => {
    expect(listDesktopAiProviderRuntimeDescriptors().map((item) => ({
      id: item.id,
      protocolFamily: item.protocolFamily,
      apiStyle: item.apiStyle,
      adapterId: item.adapterId,
    }))).toEqual([{
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
    }]);
  });

  test("resolves a runtime descriptor and builds an ai turn port through the module registry", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "openai",
      apiStyle: "responses",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(OpenAIResponsesAiTurnPortAdapter);
  });

  test("resolves the chat completions descriptor and builds the matching ai turn port", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "openai",
      apiStyle: "chat-completions",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(OpenAIChatCompletionsAiTurnPortAdapter);
  });

  test("resolves the anthropic descriptor and builds the matching ai turn port", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "anthropic",
      apiStyle: "messages",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(AnthropicMessagesAiTurnPortAdapter);
  });
});