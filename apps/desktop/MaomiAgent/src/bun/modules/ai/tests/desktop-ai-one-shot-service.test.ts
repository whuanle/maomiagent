import { describe, expect, test } from "bun:test";

import { DesktopAiExecutionProfileMaterializer } from "../implementation/services/desktop-ai-execution-profile-materializer";
import { DesktopAiOneShotService } from "../implementation/services/desktop-ai-one-shot-service";
import type { DesktopAiRuntimePort } from "../abstraction/ports/desktop-ai-runtime.ports";
import type { DesktopModelsQueryPort } from "../../models";

describe("desktop ai one-shot services", () => {
  test("materializes runtime selection into an execution profile and runtime selector", async () => {
    const resolveCalls: Array<Record<string, unknown>> = [];
    const modelsQuery: Pick<DesktopModelsQueryPort, "resolveRuntimeTarget"> = {
      async resolveRuntimeTarget(input) {
        resolveCalls.push({ ...input });
        return {
          providerType: "openai",
          channelId: "main",
          modelId: "gpt-4.1",
          providerBindingId: "openai",
          protocolFamily: "openai",
          apiStyle: "responses",
          supportsReasoning: true,
          supportsFunctionCall: true,
          interleaved: {
            field: "reasoning_content",
          },
          serviceConfig: {
            apiKey: "sk-test",
            baseUrl: "https://api.openai.com/v1",
          },
        };
      },
    };
    const materializer = new DesktopAiExecutionProfileMaterializer(modelsQuery);

    const result = await materializer.materialize({
      scope: "workspace",
      workspaceId: "workspace-1",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    });

    expect(result.runtimeSelector).toEqual({
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "responses",
    });
    expect(result.protocolIdentity).toEqual({
      protocolFamily: "openai",
      apiStyle: "responses",
    });
    expect(result.capabilities).toEqual({
      supportsReasoning: true,
      supportsFunctionCall: true,
      supportsInterleavedReasoning: true,
    });
    expect(result.executionProfile.modelId).toBe("gpt-4.1");
    expect(result.executionProfile.metadata).toMatchObject({
      providerType: "openai",
      channelId: "main",
      modelId: "gpt-4.1",
      protocolFamily: "openai",
      apiStyle: "responses",
      supportsReasoning: true,
      supportsFunctionCall: true,
      interleaved: {
        field: "reasoning_content",
      },
      scope: "workspace",
      workspaceId: "workspace-1",
    });
    expect(resolveCalls).toEqual([{
      scope: "workspace",
      workspaceId: "workspace-1",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    }]);
    await expect(result.resolveServiceConfig(result.executionProfile)).resolves.toEqual({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  test("executes one-shot requests through the resolved desktop ai runtime", async () => {
    const runtimeCalls: Array<{ selector: unknown; modelId?: string }> = [];
    const runtime: DesktopAiRuntimePort = {
      listProviderRuntimes() {
        return [];
      },
      findProviderRuntime() {
        return undefined;
      },
      createTurnPort(selector) {
        return {
          async *stream(input) {
            runtimeCalls.push({
              selector,
              modelId: input.executionProfile.modelId,
            });
            yield { type: "text.start" } as const;
            yield { type: "text.delta", delta: "done" } as const;
            yield { type: "finish", reason: "stop" } as const;
          },
        };
      },
    };
    const materializer = {
      async materialize() {
        return {
          executionProfile: {
            id: "desktop.openai.main.gpt-4.1" as never,
            modelId: "gpt-4.1",
          },
          runtimeSelector: {
            providerBindingId: "openai" as const,
            protocolFamily: "openai" as const,
            apiStyle: "responses" as const,
          },
          protocolIdentity: {
            protocolFamily: "openai" as const,
            apiStyle: "responses" as const,
          },
          capabilities: {
            supportsFunctionCall: true,
          },
          resolveServiceConfig: async () => ({
            apiKey: "sk-test",
          }),
          target: {
            providerType: "openai",
            channelId: "main",
            modelId: "gpt-4.1",
            providerBindingId: "openai" as const,
            protocolFamily: "openai" as const,
            apiStyle: "responses" as const,
            supportsReasoning: true,
            supportsFunctionCall: true,
            interleaved: {
              field: "reasoning_content",
            },
          },
        };
      },
    };
    const service = new DesktopAiOneShotService({
      runtime,
      materializer,
      now: () => 10,
      nextId: (prefix) => `${prefix}_id`,
    });

    const result = await service.execute({
      workspaceId: "workspace-1",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
      messages: [{
        role: "user",
        content: "Say done",
      }],
    });

    expect(runtimeCalls).toEqual([{
      selector: {
        providerBindingId: "openai",
        protocolFamily: "openai",
        apiStyle: "responses",
      },
      modelId: "gpt-4.1",
    }]);
    expect(result.content).toBe("done");
    expect(result.target).toEqual({
      providerType: "openai",
      channelId: "main",
      modelId: "gpt-4.1",
      providerBindingId: "openai",
      protocolFamily: "openai",
      apiStyle: "responses",
      supportsReasoning: true,
      supportsFunctionCall: true,
      interleaved: {
        field: "reasoning_content",
      },
    });
  });
});
