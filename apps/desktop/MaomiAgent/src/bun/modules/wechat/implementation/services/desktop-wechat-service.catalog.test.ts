import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogExtra, RuntimeLogLevel, RuntimeLogRecord, RuntimeLogger } from "../../../logs";
import type { DesktopModelsQueryPort } from "../../../models";
import type {
  DesktopConversationCommandPort,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
  DesktopConversationAnswerInteractionInput,
  DesktopConversationRejectInteractionInput,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationSaveWorkspaceSettingsInput,
  DesktopConversationSaveWorkspaceSettingsResponse,
  DesktopConversationSessionDetail,
} from "../../../conversation";
import type { DesktopWorkspacePort } from "../../../workspace";
import { createDefaultDesktopConversationWorkspaceSettings } from "../../../../../shared/desktop-conversation";
import { DesktopWechatService } from "./desktop-wechat-service";

function createMockModelsQuery(): Pick<DesktopModelsQueryPort, "getRuntimeSelectionSnapshot"> {
  return {
    getRuntimeSelectionSnapshot: async () => ({
      scope: "global",
      generatedAt: "2026-05-08T00:00:00.000Z",
      etag: "test-selection",
      channels: [],
      models: [],
      defaultSelection: {},
      requestedSelection: {},
      resolvedSelection: {
        resolution: "none",
      },
    }),
  };
}

function createMockLogger(): RuntimeLogger {
  const write = async (level: RuntimeLogLevel, message: string): Promise<RuntimeLogRecord> => ({
    id: "log-test",
    at: new Date().toISOString(),
    level,
    source: "test",
    module: "wechat",
    message,
  });

  return {
    write: (level: RuntimeLogLevel, message: string, _extra?: RuntimeLogExtra) => write(level, message),
    debug: (message: string, _extra?: RuntimeLogExtra) => write("debug", message),
    info: (message: string, _extra?: RuntimeLogExtra) => write("info", message),
    warn: (message: string, _extra?: RuntimeLogExtra) => write("warn", message),
    error: (message: string, _extra?: RuntimeLogExtra) => write("error", message),
  };
}

function createMockConfiguration(storagePath: string): DesktopConfigurationPort {
  return {
    get: () => undefined,
    getString: (key: string, fallback?: string) => {
      if (key === "wechat.state.path") {
        return storagePath;
      }
      return fallback;
    },
    getBoolean: (_key: string, fallback?: boolean) => fallback,
    getNumber: (_key: string, fallback?: number) => fallback,
    getRecord: () => undefined,
    requireString: (key: string) => {
      throw new Error(`Missing configuration: ${key}`);
    },
    snapshot: () => ({
      values: {},
      sources: [],
    }),
  };
}

function createMockConversationCommand(): DesktopConversationCommandPort {
  const now = new Date().toISOString();
  const detail: DesktopConversationSessionDetail = {
    sessionId: "session-test",
    workspaceId: "workspace-test",
    title: "test",
    status: "idle",
    createdAt: now,
    updatedAt: now,
    runs: [],
    messages: [],
    toolCalls: [],
    interactions: [],
    pendingInteractions: [],
    checkpoints: [],
    timeline: [],
  };

  return {
    createSession: async (
      _input: DesktopConversationCreateSessionInput,
    ): Promise<DesktopConversationCreateSessionResponse> => ({
      created: true,
      item: {
        sessionId: detail.sessionId,
        workspaceId: detail.workspaceId,
        title: detail.title,
        status: detail.status,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      },
    }),
    renameSession: async (input) => ({
      item: {
        sessionId: input.sessionId,
        workspaceId: detail.workspaceId,
        title: input.title.trim(),
        status: detail.status,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      },
    }),
    hideSession: async (_sessionId: string): Promise<DesktopConversationHideSessionResponse> => ({
      sessionId: detail.sessionId,
      hidden: true,
    }),
    saveWorkspaceSettings: async (
      input: DesktopConversationSaveWorkspaceSettingsInput,
    ): Promise<DesktopConversationSaveWorkspaceSettingsResponse> => ({
      workspaceId: input.workspaceId,
      version: 1,
      path: "",
      updatedAt: new Date(0).toISOString(),
      settings: createDefaultDesktopConversationWorkspaceSettings(),
      warnings: [],
      syncedSessionCount: 0,
    }),
    sendMessage: async (
      _input: DesktopConversationSendMessageInput,
    ): Promise<DesktopConversationSendMessageResponse> => ({
      detail,
    }),
    stopMessage: async (
      _input: DesktopConversationStopMessageInput,
    ): Promise<DesktopConversationStopMessageResponse> => ({
      detail,
      stopped: true,
    }),
    answerInteraction: async (
      _input: DesktopConversationAnswerInteractionInput,
    ): Promise<DesktopConversationInteractionReplyResponse> => ({
      detail,
    }),
    rejectInteraction: async (
      _input: DesktopConversationRejectInteractionInput,
    ): Promise<DesktopConversationInteractionReplyResponse> => ({
      detail,
    }),
  };
}

function createMockWorkspacePort(): Pick<DesktopWorkspacePort, "get" | "list" | "create"> {
  return {
    get: async () => null,
    list: async () => ({
      items: [],
      meta: {
        total: 0,
        limit: 0,
        offset: 0,
        hasMore: false,
      },
    }),
    create: async (input) => ({
      created: true,
      item: {
        workspaceId: input.workspaceId ?? "workspace-created",
        name: input.name ?? "workspace-created",
        directoryPath: input.directoryPath,
        isPinned: input.isPinned === true,
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  };
}

test("desktop wechat catalog aligns with latest capability baseline", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-catalog-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createMockConversationCommand(),
    createMockWorkspacePort(),
    createMockModelsQuery(),
  );

  const state = await service.getState();
  const descriptors = new Map(state.catalog.descriptors.map((item) => [item.kind, item]));

  expect(descriptors.get("formal_workspace_home")?.status).toBe("available");
  expect(descriptors.get("session_progress_snapshot")?.status).toBe("available");
  expect(descriptors.get("inbound_media_materialization")?.status).toBe("available");
  expect(descriptors.get("voice_transcode")?.status).toBe("partial");
  expect(descriptors.get("delivery_error_notice")?.status).toBe("partial");
  expect(descriptors.get("vision_analysis")?.status).toBe("partial");
  expect(descriptors.get("multimodal_message_input")?.status).toBe("available");
  expect(descriptors.get("vision_analysis")).toBeDefined();
  expect(descriptors.get("multimodal_message_input")).toBeDefined();
});
