import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DesktopModelsService } from "../implementation/services/desktop-models-service";

const TEST_CATALOG = {
  openai: {
    name: "OpenAI",
    api: "https://api.openai.com/v1",
    protocol_family: "openai",
    api_style: "responses",
    deployment_kind: "direct",
    discovery_kind: "openai-models",
    env: ["OPENAI_API_KEY"],
    package: "@ai-sdk/openai",
    config_fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        env_key: "OPENAI_API_KEY",
        role: "apiKey",
        required: true,
      },
      {
        key: "organization",
        label: "Organization",
        type: "text",
        default_value: "default-org",
      },
    ],
    models: {
      "gpt-5.4": {
        name: "GPT-5.4",
        attachment: true,
        reasoning: true,
        tool_call: true,
        structured_output: true,
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
      },
      "text-embedding-3-large": {
        name: "text-embedding-3-large",
        modalities: {
          input: ["text"],
          output: ["embedding"],
        },
      },
    },
  },
  azure: {
    name: "Azure OpenAI",
    api: "https://example.openai.azure.com/openai",
    package: "@ai-sdk/azure",
    env: ["AZURE_RESOURCE_NAME", "AZURE_API_KEY"],
    config_fields: [
      {
        key: "resourceName",
        label: "Resource Name",
        type: "text",
        env_key: "AZURE_RESOURCE_NAME",
        role: "resourceName",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        env_key: "AZURE_API_KEY",
        role: "apiKey",
      },
    ],
    models: {
      "gpt-5.4": {
        name: "GPT-5.4",
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
      },
    },
  },
  lmstudio: {
    name: "LM Studio",
    api: "http://127.0.0.1:1234/v1",
    package: "@ai-sdk/openai-compatible",
    env: ["LMSTUDIO_API_KEY"],
    models: {
      "local-model": {
        name: "Local Model",
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
      },
    },
  },
  "kimi-for-coding": {
    name: "Kimi For Coding",
    api: "https://api.kimi.com/coding/v1",
    package: "@ai-sdk/anthropic",
    env: ["KIMI_API_KEY"],
    config_fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        env_key: "KIMI_API_KEY",
        role: "apiKey",
        required: true,
      },
    ],
    models: {
      "kimi-k2.5": {
        name: "Kimi K2.5",
        reasoning: true,
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
      },
    },
  },
  google: {
    name: "Google Gemini",
    api: "https://generativelanguage.googleapis.com/v1beta",
    package: "@ai-sdk/google",
    env: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    models: {
      "gemini-2.5-pro": {
        name: "Gemini 2.5 Pro",
        reasoning: true,
        tool_call: true,
        structured_output: true,
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
      },
    },
  },
  ollama: {
    name: "Ollama",
    api: "http://localhost:11434/api",
    protocol_family: "ollama",
    deployment_kind: "local-native",
    models: {
      "llama3.2": {
        name: "Llama 3.2",
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
      },
    },
  },
} as const;

function createConfig(values: Record<string, string | undefined>) {
  return {
    getString(key: string) {
      return values[key];
    },
  };
}

