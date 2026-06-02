import { describe, expect, test } from "bun:test";

import {
  DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS,
  findDesktopAiProviderRuntimeBinding,
  resolveDesktopAiProviderRuntimeSupport,
} from "../index";

describe("desktop ai provider runtime bindings", () => {
  test("lists the implemented desktop ai runtime bindings declaratively", () => {
    expect(DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS).toEqual([{
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
  });

  test("finds bindings by protocol family and api style", () => {
    expect(findDesktopAiProviderRuntimeBinding({
      protocolFamily: "openai",
      apiStyle: "responses",
    })).toEqual({
      id: "openai-responses",
      protocolFamily: "openai",
      apiStyle: "responses",
      adapterId: "openai-responses",
    });
    expect(findDesktopAiProviderRuntimeBinding({
      protocolFamily: "openai",
      apiStyle: "chat-completions",
    })).toEqual({
      id: "openai-chat-completions",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      adapterId: "openai-chat-completions",
    });
    expect(findDesktopAiProviderRuntimeBinding({
      protocolFamily: "anthropic",
      apiStyle: "messages",
    })).toEqual({
      id: "anthropic-messages",
      protocolFamily: "anthropic",
      apiStyle: "messages",
      adapterId: "anthropic-messages",
    });
    expect(findDesktopAiProviderRuntimeBinding({
      protocolFamily: "google",
      apiStyle: "generate-content",
    })).toEqual({
      id: "google-generate-content",
      protocolFamily: "google",
      apiStyle: "generate-content",
      adapterId: "google-generate-content",
    });
  });
});

describe("desktop ai provider runtime support", () => {
  test("marks openai responses providers as implemented", () => {
    expect(resolveDesktopAiProviderRuntimeSupport({
      providerType: "openai",
      protocolFamily: "openai",
      apiStyle: "responses",
    })).toEqual({
      status: "implemented",
      adapterId: "openai-responses",
    });
  });

  test("marks kimi coding providers as implemented through openai chat completions", () => {
    expect(resolveDesktopAiProviderRuntimeSupport({
      providerType: "kimi-for-coding",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
    })).toEqual({
      status: "implemented",
      adapterId: "openai-chat-completions",
    });
  });

  test("marks openai providers as implemented and leaves legacy ollama protocol ids catalog-only", () => {
    expect(resolveDesktopAiProviderRuntimeSupport({
      providerType: "azure",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
    })).toEqual({
      status: "implemented",
      adapterId: "openai-chat-completions",
    });
    expect(resolveDesktopAiProviderRuntimeSupport({
      providerType: "ollama",
      protocolFamily: "ollama",
      apiStyle: "ollama-chat",
    })).toEqual({
      status: "catalog-only",
      reason: "ollama is cataloged as ollama/ollama-chat, but desktop ai has no matching runtime adapter yet",
    });
  });

  test("marks google generate-content as implemented", () => {
    expect(resolveDesktopAiProviderRuntimeSupport({
      providerType: "google",
      protocolFamily: "google",
      apiStyle: "generate-content",
    })).toEqual({
      status: "implemented",
      adapterId: "google-generate-content",
    });
  });
});
