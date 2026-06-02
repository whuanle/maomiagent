import { describe, expect, test } from "bun:test";

import type { DesktopModelChannelItem } from "../../../../shared/desktop-models";
import {
  mergeCustomChannelModelMetadata,
  readCustomChannelModelForEdit,
  removeCustomChannelModelMetadata,
  stripCustomModelsMetadata,
} from "./custom-model-metadata";

describe("custom model metadata helpers", () => {
  test("reads custom model entries into editable values", () => {
    const channel = {
      metadata: {
        customModels: [{
          modelId: "mimo-v2-omni",
          displayName: "MiMo Omni",
          family: "mimo",
          contextWindow: 262144,
          maxOutputTokens: 8192,
          supportsAttachments: true,
          supportsReasoning: true,
          modalities: {
            input: ["text", " image ", "TEXT"],
            output: ["text"],
          },
        }],
      },
    } satisfies Pick<DesktopModelChannelItem, "metadata">;

    expect(readCustomChannelModelForEdit(channel, "mimo-v2-omni")).toEqual({
      modelId: "mimo-v2-omni",
      displayName: "MiMo Omni",
      family: "mimo",
      contextWindow: 262144,
      maxOutputTokens: 8192,
      supportsAttachments: true,
      supportsReasoning: true,
      supportsFunctionCall: false,
      supportsStructuredOutput: false,
      supportsTemperature: false,
      interleaved: undefined,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
    });
  });

  test("merges edited custom model data without dropping unrelated metadata", () => {
    const metadata = {
      env: {
        MAOMI_API_KEY: "secret",
      },
      customModels: [{
        modelId: "mimo-v2-omni",
        displayName: "Old Name",
        cost: {
          input: 1.2,
        },
        interleaved: {
          field: "messages",
        },
      }, {
        modelId: "mimo-v2-pro",
        displayName: "MiMo Pro",
      }],
    } satisfies DesktopModelChannelItem["metadata"];

    const nextMetadata = mergeCustomChannelModelMetadata(metadata, {
      modelId: "mimo-v2-omni",
      displayName: "MiMo Omni",
      family: "mimo",
      contextWindow: 262144,
      maxOutputTokens: 8192,
      supportsAttachments: true,
      supportsReasoning: true,
      supportsFunctionCall: false,
      supportsStructuredOutput: true,
      supportsTemperature: false,
      interleaved: {
        field: "reasoning_content",
      },
      modalities: {
        input: ["text", " image "],
        output: ["text", "TEXT"],
      },
    });

    expect(nextMetadata.env).toEqual({
      MAOMI_API_KEY: "secret",
    });
    expect(nextMetadata.customModels).toEqual([{
      modelId: "mimo-v2-omni",
      displayName: "MiMo Omni",
      family: "mimo",
      contextWindow: 262144,
      maxOutputTokens: 8192,
      supportsAttachments: true,
      supportsReasoning: true,
      supportsStructuredOutput: true,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      cost: {
        input: 1.2,
      },
      interleaved: {
        field: "reasoning_content",
      },
    }, {
      modelId: "mimo-v2-pro",
      displayName: "MiMo Pro",
    }]);
  });

  test("reads interleaved reasoning metadata for editing", () => {
    const channel = {
      metadata: {
        customModels: [{
          modelId: "kimi-k2.5",
          displayName: "Kimi K2.5",
          supportsReasoning: true,
          interleaved: {
            field: "reasoning_content",
          },
        }],
      },
    } satisfies Pick<DesktopModelChannelItem, "metadata">;

    expect(readCustomChannelModelForEdit(channel, "kimi-k2.5")).toEqual({
      modelId: "kimi-k2.5",
      displayName: "Kimi K2.5",
      supportsAttachments: false,
      supportsReasoning: true,
      supportsFunctionCall: false,
      supportsStructuredOutput: false,
      supportsTemperature: false,
      interleaved: {
        field: "reasoning_content",
      },
      modalities: {
        input: [],
        output: [],
      },
    });
  });

  test("removes custom model entries while preserving remaining metadata", () => {
    const metadata = {
      config: {
        region: "cn-beijing",
      },
      customModels: [{
        modelId: "mimo-v2-omni",
        displayName: "MiMo Omni",
      }],
    } satisfies DesktopModelChannelItem["metadata"];

    expect(removeCustomChannelModelMetadata(metadata, "mimo-v2-omni")).toEqual({
      config: {
        region: "cn-beijing",
      },
    });
    expect(stripCustomModelsMetadata({
      customModels: [{
        modelId: "mimo-v2-omni",
      }],
    })).toEqual({});
  });
});
