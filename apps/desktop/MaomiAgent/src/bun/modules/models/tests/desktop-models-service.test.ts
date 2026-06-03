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
        interleaved: {
          field: "reasoning_content",
        },
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

  test("loads providers from a packaged desktop layout when process.execPath points at bin bun", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-packaged-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");
    const portableBinDir = join(tempRoot, "bin");
    const originalExecPath = process.execPath;
    const originalCwd = process.cwd();

    try {
      await mkdir(portableBinDir, { recursive: true });
      await writeJson(catalogPath, {
        "portable-provider": {
          name: "Portable Provider",
          api: "https://portable.example/v1",
          models: {
            "portable-model": {
              name: "Portable Model",
              modalities: {
                input: ["text"],
                output: ["text"],
              },
            },
          },
        },
      });

      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: join(portableBinDir, "bun.exe"),
      });
      process.chdir(portableBinDir);

      const service = new DesktopModelsService(
        createConfig({
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const providers = await service.listProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0]).toMatchObject({
        providerType: "portable-provider",
        displayName: "Portable Provider",
      });
      expect(providers[0]?.models).toEqual([
        expect.objectContaining({
          modelId: "portable-model",
          displayName: "Portable Model",
        }),
      ]);
    } finally {
      process.chdir(originalCwd);
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: originalExecPath,
      });
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
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        deploymentKind: "local-native",
        discoveryKind: "ollama-tags",
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-chat-completions",
        },
        supportsRemoteModelDiscovery: true,
      });
      expect(providers.find((item) => item.providerType === "google")).toMatchObject({
        protocolFamily: "google",
        apiStyle: "generate-content",
        deploymentKind: "direct",
        discoveryKind: "manual",
        runtimeSupport: {
          status: "implemented",
          adapterId: "google-generate-content",
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

  test("keeps Kimi models selectable in runtime snapshots through catalog-declared openai chat completions", async () => {
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
              source: "provider",
              providerBindingId: "openai",
              protocolFamily: "openai",
              apiStyle: "chat-completions",
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
        supportsReasoning: true,
        interleaved: {
          field: "reasoning_content",
        },
        runtimeSupport: {
          status: "implemented",
          adapterId: "openai-chat-completions",
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

  test("prefers channel runtime binding metadata over provider defaults", async () => {
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
            channelId: "compat-openai",
            name: "Compatible OpenAI",
            baseUrl: "https://api.compat.example/v1",
            enabled: true,
            metadata: {
              source: "protocol",
              providerBindingId: "openai",
              protocolFamily: "openai",
              apiStyle: "chat-completions",
              config: {
                apiKey: "compat-key",
                organization: "compat-org",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "openai",
                channelId: "compat-openai",
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
        selectedChannelId: "compat-openai",
        selectedModelId: "gpt-5.4",
      });

      expect(target).toMatchObject({
        providerType: "openai",
        channelId: "compat-openai",
        modelId: "gpt-5.4",
        providerBindingId: "openai",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        serviceConfig: {
          apiKey: "compat-key",
          baseUrl: "https://api.compat.example/v1",
          organization: "compat-org",
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("does not duplicate catalog-backed providers when channels carry protocol metadata", async () => {
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
            channelId: "compat-openai",
            name: "Compatible OpenAI",
            baseUrl: "https://api.compat.example/v1",
            enabled: true,
            metadata: {
              source: "protocol",
              providerBindingId: "openai",
              protocolFamily: "openai",
              apiStyle: "chat-completions",
              config: {
                apiKey: "compat-key",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [],
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

      const providers = await service.listProviders();
      expect(providers.filter((item) => item.providerType === "openai")).toHaveLength(1);

      const snapshot = await service.getSnapshot();
      expect(snapshot.providers.filter((item) => item.providerType === "openai")).toHaveLength(1);
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

  test("resolves runtime target with reasoning capabilities from selected model", async () => {
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
              source: "provider",
              providerBindingId: "openai",
              protocolFamily: "openai",
              apiStyle: "chat-completions",
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

      const target = await service.resolveRuntimeTarget({
        workspaceId: "workspace-1",
        selectedChannelId: "kimicode",
        selectedModelId: "kimi-k2.5",
      });

      expect(target).toMatchObject({
        providerType: "kimi-for-coding",
        channelId: "kimicode",
        modelId: "kimi-k2.5",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        supportsReasoning: true,
        supportsFunctionCall: true,
        interleaved: {
          field: "reasoning_content",
        },
        serviceConfig: {
          apiKey: "kimi-test-key",
          baseUrl: "https://api.kimi.com/coding/v1",
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("keeps provider default baseUrl for provider-backed channels after protocol changes", async () => {
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
            channelId: "compat-kimi",
            name: "Compat Kimi",
            enabled: true,
            metadata: {
              source: "provider",
              providerBindingId: "openai",
              protocolFamily: "openai",
              apiStyle: "chat-completions",
              config: {
                apiKey: "compat-kimi-key",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "kimi-for-coding",
                channelId: "compat-kimi",
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

      const target = await service.resolveRuntimeTarget({
        workspaceId: "workspace-1",
        selectedChannelId: "compat-kimi",
        selectedModelId: "kimi-k2.5",
      });

      expect(target).toMatchObject({
        providerType: "kimi-for-coding",
        channelId: "compat-kimi",
        modelId: "kimi-k2.5",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        serviceConfig: {
          apiKey: "compat-kimi-key",
          baseUrl: "https://api.kimi.com/coding/v1",
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("creates and lists custom protocol channels without provider catalog entries", async () => {
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

      await service.createChannel("custom-google-generate-content", {
        channelId: "gemini_lab",
        name: "Gemini Lab",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        enabled: true,
        metadata: {
          source: "protocol",
          protocolFamily: "google",
          apiStyle: "generate-content",
          deploymentKind: "direct",
          discoveryKind: "manual",
          runtimeSupport: {
            status: "implemented",
            adapterId: "google-generate-content",
          },
          config: {
            apiKey: "gemini-key",
          },
          headers: {
            "X-Maomi-Proxy": "edge",
          },
        },
      });

      const snapshot = await service.getSnapshot();
      expect(snapshot.providers.find((item) => item.providerType === "custom-google-generate-content")).toMatchObject({
        displayName: "Custom Protocol",
        protocolFamily: "google",
        apiStyle: "generate-content",
        discoveryKind: "manual",
        runtimeSupport: {
          status: "implemented",
          adapterId: "google-generate-content",
        },
      });
      expect(snapshot.channels.find((item) => item.channelId === "gemini_lab")).toMatchObject({
        providerType: "custom-google-generate-content",
        metadata: {
          source: "protocol",
          protocolFamily: "google",
          apiStyle: "generate-content",
          headers: {
            "X-Maomi-Proxy": "edge",
          },
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("resolves runtime target for custom protocols with headers and without requiring apiKey", async () => {
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
            providerType: "custom-google-generate-content",
            channelId: "gemini_lab",
            name: "Gemini Lab",
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            enabled: true,
            metadata: {
              source: "protocol",
              protocolFamily: "google",
              apiStyle: "generate-content",
              deploymentKind: "direct",
              discoveryKind: "manual",
              runtimeSupport: {
                status: "implemented",
                adapterId: "google-generate-content",
              },
              headers: {
                "x-goog-api-key": "gemini-key",
                "X-Maomi-Proxy": "edge",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "custom-google-generate-content",
                channelId: "gemini_lab",
                modelId: "gemini-2.5-pro",
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

      await expect(service.resolveRuntimeTarget({
        workspaceId: "workspace-1",
        selectedChannelId: "gemini_lab",
        selectedModelId: "gemini-2.5-pro",
      })).resolves.toMatchObject({
        providerType: "custom-google-generate-content",
        channelId: "gemini_lab",
        modelId: "gemini-2.5-pro",
        providerBindingId: "google",
        protocolFamily: "google",
        apiStyle: "generate-content",
        serviceConfig: {
          apiKey: "",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          headers: {
            "x-goog-api-key": "gemini-key",
            "X-Maomi-Proxy": "edge",
          },
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("normalizes legacy ollama channel metadata onto openai chat runtime resolution", async () => {
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
            providerType: "ollama",
            channelId: "ollama_local",
            name: "Ollama Local",
            baseUrl: "http://localhost:11434/api",
            enabled: true,
            metadata: {
              source: "provider",
              protocolFamily: "ollama",
              apiStyle: "ollama-chat",
              runtimeSupport: {
                status: "catalog-only",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "ollama",
                channelId: "ollama_local",
                modelId: "llama3.2",
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
        selectedChannelId: "ollama_local",
        selectedModelId: "llama3.2",
      });

      expect(target).toMatchObject({
        providerType: "ollama",
        channelId: "ollama_local",
        modelId: "llama3.2",
        providerBindingId: "openai",
        protocolFamily: "openai",
        apiStyle: "chat-completions",
        serviceConfig: {
          apiKey: "",
          baseUrl: "http://localhost:11434/api",
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("rejects catalog-backed runtime targets when API key material is missing", async () => {
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
            channelId: "missing-key",
            name: "Missing Key",
            enabled: true,
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [
              {
                providerType: "openai",
                channelId: "missing-key",
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

      await expect(service.resolveRuntimeTarget({
        workspaceId: "workspace-1",
        selectedChannelId: "missing-key",
        selectedModelId: "gpt-5.4",
      })).rejects.toMatchObject({
        code: "INVALID_ARGUMENT",
        message: "current channel is missing API key required by selected provider",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("discovers models through channel protocol metadata when catalog discovery is manual", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-models-"));
    const catalogPath = join(tempRoot, "data", "models.json");
    const statePath = join(tempRoot, "desktop", "providers-state.json");
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;

    try {
      await writeJson(catalogPath, TEST_CATALOG);
      await writeJson(statePath, {
        version: "1.0",
        updatedAt: "2026-04-27T00:00:00.000Z",
        channels: [
          {
            providerType: "kimi-for-coding",
            channelId: "kimi",
            name: "Kimi",
            enabled: true,
            baseUrl: "https://api.kimi.com/coding/v1",
            metadata: {
              config: {
                apiKey: "test-kimi-key",
              },
              env: {
                KIMI_API_KEY: "test-kimi-key",
              },
              protocolFamily: "openai",
              apiStyle: "chat-completions",
              discoveryKind: "openai-models",
              headers: {
                "User-Agent": "KimiCLI/1.3",
              },
            },
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            models: [],
          },
        ],
      });

      globalThis.fetch = (async (input, init) => {
        capturedUrl = String(input);
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({
          data: [{
            id: "kimi-for-coding",
            owned_by: "kimi",
          }],
        }), {
          headers: {
            "content-type": "application/json",
          },
        });
      }) as typeof fetch;

      const service = new DesktopModelsService(
        createConfig({
          "models.catalog.path": catalogPath,
          "models.state.path": statePath,
        }) as never,
        createLogger() as never,
      );

      const result = await service.discoverChannelModels("kimi-for-coding", "kimi");

      expect(capturedUrl).toBe("https://api.kimi.com/coding/v1/models");
      expect(capturedHeaders).toEqual(expect.objectContaining({
        Accept: "application/json",
        Authorization: "Bearer test-kimi-key",
        "User-Agent": "KimiCLI/1.3",
      }));
      expect(result).toMatchObject({
        enabledCount: 1,
        addedCustomCount: 1,
        discovered: [{
          modelId: "kimi-for-coding",
          knownProviderModel: false,
        }],
      });
    } finally {
      globalThis.fetch = originalFetch;
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
