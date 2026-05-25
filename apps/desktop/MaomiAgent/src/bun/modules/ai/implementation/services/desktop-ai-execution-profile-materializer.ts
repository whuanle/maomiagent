import type { DesktopModelsQueryPort } from "../../../models";
import type { DesktopAiProviderServiceConfig } from "../../abstraction/models/desktop-ai-runtime.models";
import type {
  DesktopAiExecutionMaterialization,
  DesktopAiExecutionProfileMaterializationInput,
} from "../../abstraction/models/desktop-ai-one-shot.models";
import type { DesktopAiExecutionProfileMaterializerPort } from "../../abstraction/ports/desktop-ai-one-shot.ports";
import { asAiExecutionProfileId, type AiExecutionProfileRef } from "../../kernel-bridge";

function cloneServiceConfig(input: DesktopAiProviderServiceConfig): DesktopAiProviderServiceConfig {
  return {
    ...input,
    headers: input.headers ? { ...input.headers } : undefined,
    reasoning: input.reasoning ? { ...input.reasoning } : undefined,
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildExecutionProfile(input: {
  target: DesktopAiExecutionMaterialization["target"];
  scope?: DesktopAiExecutionProfileMaterializationInput["scope"];
  workspaceId?: string;
}): AiExecutionProfileRef {
  return {
    id: asAiExecutionProfileId(
      `desktop.${input.target.providerType}.${input.target.channelId}.${input.target.modelId}`,
    ),
    modelId: input.target.modelId,
    metadata: {
      modelId: input.target.modelId,
      providerType: input.target.providerType,
      channelId: input.target.channelId,
      ...(input.target.protocolFamily ? { protocolFamily: input.target.protocolFamily } : {}),
      ...(input.target.apiStyle ? { apiStyle: input.target.apiStyle } : {}),
      ...(typeof input.target.supportsFunctionCall === "boolean"
        ? { supportsFunctionCall: input.target.supportsFunctionCall }
        : {}),
      ...(typeof input.target.contextWindow === "number" ? { contextWindow: input.target.contextWindow } : {}),
      ...(typeof input.target.maxOutputTokens === "number" ? { maxOutputTokens: input.target.maxOutputTokens } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
  };
}

export class DesktopAiExecutionProfileMaterializer
implements DesktopAiExecutionProfileMaterializerPort {
  constructor(
    private readonly modelsQuery: Pick<DesktopModelsQueryPort, "resolveRuntimeTarget">,
  ) {}

  async materialize(
    input: DesktopAiExecutionProfileMaterializationInput,
  ): Promise<DesktopAiExecutionMaterialization> {
    const scope = input.scope;
    const workspaceId = normalizeOptionalText(input.workspaceId);
    const selectedChannelId = normalizeOptionalText(input.selectedChannelId);
    const selectedModelId = normalizeOptionalText(input.selectedModelId);
    const resolved = await this.modelsQuery.resolveRuntimeTarget({
      ...(scope ? { scope } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(selectedChannelId ? { selectedChannelId } : {}),
      ...(selectedModelId ? { selectedModelId } : {}),
    });

    if (!resolved.protocolFamily || !resolved.apiStyle) {
      throw new Error("Resolved runtime target is missing protocol family or api style");
    }

    const target = {
      providerType: resolved.providerType,
      channelId: resolved.channelId,
      modelId: resolved.modelId,
      protocolFamily: resolved.protocolFamily,
      apiStyle: resolved.apiStyle,
      supportsFunctionCall: resolved.supportsFunctionCall,
      contextWindow: resolved.contextWindow,
      maxOutputTokens: resolved.maxOutputTokens,
    };

    return {
      executionProfile: buildExecutionProfile({
        target,
        scope,
        workspaceId,
      }),
      runtimeSelector: {
        protocolFamily: resolved.protocolFamily,
        apiStyle: resolved.apiStyle,
      },
      resolveServiceConfig: async () => cloneServiceConfig(resolved.serviceConfig),
      target,
    };
  }
}