function createLogger() {
  return {
    async info() {},
    async warn() {},
    async error() {},
  };
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

describe("DesktopModelsService", () => {
  test("normalizes provider protocol family and config schema from catalog", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");

    try {
      await writeJson(catalogPath, TEST_CATALOG);

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const providers = await service.listProviders();
      expect(providers.length).toBeGreaterThan(1);
      const provider = providers.find((item) => item.providerType === "openai");
      expect(provider).toMatchObject({
        providerType: "openai",
        protocolFamily: "openai",
        apiStyle: "responses",
        deploymentKind: "direct",
        discoveryKind: "openai-models",
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-responses",
        },
        supportsRemoteModelDiscovery: true,
      });
      expect(provider?.configSchema).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: "apiKey",
          envKey: "OPENAI_API_KEY",
          type: "secret",
          role: "apiKey",
          required: true,
        }),
        expect.objectContaining({
          key: "organization",
          type: "text",
          defaultValue: "default-org",
        }),
      ]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("infers deployment-aware taxonomy from legacy provider catalog fields", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");

    try {
      await writeJson(catalogPath, TEST_CATALOG);

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const providers = await service.listProviders();
      expect(providers.find((item) => item.providerType === "azure")).toMatchObject({
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        deploymentKind: "azure-openai",
        discoveryKind: "manual",
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-chat-completions",
        },
        supportsRemoteModelDiscovery: false,
      });
      expect(providers.find((item) => item.providerType === "lmstudio")).toMatchObject({
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        deploymentKind: "compatible-local",
        discoveryKind: "openai-models",
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-chat-completions",
        },
        supportsRemoteModelDiscovery: true,
      });
      expect(providers.find((item) => item.providerType === "kimi-for-coding")).toMatchObject({
        protocolFamily: "anthropic",
        apiStyle: "messages",
        deploymentKind: "direct",
        discoveryKind: "manual",
        runtimeSupport: {
          status: "implemented",
          adapterId: "anthropic-messages",
        },
        supportsRemoteModelDiscovery: false,
      });
      expect(providers.find((item) => item.providerType === "ollama")).toMatchObject({
        protocolFamily: "ollama",
        apiStyle: "ollama-chat",
        deploymentKind: "local-native",
        discoveryKind: "ollama-tags",
        runtimeSupport: {
          status: "catalog-only",
        },
        supportsRemoteModelDiscovery: true,
      });
      expect(providers.find((item) => item.providerType === "google")).toMatchObject({
        protocolFamily: "google",
        apiStyle: "generate-content",
        deploymentKind: "direct",
        discoveryKind: "manual",
        runtimeSupport: {
          status: "catalog-only",
        },
        supportsRemoteModelDiscovery: false,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("imports legacy storage into desktop state on first read", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");
    const legacyStatePath = join(tempRoot, "legacy", "providers-state.json");

    try {
      await writeJson(catalogPath, TEST_CATALOG);
      await writeJson(legacyStatePath, {
        version: "1.0",
        updatedAt: "2026-04-27T00:00:00.000Z",
        channels: [
          {
            providerType: "openai",
            channelId: "right",
            name: "Right Channel",
            enabled: true,
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "openai",
                channelId: "right",
                modelId: "gpt-5.4",
                enabled: true,
                updatedAt: "2026-04-27T00:00:00.000Z",
              },
            ],
          },
        ],
      });

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
          "models.legacyImport.path": legacyStatePath,
        }) as never,
        createLogger() as never,
      );

      const channels = await service.listChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0]).toMatchObject({
        providerType: "openai",
        channelId: "right",
        name: "Right Channel",
      });

      const persisted = JSON.parse(await readFile(statePath, "utf-8")) as {
        channels: Array<{ channelId: string }>;
      };
      expect(persisted.channels.map((item) => item.channelId)).toEqual(["right"]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("builds conversational runtime selection snapshot from desktop state", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");

    try {
      await writeJson(catalogPath, TEST_CATALOG);
      await writeJson(statePath, {
        version: "1.0",
        updatedAt: "2026-04-27T00:00:00.000Z",
        channels: [
          {
            providerType: "openai",
            channelId: "right",
            name: "Right Channel",
            enabled: true,
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "openai",
                channelId: "right",
                modelId: "gpt-5.4",
                enabled: true,
                updatedAt: "2026-04-27T00:00:00.000Z",
              },
              {
                providerType: "openai",
                channelId: "right",
                modelId: "text-embedding-3-large",
                enabled: true,
                updatedAt: "2026-04-27T00:00:00.000Z",
              },
            ],
          },
        ],
      });

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const snapshot = await service.getRuntimeSelectionSnapshot();
      expect(snapshot.channels).toEqual([
        {
          value: "right",
          label: "Right Channel",
          providerType: "openai",
          enabled: true,
        },
      ]);
      expect(snapshot.models).toHaveLength(1);
      expect(snapshot.models[0]).toMatchObject({
        value: "gpt-5.4",
        channelId: "right",
        providerType: "openai",
        label: "GPT-5.4",
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-responses",
        },
      });
      expect(snapshot.defaultSelection).toEqual({
        channelId: "right",
        modelId: "gpt-5.4",
      });
      expect(snapshot.resolvedSelection).toEqual({
        providerType: undefined,
        channelId: undefined,
        modelId: undefined,
        runtimeSupport: undefined,
        resolution: "none",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("keeps anthropic-backed Kimi models selectable in runtime snapshots", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");

    try {
      await writeJson(catalogPath, TEST_CATALOG);
      await writeJson(statePath, {
        version: "1.0",
        updatedAt: "2026-04-27T00:00:00.000Z",
        channels: [
          {
            providerType: "kimi-for-coding",
            channelId: "kimicode",
            name: "Kimi Coding",
            enabled: true,
            metadata: {
              env: {
                KIMI_API_KEY: "kimi-test-key",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "kimi-for-coding",
                channelId: "kimicode",
                modelId: "kimi-k2.5",
                enabled: true,
                updatedAt: "2026-04-27T00:00:00.000Z",
              },
            ],
          },
        ],
      });

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const snapshot = await service.getRuntimeSelectionSnapshot();
      expect(snapshot.models).toEqual([expect.objectContaining({
        value: "kimi-k2.5",
        channelId: "kimicode",
        providerType: "kimi-for-coding",
        label: "Kimi K2.5",
        runtimeSupport: {
          status: "implemented",
          adapterId: "anthropic-messages",
        },
      })]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("resolves runtime target with provider service config from selected channel", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");

    try {
      await writeJson(catalogPath, TEST_CATALOG);
      await writeJson(statePath, {
        version: "1.0",
        updatedAt: "2026-04-27T00:00:00.000Z",
        channels: [
          {
            providerType: "openai",
            channelId: "kimi",
            name: "Kimi Compatible",
            baseUrl: "https://api.moonshot.example/v1",
            enabled: true,
            metadata: {
              env: {
                OPENAI_API_KEY: "test-kimi-key",
              },
              config: {
                organization: "moonshot-team",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "openai",
                channelId: "kimi",
                modelId: "gpt-5.4",
                enabled: true,
                updatedAt: "2026-04-27T00:00:00.000Z",
              },
            ],
          },
        ],
      });

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const target = await service.resolveRuntimeTarget({
        workspaceId: "workspace-1",
        selectedChannelId: "kimi",
        selectedModelId: "gpt-5.4",
      });

      expect(target).toMatchObject({
        providerType: "openai",
        channelId: "kimi",
        modelId: "gpt-5.4",
        protocolFamily: "openai",
        apiStyle: "responses",
        supportsFunctionCall: true,
        serviceConfig: {
          apiKey: "test-kimi-key",
          baseUrl: "https://api.moonshot.example/v1",
          organization: "moonshot-team",
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("derives Azure OpenAI chat completions baseUrl from configured resource name", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");

    try {
      await writeJson(catalogPath, {
        ...TEST_CATALOG,
        azure: {
          ...TEST_CATALOG.azure,
          api: undefined,
        },
      });
      await writeJson(statePath, {
        version: "1.0",
        updatedAt: "2026-04-27T00:00:00.000Z",
        channels: [
          {
            providerType: "azure",
            channelId: "azure-main",
            name: "Azure Main",
            enabled: true,
            metadata: {
              env: {
                AZURE_API_KEY: "azure-test-key",
              },
              config: {
                resourceName: "maomi-azure-resource",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "azure",
                channelId: "azure-main",
                modelId: "gpt-5.4",
                enabled: true,
                updatedAt: "2026-04-27T00:00:00.000Z",
              },
            ],
          },
        ],
      });

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const target = await service.resolveRuntimeTarget({
        workspaceId: "workspace-1",
        selectedChannelId: "azure-main",
        selectedModelId: "gpt-5.4",
      });

      expect(target).toMatchObject({
        providerType: "azure",
        channelId: "azure-main",
        modelId: "gpt-5.4",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        supportsFunctionCall: true,
        serviceConfig: {
          apiKey: "azure-test-key",
          baseUrl: "https://maomi-azure-resource.openai.azure.com/openai/v1",
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
