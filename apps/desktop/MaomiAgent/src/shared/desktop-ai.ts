import type {
  OneShotExecutionInput,
  OneShotExecutionResult,
  OneShotMessageInput,
} from "#maomiagent/kernel/src/host/one-shot";

import type {
  DesktopModelProviderApiStyle,
  DesktopModelProviderProtocolFamily,
  DesktopModelRuntimeSelectionQuery,
} from "./desktop-models";

export type DesktopAiOneShotMessageInput = OneShotMessageInput;

export type DesktopAiOneShotRequest = DesktopModelRuntimeSelectionQuery & Pick<
  OneShotExecutionInput,
  "messages" | "systemBlocks" | "contextBlocks" | "agentId" | "outputMode" | "settings"
>;

export type DesktopAiOneShotTarget = {
  providerType: string;
  channelId: string;
  modelId: string;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
};

export type DesktopAiOneShotResponse = Omit<
  OneShotExecutionResult,
  "sessionId" | "runId" | "turnId"
> & {
  sessionId: string;
  runId: string;
  turnId: string;
  target: DesktopAiOneShotTarget;
};