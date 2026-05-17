import type {
  DesktopAiExecutionProfileMaterializerPort,
  DesktopAiOneShotPort,
} from "../../abstraction/ports/desktop-ai-one-shot.ports";
import type {
  DesktopAiOneShotInput,
  DesktopAiOneShotResult,
} from "../../abstraction/models/desktop-ai-one-shot.models";
import type { DesktopAiRuntimePort } from "../../abstraction/ports/desktop-ai-runtime.ports";
import { OneShotExecutionService } from "../../kernel-bridge";

type DesktopAiOneShotServiceOptions = {
  runtime: DesktopAiRuntimePort;
  materializer: DesktopAiExecutionProfileMaterializerPort;
  now?: () => number;
  nextId?: (prefix: string) => string;
};

function defaultNextId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class DesktopAiOneShotService implements DesktopAiOneShotPort {
  constructor(private readonly options: DesktopAiOneShotServiceOptions) {}

  async execute(input: DesktopAiOneShotInput): Promise<DesktopAiOneShotResult> {
    const { workspaceId, selectedChannelId, selectedModelId, ...request } = input;
    const materialized = await this.options.materializer.materialize({
      workspaceId,
      selectedChannelId,
      selectedModelId,
    });
    const turnPort = this.options.runtime.createTurnPort(
      materialized.runtimeSelector,
      {
        resolveServiceConfig: materialized.resolveServiceConfig,
      },
    );

    if (!turnPort) {
      throw new Error(
        `No desktop AI runtime matched ${materialized.target.protocolFamily}/${materialized.target.apiStyle}`,
      );
    }

    const service = new OneShotExecutionService({
      turnPort,
      clock: {
        now: this.options.now ?? (() => Date.now()),
      },
      idGenerator: {
        next: this.options.nextId ?? defaultNextId,
      },
    });
    const result = await service.execute({
      ...request,
      executionProfile: materialized.executionProfile,
    });

    return {
      ...result,
      target: materialized.target,
    };
  }
}