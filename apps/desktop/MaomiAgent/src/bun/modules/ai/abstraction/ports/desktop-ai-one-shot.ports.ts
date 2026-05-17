import type {
  DesktopAiExecutionMaterialization,
  DesktopAiExecutionProfileMaterializationInput,
  DesktopAiOneShotInput,
  DesktopAiOneShotResult,
} from "../models/desktop-ai-one-shot.models";

export interface DesktopAiExecutionProfileMaterializerPort {
  materialize(
    input: DesktopAiExecutionProfileMaterializationInput,
  ): Promise<DesktopAiExecutionMaterialization>;
}

export interface DesktopAiOneShotPort {
  execute(input: DesktopAiOneShotInput): Promise<DesktopAiOneShotResult>;
}