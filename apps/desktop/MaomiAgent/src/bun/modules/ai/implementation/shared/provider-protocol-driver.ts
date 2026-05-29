import type {
  DesktopAiProviderServiceConfig,
  DesktopAiProviderTelemetrySink,
  DesktopAiRuntimeCapabilities,
} from "../../abstraction/models/desktop-ai-runtime.models";
import type { AiTurnEvent, AiTurnRequest } from "../../kernel-bridge";

export type ProtocolTransportFrame =
  | {
    kind: "headers";
    status: number;
    contentType?: string;
  }
  | {
    kind: "byte";
    chunk: string;
  }
  | {
    kind: "event";
    event: AiTurnEvent;
  };

export type ProtocolTurnStageTimeouts = {
  firstByteMs?: number;
  firstEventMs?: number;
  idleMs?: number;
};

export type DesktopAiProtocolDriver = {
  id: string;
  capabilities: DesktopAiRuntimeCapabilities;
  execute(input: {
    request: AiTurnRequest;
    config: DesktopAiProviderServiceConfig;
    signal?: AbortSignal;
    telemetrySink?: DesktopAiProviderTelemetrySink;
    stageTimeouts: ProtocolTurnStageTimeouts;
  }): AsyncIterable<ProtocolTransportFrame> | Promise<AsyncIterable<ProtocolTransportFrame>>;
};
