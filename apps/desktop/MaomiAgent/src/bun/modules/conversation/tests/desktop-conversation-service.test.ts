import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { type AiTurnEvent, type AiTurnPort, type AiTurnRequest } from "#maomiagent/kernel/ai/contracts";
import { asToolCallId } from "#maomiagent/kernel/core";
import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";
import { projectConversationToolCall, type ToolCallRecord } from "../../ai/kernel-bridge";
import type { DesktopAiOneShotInput, DesktopAiOneShotResult } from "../../ai";

import { DesktopConfigurationService } from "../../configuration";
import { DesktopDatabaseService } from "../../database";
import { RuntimeLogsService } from "../../logs/implementation/services/runtime-logs-service";
import { RuntimeLogsStore } from "../../logs/implementation/stores/runtime-logs-store";
import { DesktopFeishuConversationCapabilityProvider } from "../../feishu/implementation/services/desktop-feishu-conversation-capability-provider";
import { DesktopMemoryConversationCapabilityProvider } from "../../memory/implementation/services/desktop-memory-conversation-capability-provider";
import { DesktopMcpConversationCapabilityProvider } from "../../mcp/implementation/services/desktop-mcp-conversation-capability-provider";
import { DesktopSkillsConversationCapabilityProvider } from "../../skills/implementation/services/desktop-skills-conversation-capability-provider";
import type { DesktopRuntimeContext } from "../../foundation";
import type { AgentItem } from "../../agents";
import { BUILTIN_MAOMI_AGENTS } from "../../agents/implementation/services/builtin-agents";
import type { DesktopConversationCapabilityProvider } from "../abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopConversationTaskBridgePort, DesktopTaskRecord, DesktopTasksQueryPort } from "../../tasks";
import {
  CONCISE_AGENT_ID,
  DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
  FULLY_MANAGED_AGENT_ID,
  WECHAT_AGENT_ID,
} from "../../../../shared/conversation/managed-execution";
import {
  createDefaultDesktopConversationWorkspaceSettings,
  type DesktopConversationRuntimeEventsUpdateEvent,
} from "../../../../shared/desktop-conversation";
import { createDesktopConversationBuiltinToolBundle } from "../implementation/services/desktop-conversation-builtin-tools";
import { DesktopConversationService } from "../implementation/services/desktop-conversation-service";
import { DesktopConversationStore } from "../implementation/stores/desktop-conversation-store";

class ScriptedDiagnosticTurnPort implements AiTurnPort {
  callCount = 0;
  readonly executionProfiles: AiTurnRequest["executionProfile"][] = [];
  readonly prompts: AiTurnRequest["prompt"][] = [];

  constructor(
    private readonly toolInput: Record<string, unknown> = {
      text: "diagnostic payload",
      requireApproval: true,
    },
    private readonly completionText = "Diagnostic completed",
  ) {}

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;
    this.executionProfiles.push(input.executionProfile);
    this.prompts.push(input.prompt);

    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (!hasToolResult) {
      yield { type: "text.start" };
      yield { type: "text.delta", delta: "Need approval" };
      yield { type: "text.end" };
      yield {
        type: "tool.call",
        toolCallId: asToolCallId(`tool_call_${this.callCount}`),
        toolName: "desktop_diagnostic",
        input: this.toolInput,
      };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: this.completionText };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedManagedTaskTurnPort implements AiTurnPort {
  callCount = 0;

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;

    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (!hasToolResult) {
      yield {
        type: "tool.call",
        toolCallId: asToolCallId(`tool_call_managed_${this.callCount}`),
        toolName: "maomi_managed_task",
        input: {
          action: "confirm_managed_task",
          objective: "Fix the failing deployment.",
          expectedOutcome: "Deployment passes consistently.",
          acceptanceCriteria: ["CI passes", "Smoke passes"],
          verificationPlan: {
            mode: "external",
            status: "pending",
            summary: "Wait for CI to pass.",
          },
          notificationPlan: {
            channel: "chat",
            summary: "Notify the operator when deployment is green.",
          },
          wrapUpCommands: ["bun test"],
        },
      };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Managed task confirmed" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedCapabilityToolTurnPort implements AiTurnPort {
  private callCount = 0;

  constructor(
    private readonly options: {
      toolName?: string;
      input?: Record<string, unknown>;
      completionText?: string;
      uniqueToolCallIds?: boolean;
    } = {},
  ) {}

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;
    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (!hasToolResult) {
      const toolCallId = this.options.uniqueToolCallIds
        ? `tool_call_capability_${this.callCount}`
        : "tool_call_capability_1";
      yield {
        type: "tool.call",
        toolCallId: asToolCallId(toolCallId),
        toolName: this.options.toolName ?? "workspace_capability_echo",
        input: this.options.input ?? {
          text: "capability payload",
        },
      };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: this.options.completionText ?? "Capability completed" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedPseudoToolMarkupTurnPort implements AiTurnPort {
  callCount = 0;

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;
    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (!hasToolResult) {
      yield { type: "text.start" };
      yield {
        type: "text.delta",
        delta: [
          "我先读取工作区状态。",
          "<tool_call>",
          "<function=workspace.read_file>",
          "<parameter=path>./package.json</parameter>",
          "</function>",
          "</tool_call>",
        ].join("\n"),
      };
      yield { type: "text.end" };
      yield { type: "finish", reason: "stop" };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Recovered pseudo tool call completed" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedRetryableFailureThenSuccessTurnPort implements AiTurnPort {
  callCount = 0;
  readonly prompts: AiTurnRequest["prompt"][] = [];

  constructor(
    private readonly options: {
      failuresBeforeSuccess?: number;
      errorCode?: string;
      errorMessage?: string;
    } = {},
  ) {}

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;
    this.prompts.push(input.prompt);

    const failuresBeforeSuccess = this.options.failuresBeforeSuccess ?? 1;
    if (this.callCount <= failuresBeforeSuccess) {
      yield {
        type: "error",
        error: {
          code: this.options.errorCode ?? "provider_runtime_timeout",
          message: this.options.errorMessage ?? "Temporary provider timeout",
          retryable: true,
          metadata: {
            retryAfterMs: 0,
          },
        },
      };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Retried successfully" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedStreamingTextTurnPort implements AiTurnPort {
  readonly prompts: AiTurnRequest["prompt"][] = [];

  constructor(
    private readonly gate: Promise<void>,
  ) {}

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.prompts.push(input.prompt);

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "hello " };
    if (input.signal?.aborted) {
      yield {
        type: "error",
        error: {
          code: "conversation_turn_aborted",
          message: "Desktop conversation reply was stopped.",
          retryable: false,
        },
      };
      return;
    }

    await Promise.race([
      this.gate,
      new Promise<void>((resolve) => {
        if (input.signal?.aborted) {
          resolve();
          return;
        }

        input.signal?.addEventListener("abort", () => resolve(), { once: true });
      }),
    ]);
    if (input.signal?.aborted) {
      yield {
        type: "error",
        error: {
          code: "conversation_turn_aborted",
          message: "Desktop conversation reply was stopped.",
          retryable: false,
        },
      };
      return;
    }
    yield { type: "text.delta", delta: "stream" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedConcurrentSessionTurnPort implements AiTurnPort {
  private callCount = 0;
  private firstCallStartedResolver: (() => void) | undefined;
  private releaseFirstCallResolver: (() => void) | undefined;
  private secondCallStartedResolver: (() => void) | undefined;
  readonly firstCallStarted = new Promise<void>((resolve) => {
    this.firstCallStartedResolver = resolve;
  });
  readonly secondCallStarted = new Promise<void>((resolve) => {
    this.secondCallStartedResolver = resolve;
  });

  releaseFirstCall() {
    this.releaseFirstCallResolver?.();
    this.releaseFirstCallResolver = undefined;
  }

  async *stream(): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;
    const callIndex = this.callCount;

    if (callIndex === 1) {
      this.firstCallStartedResolver?.();
      this.firstCallStartedResolver = undefined;
      yield { type: "text.start" };
      yield { type: "text.delta", delta: "session one waiting" };
      await new Promise<void>((resolve) => {
        this.releaseFirstCallResolver = resolve;
      });
      yield { type: "text.end" };
      yield { type: "finish", reason: "stop" };
      return;
    }

    this.secondCallStartedResolver?.();
    this.secondCallStartedResolver = undefined;
    yield { type: "text.start" };
    yield { type: "text.delta", delta: "session two completed" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedBlockedInteractionResumeTurnPort implements AiTurnPort {
  private callCount = 0;
  private releaseResumeResolver: (() => void) | undefined;
  private thirdCallStartedResolver: (() => void) | undefined;
  readonly thirdCallStarted = new Promise<void>((resolve) => {
    this.thirdCallStartedResolver = resolve;
  });

  releaseResume() {
    this.releaseResumeResolver?.();
    this.releaseResumeResolver = undefined;
  }

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.callCount += 1;

    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (this.callCount === 1 && !hasToolResult) {
      yield {
        type: "tool.call",
        toolCallId: asToolCallId("tool_call_blocked_interaction_1"),
        toolName: "desktop_diagnostic",
        input: {
          text: "blocked interaction payload",
          requireApproval: true,
        },
      };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }

    if (this.callCount === 2 && hasToolResult) {
      yield { type: "text.start" };
      yield { type: "text.delta", delta: "resume waiting" };
      await new Promise<void>((resolve) => {
        this.releaseResumeResolver = resolve;
      });
      yield { type: "text.end" };
      yield { type: "finish", reason: "stop" };
      return;
    }

    if (this.callCount >= 3) {
      this.thirdCallStartedResolver?.();
      this.thirdCallStartedResolver = undefined;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "independent session completed" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedCommandFailureRecoveryTurnPort implements AiTurnPort {
  readonly prompts: AiTurnRequest["prompt"][] = [];

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.prompts.push(input.prompt);

    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (!hasToolResult) {
      yield {
        type: "tool.call",
        toolCallId: asToolCallId("tool_call_command_failure_1"),
        toolName: "mock_command_execute",
        input: {
          command: "bun test",
        },
      };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Recovered after command failure" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedGenericToolFailureRecoveryTurnPort implements AiTurnPort {
  readonly prompts: AiTurnRequest["prompt"][] = [];

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.prompts.push(input.prompt);

    const hasToolResult = input.prompt.messages.some((message) =>
      message.message.role === "tool"
      || message.parts.some((part) => part.type === "tool_result_ref"));

    if (!hasToolResult) {
      yield {
        type: "tool.call",
        toolCallId: asToolCallId("tool_call_generic_failure_1"),
        toolName: "mock_generic_failure",
        input: {
          objective: "repair the failing task",
        },
      };
      yield { type: "finish", reason: "tool_calls" };
      return;
    }

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Recovered after generic tool failure" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class RecordingPromptTurnPort implements AiTurnPort {
  readonly requests: AiTurnRequest[] = [];
  readonly prompts: AiTurnRequest["prompt"][] = [];

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    this.requests.push(input);
    this.prompts.push(input.prompt);

    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Recorded prompt" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

class ScriptedUsageTurnPort implements AiTurnPort {
  async *stream(): AsyncIterable<AiTurnEvent> {
    yield {
      type: "usage",
      usage: {
        inputTokens: 3200,
        outputTokens: 480,
        reasoningTokens: 120,
      },
    };
    yield { type: "text.start" };
    yield { type: "text.delta", delta: "Usage tracked" };
    yield { type: "text.end" };
    yield { type: "finish", reason: "stop" };
  }
}

function createStaticToolSource(input: {
  sourceId: string;
  toolName: string;
  description?: string;
  metadata?: Record<string, unknown>;
}): ToolSource {
  return {
    async listTools() {
      return {
        source: {
          sourceId: input.sourceId,
          signature: `${input.sourceId}:${input.toolName}`,
        },
        tools: [{
          name: input.toolName,
          description: input.description ?? `${input.toolName} test descriptor`,
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          ...(input.metadata ? { metadata: input.metadata } : {}),
        }],
      };
    },
  };
}

function createRuntimeBackedConversationService(input: {
  tempPrefix: string;
  turnPort: AiTurnPort;
  contextWindow?: number;
  maxOutputTokens?: number;
  agentsList?: AgentItem[];
  aiOneShot?: {
    execute: (input: DesktopAiOneShotInput) => Promise<DesktopAiOneShotResult>;
  };
  taskBridge?: Partial<Pick<
    DesktopConversationTaskBridgePort,
    "archiveConversationSessionTasks"
    | "completeConversationTask"
    | "ensureConversationTaskRunning"
    | "failConversationTask"
    | "patchManagedConversationRootTask"
    | "syncManagedConversationRootTask"
    | "markConversationTaskBlocked"
  >>;
  tasksQuery?: Pick<DesktopTasksQueryPort, "get">;
  toolSources?: ToolSource[];
  toolHandlers?: RegisteredToolHandler[];
  capabilityProviders?: DesktopConversationCapabilityProvider[];
}) {
  const tempRoot = mkdtempSync(join(tmpdir(), input.tempPrefix));
  const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
  const database = new DesktopDatabaseService(configuration);
  const logs = new RuntimeLogsService(
    new RuntimeLogsStore(database.getConnection("runtimeLogs")),
  );
  const logger = logs.createLogger({
    source: "desktop",
    module: "desktop.conversation.runtime-interaction-test",
  });
  const service = new DesktopConversationService(
    new DesktopConversationStore(database.getConnection("conversation")),
    logger,
    {
      conversationDbPath: database.getConnection("conversation").path,
      agents: {
        async list() {
          return {
            items: input.agentsList ?? [],
            meta: {
              total: input.agentsList?.length ?? 0,
              limit: input.agentsList?.length ?? 0,
              offset: 0,
              hasMore: false,
            },
          };
        },
      },
      materializer: {
        async materialize(materializationInput) {
          return {
            executionProfile: {
              id: "desktop.openai.kimi.moonshot-v1-8k" as never,
              modelId: materializationInput.selectedModelId ?? "moonshot-v1-8k",
              metadata: {
                providerType: "openai",
                channelId: materializationInput.selectedChannelId ?? "kimi",
                modelId: materializationInput.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
                ...(materializationInput.scope ? { scope: materializationInput.scope } : {}),
                ...(materializationInput.workspaceId ? { workspaceId: materializationInput.workspaceId } : {}),
              },
            },
            runtimeSelector: {
              protocolFamily: "openai",
              apiStyle: "responses",
            },
            resolveServiceConfig: async () => ({
              apiKey: "sk-test",
              baseUrl: "https://moonshot.example/v1",
            }),
            target: {
              providerType: "openai",
              channelId: materializationInput.selectedChannelId ?? "kimi",
              modelId: materializationInput.selectedModelId ?? "moonshot-v1-8k",
              protocolFamily: "openai",
              apiStyle: "responses",
              contextWindow: input.contextWindow ?? 128_000,
              maxOutputTokens: input.maxOutputTokens ?? 8_192,
            },
          };
        },
      },
      aiRuntime: {
        createTurnPort() {
          return input.turnPort;
        },
      },
      aiOneShot: input.aiOneShot,
      taskBridge: input.taskBridge as Pick<
        DesktopConversationTaskBridgePort,
        "archiveConversationSessionTasks"
        | "completeConversationTask"
        | "ensureConversationTaskRunning"
        | "failConversationTask"
        | "patchManagedConversationRootTask"
        | "syncManagedConversationRootTask"
        | "markConversationTaskBlocked"
      > | undefined,
      tasksQuery: input.tasksQuery,
      capabilityProviders: input.capabilityProviders,
      toolSources: input.toolSources,
      toolHandlers: input.toolHandlers,
    },
  );

  return {
    service,
    logs,
    dispose() {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createRuntimeContext(tempRoot: string): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      registerHttpRoute() {
        return () => {};
      },
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    window: {
      title: "MaomiAgent Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: join(tempRoot, "logs.sqlite"),
            },
            workspace: {
              path: join(tempRoot, "workspace.sqlite"),
            },
            conversation: {
              path: join(tempRoot, "conversation.sqlite"),
            },
          },
        },
      },
    },
    createWindow() {
      throw new Error("not needed");
    },
    installProcessHandlers: false,
  };
}

function cleanupTempRoot(root: string) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch (error) {
    if (!isBusyCleanupError(error)) {
      throw error;
    }
  }
}

function isBusyCleanupError(error: unknown): error is { code: string } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown };
  return record.code === "EBUSY" || record.code === "EPERM";
}

function waitForValue<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function waitForSettledSessionDetail(
  service: DesktopConversationService,
  sessionId: string,
  label: string,
) {
  return waitForValue((async () => {
    while (true) {
      const detail = await service.getSessionDetail(sessionId);
      if (detail && detail.status !== "active") {
        return detail;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
    }
  })(), 1000, label);
}

describe("DesktopConversationService", () => {
  test("creates, lists and archives desktop conversation sessions", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Alpha session",
      });

      expect(created.created).toBe(true);
      expect(created.item).toMatchObject({
        workspaceId: "workspace-1",
        title: "Alpha session",
        status: "idle",
      });

      const listed = await service.listSessions({
        workspaceId: "workspace-1",
      });
      expect(listed.meta.total).toBe(1);
      expect(listed.items[0]?.sessionId).toBe(created.item.sessionId);

      const hidden = await service.hideSession(created.item.sessionId);
      expect(hidden).toEqual({
        sessionId: created.item.sessionId,
        hidden: true,
      });

      const archived = await service.getSession(created.item.sessionId);
      expect(archived).toMatchObject({
        sessionId: created.item.sessionId,
        status: "archived",
      });
      expect(archived?.archivedAt).toBeTruthy();
    } finally {
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("renames desktop conversation sessions", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-rename-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.rename-test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
      });

      const renamed = await service.renameSession({
        sessionId: created.item.sessionId,
        title: "  Fix login redirect race  ",
      });

      expect(renamed.item.title).toBe("Fix login redirect race");
      expect(await service.getSession(created.item.sessionId)).toMatchObject({
        sessionId: created.item.sessionId,
        title: "Fix login redirect race",
      });
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("archives linked session tasks through the task bridge", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-archive-bridge-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.archive-bridge-test",
    });
    const archivedTasks: Array<Record<string, unknown>> = [];
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        taskBridge: {
          async archiveConversationSessionTasks(input) {
            archivedTasks.push({ ...input });
          },
          async completeConversationTask() {
            return null;
          },
          async ensureConversationTaskRunning() {
            throw new Error("not used");
          },
          async failConversationTask() {
            return null;
          },
          async syncManagedConversationRootTask() {
            throw new Error("not used");
          },
          async markConversationTaskBlocked() {
            return null;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Archive bridge session",
      });

      const hidden = await service.hideSession(created.item.sessionId);
      expect(hidden).toEqual({
        sessionId: created.item.sessionId,
        hidden: true,
      });

      expect(archivedTasks).toHaveLength(1);
      expect(archivedTasks[0]).toMatchObject({
        workspaceId: "workspace-1",
        sessionId: created.item.sessionId,
      });
      expect(typeof archivedTasks[0]?.archivedAt).toBe("string");
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("defaults new desktop conversation sessions to concise mode", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-default-agent-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.default-agent-test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Default concise session",
      });

      expect(created.item.metadata).toMatchObject({
        selectedAgentId: DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
      });

      const stored = await service.getSession(created.item.sessionId);
      expect(stored?.metadata).toMatchObject({
        selectedAgentId: DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
      });
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("injects workspace settings defaults into new sessions and preserves explicit metadata overrides", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-workspace-defaults-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.workspace-defaults-test",
    });
    const defaults = createDefaultDesktopConversationWorkspaceSettings();
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        workspaceSettingsService: {
          async read({ workspaceId }) {
            return {
              workspaceId,
              version: 1,
              path: join(tempRoot, workspaceId, ".maomi", "chat", "settings.json"),
              exists: true,
              updatedAt: "2026-05-29T10:00:00.000Z",
              settings: {
                ...defaults,
                approvalAutoEnabled: false,
                contextCompressionThresholdPercent: 85,
                selectedChannelId: "openai",
                selectedModelId: "gpt-5",
                thinkingEnabled: false,
                managedExecutionEnabled: true,
                capabilityPreferences: {
                  ...defaults.capabilityPreferences,
                  "mcp.runtime": false,
                },
                permissionRules: [{
                  permission: "terminal.execute",
                  scope: "workspace",
                  decision: "approve_always",
                }],
              },
              warnings: [],
            };
          },
          async save() {
            throw new Error("not used");
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Workspace defaults",
        metadata: {
          selectedChannelId: "anthropic",
          selectedModelId: "claude-sonnet-4",
          conversationSettings: {
            thinkingEnabled: true,
            capabilityPreferences: {
              "skills.runtime": false,
            },
          },
        },
      });

      expect(created.item.metadata).toMatchObject({
        selectedAgentId: DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
        selectedChannelId: "anthropic",
        selectedModelId: "claude-sonnet-4",
        interactionGovernance: {
          approvalMode: "manual",
          permissionRules: [{
            permission: "terminal.execute",
            scope: "workspace",
            decision: "approve_always",
          }],
        },
        conversationSettings: {
          contextCompressionThresholdPercent: 85,
          managedExecutionEnabled: true,
          thinkingEnabled: true,
          memoryEnabled: true,
          sandboxEnabled: false,
          feishuSmartAssistantEnabled: false,
          capabilityPreferences: {
            "memory.runtime": true,
            "mcp.runtime": false,
            "skills.runtime": false,
            "feishu.smartAssistant": false,
          },
        },
      });
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("saves workspace settings and syncs existing sessions without rewriting historical model defaults", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-workspace-save-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.workspace-save-test",
    });
    const defaults = createDefaultDesktopConversationWorkspaceSettings();
    let persistedSettings = {
      ...defaults,
      selectedChannelId: "openai",
      selectedModelId: "gpt-5",
    };
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        workspaceSettingsService: {
          async read({ workspaceId }) {
            return {
              workspaceId,
              version: 1,
              path: join(tempRoot, workspaceId, ".maomi", "chat", "settings.json"),
              exists: true,
              updatedAt: "2026-05-29T10:15:00.000Z",
              settings: persistedSettings,
              warnings: [],
            };
          },
          async save({ workspaceId, patch }) {
            persistedSettings = {
              ...persistedSettings,
              ...patch,
              capabilityPreferences: {
                ...persistedSettings.capabilityPreferences,
                ...(patch.capabilityPreferences ?? {}),
              },
            };
            return {
              workspaceId,
              version: 1,
              path: join(tempRoot, workspaceId, ".maomi", "chat", "settings.json"),
              updatedAt: "2026-05-29T10:30:00.000Z",
              settings: persistedSettings,
              warnings: [],
              syncedSessionCount: 0,
            };
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Persisted defaults",
      });

      const saved = await service.saveWorkspaceSettings({
        workspaceId: "workspace-1",
        patch: {
          selectedChannelId: "anthropic",
          selectedModelId: "claude-sonnet-4",
          thinkingEnabled: false,
          capabilityPreferences: {
            "skills.runtime": false,
          },
        },
        syncExistingSessions: true,
      });

      const stored = await service.getSession(created.item.sessionId);

      expect(saved.syncedSessionCount).toBe(1);
      expect(saved.settings.selectedChannelId).toBe("anthropic");
      expect(saved.settings.selectedModelId).toBe("claude-sonnet-4");
      expect(stored?.metadata).toMatchObject({
        selectedChannelId: "openai",
        selectedModelId: "gpt-5",
        conversationSettings: {
          thinkingEnabled: false,
          capabilityPreferences: {
            "memory.runtime": true,
            "mcp.runtime": true,
            "skills.runtime": false,
            "feishu.smartAssistant": false,
          },
        },
      });
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("applies workspace settings to existing sessions in the selected workspace", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-settings-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.settings-test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
    );

    try {
      const alpha = await service.createSession({
        workspaceId: "workspace-1",
        title: "Alpha",
      });
      const beta = await service.createSession({
        workspaceId: "workspace-1",
        title: "Beta",
      });
      const other = await service.createSession({
        workspaceId: "workspace-2",
        title: "Other",
      });

      const applied = await service.applyWorkspaceSettings({
        workspaceId: "workspace-1",
        settings: {
          approvalMode: "manual",
          permissionRules: [{
            scope: "tool:workspace.write",
            permission: "workspace.write",
            decision: "approve_always",
            title: "Allow workspace writes",
            resourceSummary: "workspace files",
          }],
          contextCompressionThresholdPercent: 83,
          managedExecutionEnabled: true,
          thinkingEnabled: false,
          memoryEnabled: true,
          sandboxEnabled: false,
          feishuSmartAssistantEnabled: true,
          capabilityPreferences: {
            "memory.runtime": true,
            "feishu.smartAssistant": true,
            "skills.test": false,
          },
        },
      });

      expect(applied.totalCount).toBe(2);
      expect(applied.updatedCount).toBe(2);
      expect(applied.items.map((item) => item.sessionId).sort()).toEqual([
        alpha.item.sessionId,
        beta.item.sessionId,
      ].sort());

      const alphaDetail = await service.getSession(alpha.item.sessionId);
      const betaDetail = await service.getSession(beta.item.sessionId);
      const otherDetail = await service.getSession(other.item.sessionId);

      expect(alphaDetail?.metadata).toMatchObject({
        interactionGovernance: {
          approvalMode: "manual",
          permissionRules: [{
            scope: "tool:workspace.write",
            permission: "workspace.write",
            decision: "approve_always",
            title: "Allow workspace writes",
            resourceSummary: "workspace files",
          }],
        },
        conversationSettings: {
          contextCompressionThresholdPercent: 85,
          managedExecutionEnabled: true,
          thinkingEnabled: false,
          memoryEnabled: true,
          sandboxEnabled: false,
          feishuSmartAssistantEnabled: true,
          capabilityPreferences: {
            "memory.runtime": true,
            "feishu.smartAssistant": true,
            "skills.test": false,
          },
        },
      });
      expect(betaDetail?.metadata).toMatchObject({
        interactionGovernance: {
          approvalMode: "manual",
          permissionRules: [{
            scope: "tool:workspace.write",
            permission: "workspace.write",
            decision: "approve_always",
            title: "Allow workspace writes",
            resourceSummary: "workspace files",
          }],
        },
        conversationSettings: {
          contextCompressionThresholdPercent: 85,
          managedExecutionEnabled: true,
          thinkingEnabled: false,
          memoryEnabled: true,
          sandboxEnabled: false,
          feishuSmartAssistantEnabled: true,
          capabilityPreferences: {
            "memory.runtime": true,
            "feishu.smartAssistant": true,
            "skills.test": false,
          },
        },
      });
      expect(otherDetail?.metadata).toMatchObject({
        selectedAgentId: DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
      });
      expect(otherDetail?.metadata?.interactionGovernance).toBeUndefined();
      expect(otherDetail?.metadata?.conversationSettings).toBeUndefined();
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("lists registered conversation capabilities through the registry seam", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-capabilities-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.capabilities-test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        capabilityRegistry: {
          async listCapabilities(input) {
            expect(input).toEqual({
              workspaceId: "workspace-1",
            });

            return {
              items: [{
                capabilityId: "memory.runtime",
                moduleId: "desktop.memory",
                scope: "workspace",
                controlKind: "toggle",
                title: "启用记忆",
                description: "memory",
              }],
              updatedAt: "2026-05-05T00:00:00.000Z",
            };
          },
        },
      },
    );

    try {
      await expect(service.listCapabilities({ workspaceId: "workspace-1" })).resolves.toEqual({
        items: [{
          capabilityId: "memory.runtime",
          moduleId: "desktop.memory",
          scope: "workspace",
          controlKind: "toggle",
          title: "启用记忆",
          description: "memory",
        }],
        updatedAt: "2026-05-05T00:00:00.000Z",
      });
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("applies workspace settings without overwriting managed runtime metadata", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-settings-managed-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.settings-managed-test",
    });
    const store = new DesktopConversationStore(database.getConnection("conversation"));
    const service = new DesktopConversationService(store, logger);

    try {
      const now = "2026-05-05T00:00:00.000Z";
      store.upsertSession({
        sessionId: "managed-session-1",
        workspaceId: "workspace-1",
        title: "Managed",
        status: "active",
        createdAt: now,
        updatedAt: now,
        metadata: {
          managedExecution: true,
          linkedRootTaskId: "managed-root-managed-session-1",
          managedExecutionStage: "running",
          phase: "executing_plan",
          interactionGovernance: {
            approvalMode: "auto",
            permissionRules: [{
              scope: "demo-scope",
              permission: "desktop.diagnostic.run",
              decision: "approve_always",
              updatedAt: 123,
            }],
          },
        },
      });

      const applied = await service.applyWorkspaceSettings({
        workspaceId: "workspace-1",
        settings: {
          approvalMode: "manual",
          contextCompressionThresholdPercent: 70,
          managedExecutionEnabled: false,
        },
      });

      expect(applied.totalCount).toBe(1);
      expect(applied.updatedCount).toBe(1);

      const updated = await service.getSession("managed-session-1");
      expect(updated?.metadata).toMatchObject({
        managedExecution: true,
        linkedRootTaskId: "managed-root-managed-session-1",
        managedExecutionStage: "running",
        phase: "executing_plan",
        interactionGovernance: {
          approvalMode: "manual",
          permissionRules: [{
            scope: "demo-scope",
            permission: "desktop.diagnostic.run",
            decision: "approve_always",
            updatedAt: 123,
          }],
        },
        conversationSettings: {
          contextCompressionThresholdPercent: 70,
          managedExecutionEnabled: false,
        },
      });
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("auto-approves permission interactions when approval mode is set to auto", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-approval-auto-",
      turnPort: new ScriptedDiagnosticTurnPort(),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Auto approval session",
        metadata: {
          interactionGovernance: {
            approvalMode: "auto",
          },
        },
      });

      const response = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(response.detail.status).toBe("idle");
      expect(response.detail.pendingInteractions).toHaveLength(0);
      expect(response.detail.toolCalls.some((item) => item.status === "completed")).toBe(true);
      expect(response.detail.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Diagnostic completed"))).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("auto-generates a title after the first assistant reply for placeholder sessions", async () => {
    const aiOneShotCalls: DesktopAiOneShotInput[] = [];
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-auto-title-",
      turnPort: new ScriptedUsageTurnPort(),
      aiOneShot: {
        async execute(input) {
          aiOneShotCalls.push(input);
          return {
            sessionId: "one-shot-session",
            runId: "one-shot-run",
            turnId: "one-shot-turn",
            content: "排查登录回调超时",
            reasoning: [],
            target: {
              providerType: "openai",
              channelId: input.selectedChannelId ?? "kimi",
              modelId: input.selectedModelId ?? "moonshot-v1-8k",
            },
          } as unknown as DesktopAiOneShotResult;
        },
      },
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "帮我排查登录回调为什么偶发超时",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(aiOneShotCalls).toHaveLength(1);
      expect(result.detail.title).toBe("排查登录回调超时");
      expect(result.detail.metadata).toMatchObject({
        autoTitleAttemptedAt: expect.any(String),
        autoTitleGeneratedAt: expect.any(String),
      });
      expect(await fixture.service.getSession(created.item.sessionId)).toMatchObject({
        title: "排查登录回调超时",
      });
    } finally {
      fixture.dispose();
    }
  });

  test("does not overwrite a user-provided session title when sending the first reply", async () => {
    const aiOneShotCalls: DesktopAiOneShotInput[] = [];
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-auto-title-skip-",
      turnPort: new ScriptedUsageTurnPort(),
      aiOneShot: {
        async execute(input) {
          aiOneShotCalls.push(input);
          return {
            sessionId: "one-shot-session",
            runId: "one-shot-run",
            turnId: "one-shot-turn",
            content: "Should not be used",
            reasoning: [],
            target: {
              providerType: "openai",
              channelId: input.selectedChannelId ?? "kimi",
              modelId: input.selectedModelId ?? "moonshot-v1-8k",
            },
          } as unknown as DesktopAiOneShotResult;
        },
      },
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Custom title",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "帮我排查登录回调为什么偶发超时",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(aiOneShotCalls).toHaveLength(0);
      expect(result.detail.title).toBe("Custom title");
      expect(result.detail.metadata?.autoTitleAttemptedAt).toBeUndefined();
    } finally {
      fixture.dispose();
    }
  });

  test("injects saved conversation settings into runtime system blocks", async () => {
    const turnPort = new ScriptedDiagnosticTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-runtime-settings-",
      turnPort,
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Runtime settings session",
        metadata: {
          interactionGovernance: {
            approvalMode: "manual",
          },
          conversationSettings: {
            contextCompressionThresholdPercent: 85,
            managedExecutionEnabled: true,
            memoryEnabled: true,
            sandboxEnabled: false,
            feishuSmartAssistantEnabled: true,
          },
        },
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      const settingsBlock = turnPort.prompts[0]?.systemBlocks.find((block) =>
        block.metadata?.source === "desktop.runtime.settings");

      expect(settingsBlock?.content).toContain("Approval mode: manual");
      expect(settingsBlock?.content).toContain("Context compression preference: 85%");
      expect(settingsBlock?.content).toContain("Managed execution default: enabled");
      expect(settingsBlock?.content).toContain("Memory MCP default: enabled");
      expect(settingsBlock?.content).toContain("Sandbox mode default: disabled");
      expect(settingsBlock?.content).toContain("Feishu capability default: enabled");
    } finally {
      fixture.dispose();
    }
  });

  test("executes capability provider tools when enabled in session settings", async () => {
    const capabilityDescriptor = {
      name: "workspace_capability_echo",
      description: "Echoes capability payload for runtime contribution tests.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    };
    const capabilityProvider: DesktopConversationCapabilityProvider = {
      async listCapabilities() {
        return [];
      },
      async resolveRuntimeContribution(input) {
        const conversationSettings = input.sessionMetadata?.conversationSettings;
        const capabilityPreferences = (
          conversationSettings
          && typeof conversationSettings === "object"
          && !Array.isArray(conversationSettings)
          && (conversationSettings as Record<string, unknown>).capabilityPreferences
          && typeof (conversationSettings as Record<string, unknown>).capabilityPreferences === "object"
          && !Array.isArray((conversationSettings as Record<string, unknown>).capabilityPreferences)
        )
          ? (conversationSettings as Record<string, unknown>).capabilityPreferences as Record<string, unknown>
          : undefined;
        if (capabilityPreferences?.["test.echo"] !== true) {
          return undefined;
        }

        const toolSource: ToolSource = {
          async listTools() {
            return {
              source: {
                sourceId: "test.capability-provider",
                signature: "test-echo-v1",
              },
              tools: [capabilityDescriptor],
            };
          },
        };
        const toolHandler: RegisteredToolHandler = {
          descriptor: capabilityDescriptor,
          async execute({ call, context }) {
            return {
              echoed: (call.input as Record<string, unknown>).text,
              workspaceId: context.session.metadata?.workspaceId,
            };
          },
        };

        return {
          toolSources: [toolSource],
          toolHandlers: [toolHandler],
        };
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-capability-runtime-",
      turnPort: new ScriptedCapabilityToolTurnPort(),
      capabilityProviders: [capabilityProvider],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Capability runtime session",
        metadata: {
          workspaceId: "workspace-1",
          conversationSettings: {
            capabilityPreferences: {
              "test.echo": true,
            },
          },
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the capability tool",
      });

      expect(result.detail.toolCalls.some((item) =>
        item.toolName === "workspace_capability_echo" && item.status === "completed")).toBe(true);
      expect(result.detail.toolCalls.find((item) => item.toolName === "workspace_capability_echo")?.output)
        .toEqual(expect.objectContaining({
          echoed: "capability payload",
          workspaceId: "workspace-1",
        }));
    } finally {
      fixture.dispose();
    }
  });

  test("recovers provider text pseudo tool calls and continues the agent loop", async () => {
    const turnPort = new ScriptedPseudoToolMarkupTurnPort();
    const workspaceReadDescriptor = {
      name: "workspace_read_file",
      description: "Reads a workspace file for pseudo tool-call recovery tests.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-pseudo-tool-recovery-",
      turnPort,
      toolSources: [createStaticToolSource({
        sourceId: "mock-workspace-source",
        toolName: "workspace_read_file",
      })],
      toolHandlers: [{
        descriptor: workspaceReadDescriptor,
        async execute({ call }) {
          return {
            path: (call.input as Record<string, unknown>).path,
            text: "{\"name\":\"maomiagent-test\"}",
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Pseudo tool recovery session",
      });

      const sent = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "读取 package.json 后继续回答",
        scope: "workspace",
        selectedChannelId: "xiaomi",
        selectedModelId: "mimo-v2.5-pro",
      });

      const assistantText = sent.detail.messages.flatMap((message) =>
        message.role === "assistant"
          ? message.parts.flatMap((part) => part.type === "text" ? [part.text] : [])
          : []).join("\n");

      expect(turnPort.callCount).toBe(2);
      expect(sent.detail.status).toBe("idle");
      expect(sent.detail.toolCalls).toHaveLength(1);
      expect(sent.detail.toolCalls[0]).toEqual(expect.objectContaining({
        toolName: "workspace_read_file",
        status: "completed",
        input: {
          path: "./package.json",
        },
      }));
      expect(assistantText).toContain("Recovered pseudo tool call completed");
      expect(assistantText).not.toContain("<tool_call>");
    } finally {
      fixture.dispose();
    }
  });

  test("hides builtin workspace tools for standalone go example asks", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-lightweight-standalone-",
      turnPort,
      toolSources: [createStaticToolSource({
        sourceId: "builtin.desktop.conversation",
        toolName: "workspace_write_file",
      })],
    });

    try {
      for (const text of [
        "使用 GO 写一个哈希算法代码示例",
        "使用 go 写一个 http 服务器支持静态文件",
      ]) {
        const created = await fixture.service.createSession({
          workspaceId: "workspace-1",
          title: "Standalone coding session",
        });

        await fixture.service.sendMessage({
          sessionId: created.item.sessionId,
          text,
        });
      }

      expect(turnPort.requests).toHaveLength(2);
      expect(turnPort.prompts).toHaveLength(2);
      for (const request of turnPort.requests) {
        expect(request.settings.toolChoice).toBe("none");
      }
      for (const prompt of turnPort.prompts) {
        expect(prompt.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content)
          .toContain("No tools are currently available in this turn.");
      }
    } finally {
      fixture.dispose();
    }
  });

  test("keeps concise agent builtin tools for explicit scaffolding asks", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-concise-agent-",
      turnPort,
      toolSources: [createStaticToolSource({
        sourceId: "builtin.desktop.conversation",
        toolName: "workspace_write_file",
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Concise coding session",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "帮我创建一个 Go 项目骨架，并把哈希算法跑起来",
        selectedAgentId: CONCISE_AGENT_ID,
      });

      expect(turnPort.requests).toHaveLength(1);
      expect(turnPort.requests[0]?.settings.toolChoice).toBe("auto");
      expect(turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content)
        .toContain("workspace_write_file");
    } finally {
      fixture.dispose();
    }
  });

  test("keeps builtin workspace tools for explicit local repair asks", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-lightweight-local-repair-",
      turnPort,
      toolSources: [createStaticToolSource({
        sourceId: "builtin.desktop.conversation",
        toolName: "workspace_write_file",
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Workspace repair session",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "修一下当前聊天页的停止按钮，直接改本地代码并验证。",
      });

      expect(turnPort.requests[0]?.settings.toolChoice).toBe("auto");
      expect(turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content)
        .toContain("workspace_write_file");
    } finally {
      fixture.dispose();
    }
  });

  test("publishes file editing policy when terminal and file write tools are both available", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-file-tool-policy-",
      turnPort,
      toolSources: [
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_write_file",
          metadata: {
            operationKind: "file_write",
          },
        }),
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "terminal_execute",
          metadata: {
            operationKind: "tool_execution",
          },
        }),
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "File edit policy session",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "直接修改当前工作区的本地代码文件并验证结果。",
      });

      const toolsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content;
      expect(toolsBlock).toContain("workspace_write_file");
      expect(toolsBlock).toContain("terminal_execute");
      expect(toolsBlock).toContain("Tool usage policy:");
      expect(toolsBlock).toContain("Prefer dedicated file-edit tools for creating or updating workspace files in one operation.");
      expect(toolsBlock).toContain("do not use terminal commands to assemble file contents line by line");
    } finally {
      fixture.dispose();
    }
  });

  test("preserves non-builtin capability tools in lightweight turns", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-lightweight-capability-",
      turnPort,
      toolSources: [
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_write_file",
        }),
        createStaticToolSource({
          sourceId: "test.capability-provider",
          toolName: "workspace_capability_echo",
        }),
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Lightweight capability session",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "使用 GO 写一个哈希算法",
      });

      expect(turnPort.requests[0]?.settings.toolChoice).toBe("auto");
      const toolsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content;
      expect(toolsBlock).toContain("workspace_capability_echo");
      expect(toolsBlock).not.toContain("workspace_write_file");
    } finally {
      fixture.dispose();
    }
  });

  test("hides plan-only document writers during ordinary execution turns", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-hide-plan-doc-write-",
      turnPort,
      toolSources: [
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_write_file",
          metadata: {
            operationKind: "file_write",
          },
        }),
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_write_document",
          metadata: {
            operationKind: "file_write",
            planModeAccess: "document_write",
            planModeOnly: true,
          },
        }),
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Ordinary execution session",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "直接修改 .gitea/workflows/build.yml 并整理构建流程。",
      });

      const toolsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content;
      expect(toolsBlock).toContain("workspace_write_file");
      expect(toolsBlock).not.toContain("workspace_write_document");
    } finally {
      fixture.dispose();
    }
  });

  test("shows planning tools in plan mode and publishes the plan workflow block", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-tools-",
      turnPort,
      toolSources: [
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_read_file",
          metadata: {
            operationKind: "file_read",
            planModeAccess: "read",
          },
        }),
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_write_file",
          metadata: {
            operationKind: "file_write",
          },
        }),
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_write_document",
          metadata: {
            operationKind: "file_write",
            planModeAccess: "document_write",
          },
        }),
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "maomi_managed_task",
          metadata: {
            operationKind: "tool_execution",
            planModeAccess: "task_write",
          },
        }),
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "terminal_execute",
          metadata: {
            operationKind: "tool_execution",
            planModeAccess: "readonly_command",
          },
        }),
        createStaticToolSource({
          sourceId: "test.capability-provider",
          toolName: "workspace_capability_echo",
          metadata: {
            operationKind: "tool_execution",
          },
        }),
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan mode session",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先规划发布说明文档和任务拆解，不要直接改代码。",
        composerMode: "plan",
      });

      const toolsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content;
      const planBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.plan-mode")?.content;
      const settingsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.settings")?.content;
      expect(turnPort.requests[0]?.settings.toolChoice).toBe("auto");
      expect(toolsBlock).toContain("plan_write");
      expect(toolsBlock).toContain("plan_exit");
      expect(toolsBlock).toContain("workspace_read_file");
      expect(toolsBlock).toContain("workspace_write_document");
      expect(toolsBlock).toContain("terminal_execute");
      expect(toolsBlock).not.toContain("maomi_managed_task");
      expect(toolsBlock).not.toContain("workspace_write_file");
      expect(toolsBlock).not.toContain("workspace_capability_echo");
      expect(planBlock).toContain("# Plan Mode - System Reminder");
      expect(planBlock).toContain("plan_write");
      expect(planBlock).toContain("plan_exit");
      expect(planBlock).toContain("docs/**");
      expect(planBlock).toContain("### Phase 1: Initial Understanding");
      expect(planBlock).toContain("### Phase 2: Architecture and Module Design");
      expect(planBlock).toContain("### Phase 3: Implementation Breakdown");
      expect(planBlock).toContain("### Phase 4: Final Plan");
      expect(planBlock).toContain("Task Breakdown");
      expect(planBlock).toContain("feature-scoped work");
      expect(planBlock).toContain("dependency list or component list alone is not a valid final plan");
      expect(planBlock).toContain("Do not create directories");
      expect(planBlock).toContain("### Completion Rule");
      expect(settingsBlock).toContain("Composer mode: plan");
      expect(settingsBlock).toContain("Plan mode policy:");
    } finally {
      fixture.dispose();
    }
  });

  test("does not inject the selected agent prompt into plan mode turns", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-agent-prompt-",
      turnPort,
      agentsList: [{
        agentId: "agent-1",
        name: "Execution Agent",
        description: "Execution-first agent",
        mode: "primary",
        enabled: true,
        version: "1",
        source: "user-custom",
        prompt: "You are an execution-first agent. Start implementing immediately.",
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
      }],
      toolSources: [
        createStaticToolSource({
          sourceId: "builtin.desktop.conversation",
          toolName: "workspace_read_file",
          metadata: {
            operationKind: "file_read",
            planModeAccess: "read",
          },
        }),
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan mode agent suppression session",
        selectedAgentId: "agent-1",
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先做规划，不要直接实现。",
        composerMode: "plan",
        selectedAgentId: "agent-1",
      });

      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.agent"
        && block.metadata?.agentId === "agent-1")).toBe(false);
      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.runtime.plan-mode")).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("blocks code-writing tools during plan mode even if the model calls them directly", async () => {
    const writeDescriptor = {
      name: "workspace_write_file",
      description: "Write a workspace file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "file_write",
        operationLabel: "Write workspace file",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-block-write-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "workspace_write_file",
        input: {
          path: "src/index.ts",
          content: "export const blocked = true;\n",
        },
        completionText: "Plan mode finished after blocked write",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:workspace_write_file",
            },
            tools: [writeDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: writeDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              ok: true,
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan blocked write session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先规划修复方案，再决定是否落地。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("failed");
      expect(result.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "plan_mode_tool_blocked",
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("blocks managed task tools during ordinary plan mode even if the model calls them directly", async () => {
    const managedDescriptor = {
      name: "maomi_managed_task",
      description: "Update managed execution state",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string" },
        },
        required: ["action"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "tool_execution",
        operationLabel: "Managed task",
        planModeAccess: "task_write",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-block-managed-task-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "maomi_managed_task",
        input: {
          action: "confirm_managed_task",
        },
        completionText: "Plan mode finished after blocked managed task",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:maomi_managed_task",
            },
            tools: [managedDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: managedDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              ok: true,
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan blocked managed task session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先做方案梳理，不要接管执行。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("failed");
      expect(result.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "plan_mode_tool_blocked",
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("allows workspace inspection tools during plan mode", async () => {
    const readDescriptor = {
      name: "workspace_read_file",
      description: "Read a workspace file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "file_read",
        operationLabel: "Read workspace file",
        planModeAccess: "read",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-read-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "workspace_read_file",
        input: {
          path: "src/index.ts",
        },
        completionText: "Plan mode finished after readonly inspection",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:workspace_read_file",
            },
            tools: [readDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: readDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              content: "export const inspected = true;\n",
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan blocked read session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先出方案，不要读取本地代码。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("completed");
    } finally {
      fixture.dispose();
    }
  });

  test("injects the stored plan artifact into prompt context blocks", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-context-",
      turnPort,
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan artifact session",
        metadata: {
          planState: {
            content: "# Plan\n- Audit the runtime\n- Validate the tests",
            updatedAt: "2026-05-07T00:00:00.000Z",
            status: "draft",
          },
        },
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "继续完善这个计划。",
        composerMode: "plan",
      });

      const planArtifactBlock = turnPort.prompts[0]?.contextBlocks.find((block) =>
        block.metadata?.source === "desktop.runtime.plan-artifact")?.content;
      expect(planArtifactBlock).toContain("Plan artifact:");
      expect(planArtifactBlock).toContain("# Plan");
      expect(planArtifactBlock).toContain("Audit the runtime");
    } finally {
      fixture.dispose();
    }
  });

  test("writes the plan artifact through the internal plan_write tool", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-write-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "plan_write",
        input: {
          content: "# Plan\n- Fix the runtime\n- Re-run targeted tests",
        },
        completionText: "Plan artifact stored",
      }),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan write session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先把执行计划写下来。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls.find((item) => item.toolName === "plan_write")?.status).toBe("completed");
      expect((result.detail.metadata?.planState as Record<string, unknown> | undefined)?.content).toBe(
        "# Plan\n- Fix the runtime\n- Re-run targeted tests",
      );
      expect((result.detail.metadata?.planState as Record<string, unknown> | undefined)?.status).toBe("draft");
    } finally {
      fixture.dispose();
    }
  });

  test("plan_exit asks for approval and switches the session back to agent mode", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-exit-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "plan_exit",
        input: {},
        completionText: "Plan approval handled",
      }),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan exit session",
        metadata: {
          planState: {
            content: [
              "# Plan",
              "## Goals & Constraints",
              "- Finalize the runtime changes without leaving plan mode early.",
              "## Architecture",
              "- Keep plan approval inside the desktop conversation runtime.",
              "## Module Design",
              "- Runtime service owns plan validation and approval flow.",
              "## Implementation Steps",
              "1. Validate the stored plan artifact.",
              "2. Request approval through plan_exit.",
              "## Task Breakdown",
              "- Update the runtime guard.",
              "- Update the regression tests.",
              "## Validation",
              "- Run the desktop conversation test suite.",
            ].join("\n"),
            updatedAt: "2026-05-07T00:00:00.000Z",
            status: "draft",
          },
        },
      });

      const blocked = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "计划已经准备好了，申请退出 plan 模式。",
        composerMode: "plan",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.pendingInteractions[0]?.request.kind).toBe("question");

      const resumed = await fixture.service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "question",
          answers: [{
            questionId: "plan_exit_decision",
            values: ["approve"],
          }],
        },
      });

      expect(resumed.detail.pendingInteractions).toHaveLength(0);
      expect(resumed.detail.metadata?.composerMode).toBe("agent");
      expect((resumed.detail.metadata?.planState as Record<string, unknown> | undefined)?.status).toBe("approved");
      expect(resumed.detail.toolCalls.find((item) => item.toolName === "plan_exit")?.output).toEqual(expect.objectContaining({
        composerMode: "agent",
        exitedPlanMode: true,
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("plan_exit keep planning resumes in plan mode instead of completing the conversation", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-keep-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "plan_exit",
        input: {},
        completionText: "继续完善计划。",
        uniqueToolCallIds: true,
      }),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan keep session",
        metadata: {
          planState: {
            content: [
              "# Plan",
              "## Goals & Constraints",
              "- Continue refining the rollout plan before execution.",
              "## Architecture",
              "- Keep planning state in the desktop conversation session metadata.",
              "## Module Design",
              "- plan_exit handles approval while plan_write keeps replacing the artifact.",
              "## Implementation Steps",
              "1. Review the current plan sections.",
              "2. Keep refining until the user approves exiting plan mode.",
              "## Task Breakdown",
              "- Inspect the current plan artifact.",
              "- Add missing rollout details.",
              "## Validation",
              "- Re-run the focused plan-mode regression tests.",
            ].join("\n"),
            updatedAt: "2026-05-07T00:00:00.000Z",
            status: "draft",
          },
          composerMode: "plan",
        },
      });

      const blocked = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先别退出，继续规划。",
        composerMode: "plan",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);

      const resumed = await fixture.service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "question",
          answers: [{
            questionId: "plan_exit_decision",
            values: ["continue_planning"],
          }],
        },
      });

      const planExitCall = [...resumed.detail.toolCalls]
        .reverse()
        .find((item) => item.toolName === "plan_exit");

      expect(resumed.detail.pendingInteractions).toHaveLength(0);
      expect(resumed.detail.metadata?.composerMode).toBe("plan");
      expect((resumed.detail.metadata?.planState as Record<string, unknown> | undefined)?.status).toBe("draft");
      expect(planExitCall?.status).toBe("failed");
      expect(planExitCall?.error?.code).toBe("plan_exit_rejected");
    } finally {
      fixture.dispose();
    }
  });

  test("plan_exit blocks incomplete plan artifacts that only list lightweight notes", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-incomplete-exit-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "plan_exit",
        input: {},
        completionText: "继续完善计划结构。",
      }),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan incomplete exit session",
        metadata: {
          planState: {
            content: "# Plan\n## Tech Stack\n- Vue\n- Socket.IO\n- SQLite",
            updatedAt: "2026-05-07T00:00:00.000Z",
            status: "draft",
          },
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "我觉得计划差不多了，准备退出 plan 模式。",
        composerMode: "plan",
      });

      expect(result.detail.pendingInteractions).toHaveLength(0);
      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("failed");
      expect(result.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "plan_artifact_incomplete",
        metadata: expect.objectContaining({
          missingSections: expect.arrayContaining([
            "goals_constraints",
            "impact_scope",
            "implementation_steps",
            "task_breakdown",
            "validation",
          ]),
        }),
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("plan_exit allows structured feature plans without full-project headings", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-feature-exit-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "plan_exit",
        input: {},
        completionText: "Feature plan approval handled",
      }),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan feature exit session",
        metadata: {
          planState: {
            content: [
              "# Plan",
              "## Goals & Constraints",
              "- Add spectator presence to the existing gomoku room flow without rebuilding the app.",
              "## Affected Surfaces",
              "- Match room page, room session store, websocket room gateway, spectator counter payload.",
              "## Responsibility Boundaries",
              "- Frontend renders room state, gateway broadcasts presence, and the game service stays move-authoritative.",
              "## Implementation Steps",
              "1. Extend the room payload with spectator presence.",
              "2. Update the room UI to show spectators and live joins or leaves.",
              "## Task Breakdown",
              "- Patch websocket event schema.",
              "- Update store selectors and UI badges.",
              "## Validation",
              "- Verify two players and one spectator can see the same board state live.",
            ].join("\n"),
            updatedAt: "2026-05-08T00:00:00.000Z",
            status: "draft",
          },
        },
      });

      const blocked = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "这个功能计划已经可以申请审批了。",
        composerMode: "plan",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.pendingInteractions[0]?.request.kind).toBe("question");
      expect(blocked.detail.toolCalls.find((item) => item.toolName === "plan_exit")?.status).toBe("blocked");
    } finally {
      fixture.dispose();
    }
  });

  test("plan_exit accepts execution checklist sections as task breakdown evidence", async () => {
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-checklist-exit-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "plan_exit",
        input: {},
        completionText: "Checklist plan approval handled",
      }),
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan checklist exit session",
        metadata: {
          planState: {
            content: [
              "# Plan",
              "## Goals & Constraints",
              "- Stabilize plan mode without weakening approval quality.",
              "## Architecture",
              "- Runtime keeps approval gating in the desktop plan tool layer.",
              "## Affected Surfaces",
              "- Plan validator, plan-mode reminder block, provider timeout handling.",
              "## Implementation Steps",
              "1. Broaden task-breakdown recognition for checklist-style plans.",
              "2. Reduce false provider timeout failures during long plan recoveries.",
              "## Execution Checklist",
              "- Patch the validator synonyms.",
              "- Update the timeout default.",
              "- Re-run focused conversation tests.",
              "## Validation",
              "- Exercise incomplete and structured plan_exit regression tests.",
            ].join("\n"),
            updatedAt: "2026-05-08T00:00:00.000Z",
            status: "draft",
          },
        },
      });

      const blocked = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "这个计划可以申请审批了。",
        composerMode: "plan",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.toolCalls.find((item) => item.toolName === "plan_exit")?.status).toBe("blocked");
    } finally {
      fixture.dispose();
    }
  });

  test("allows docs workspace document writes during plan mode", async () => {
    const documentDescriptor = {
      name: "workspace_write_document",
      description: "Write a workspace document",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "file_write",
        operationLabel: "Write workspace document",
        planModeAccess: "document_write",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-block-document-write-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "workspace_write_document",
        input: {
          path: "docs/plan.md",
          content: "# plan\n",
        },
        completionText: "Plan mode finished after blocked document write",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:workspace_write_document",
            },
            tools: [documentDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: documentDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              ok: true,
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan blocked document write session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先整理计划，并把说明写到 docs 里。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("completed");
    } finally {
      fixture.dispose();
    }
  });

  test("blocks non-doc workspace document writes during plan mode", async () => {
    const documentDescriptor = {
      name: "workspace_write_document",
      description: "Write a workspace document",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "file_write",
        operationLabel: "Write workspace document",
        planModeAccess: "document_write",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-block-nondoc-document-write-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "workspace_write_document",
        input: {
          path: "src/plan.md",
          content: "# plan\n",
        },
        completionText: "Plan mode finished after blocked non-doc document write",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:workspace_write_document",
            },
            tools: [documentDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: documentDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              ok: true,
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan blocked non-doc document write session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先整理计划，但不要改业务代码目录。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("failed");
      expect(result.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "plan_mode_document_write_blocked",
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("allows non-mutating terminal commands during plan mode", async () => {
    const terminalDescriptor = {
      name: "terminal_execute",
      description: "Execute a terminal command",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          command: { type: "string" },
        },
        required: ["sessionId", "command"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "tool_execution",
        operationLabel: "Execute terminal command",
        planModeAccess: "readonly_command",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-allow-command-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "terminal_execute",
        input: {
          sessionId: "term_1",
          command: "node -v",
        },
        completionText: "Plan mode finished after investigation command",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:terminal_execute",
            },
            tools: [terminalDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: terminalDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              ok: true,
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan allowed command session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先检查运行环境版本。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("completed");
    } finally {
      fixture.dispose();
    }
  });

  test("blocks mutating terminal commands during plan mode", async () => {
    const terminalDescriptor = {
      name: "terminal_execute",
      description: "Execute a terminal command",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          command: { type: "string" },
        },
        required: ["sessionId", "command"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "tool_execution",
        operationLabel: "Execute terminal command",
        planModeAccess: "readonly_command",
      },
    };
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-plan-block-command-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "terminal_execute",
        input: {
          sessionId: "term_1",
          command: "git status > out.txt",
        },
        completionText: "Plan mode finished after blocked command",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:terminal_execute",
            },
            tools: [terminalDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: terminalDescriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              ok: true,
            },
          };
        },
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Plan blocked command session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先整理验证步骤，不要真正执行修改。",
        composerMode: "plan",
      });

      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("failed");
      expect(result.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "plan_mode_command_forbidden",
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("blocks terminal echo-append file writes when a file edit tool is available", async () => {
    const terminalDescriptor = {
      name: "terminal_execute",
      description: "Execute a terminal command",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          command: { type: "string" },
        },
        required: ["sessionId", "command"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "tool_execution",
        operationLabel: "Execute terminal command",
      },
    };
    const writeDescriptor = {
      name: "workspace_write_file",
      description: "Write a workspace file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "file_write",
        operationLabel: "Write workspace file",
      },
    };
    let executedTerminalCommand = false;
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-block-echo-append-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "terminal_execute",
        input: {
          sessionId: "term_1",
          command: "echo const GameLogic = require('./gameLogic'); >> roomManager.js",
        },
        completionText: "Completed after blocked terminal file write",
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "builtin.desktop.conversation",
              signature: "builtin.desktop.conversation:file-edit-preference",
            },
            tools: [writeDescriptor, terminalDescriptor],
          };
        },
      }],
      toolHandlers: [
        {
          descriptor: writeDescriptor,
          async execute() {
            return {
              kind: "completed" as const,
              output: { ok: true },
            };
          },
        },
        {
          descriptor: terminalDescriptor,
          async execute() {
            executedTerminalCommand = true;
            return {
              kind: "completed" as const,
              output: { ok: true },
            };
          },
        },
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Blocked terminal append session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "直接改当前工作区里的 JS 文件。",
      });

      expect(executedTerminalCommand).toBe(false);
      expect(result.detail.toolCalls).toHaveLength(1);
      expect(result.detail.toolCalls[0]?.status).toBe("failed");
      expect(result.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "terminal_file_edit_preferred_tool_required",
      }));
    } finally {
      fixture.dispose();
    }
  });

  test("projects terminal cwd into tool call operations", () => {
    const projected = projectConversationToolCall({
      id: asToolCallId("tool_call_terminal_execute"),
      sessionId: "session-terminal" as never,
      runId: "run-terminal" as never,
      turnId: "turn-terminal" as never,
      messageId: "message-terminal" as never,
      toolName: "terminal_execute",
      status: "completed",
      input: {
        sessionId: "term_1",
        command: "bun test",
      },
      output: {
        ok: true,
        sessionId: "term_1",
        cwd: "E:/workspace/MaomiAgent",
      },
      startedAt: 1,
      updatedAt: 2,
      completedAt: 2,
      metadata: {
        operationKind: "tool_execution",
        operationLabel: "Execute terminal command",
      },
    } satisfies ToolCallRecord);

    expect(projected.operation).toMatchObject({
      kind: "tool_execution",
      command: "bun test",
      cwd: "E:/workspace/MaomiAgent",
    });
  });

  test("executes the real memory capability provider search tool when enabled", async () => {
    const searches: Array<Record<string, unknown>> = [];
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-memory-capability-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "memory_search_context",
        input: {
          query: "release notes",
          topK: 3,
        },
        completionText: "Memory capability completed",
      }),
      capabilityProviders: [new DesktopMemoryConversationCapabilityProvider({
        async search(input) {
          searches.push({ ...input });
          return {
            traceId: "trace-1",
            items: [{
              unitId: "memory-1",
              scope: "workspace",
              tier: "long",
              kind: "fact",
              rawContent: "Release notes live in docs/releases.md",
              summary: "Release notes live in docs/releases.md",
              status: "active",
              createdAt: "2026-05-05T00:00:00.000Z",
              updatedAt: "2026-05-05T00:00:00.000Z",
              sourceScope: "workspace",
              usedAs: "primary",
              score: 0.91,
              explain: "keyword match",
            }],
          };
        },
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Memory capability session",
        metadata: {
          workspaceId: "workspace-1",
          conversationSettings: {
            capabilityPreferences: {
              "memory.runtime": true,
            },
          },
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Search memory",
      });

      expect(searches).toEqual([expect.objectContaining({
        workspaceId: "workspace-1",
        query: "release notes",
        topK: 3,
        includeGlobalFallback: true,
      })]);
      expect(result.detail.toolCalls.some((item) =>
        item.toolName === "memory_search_context" && item.status === "completed")).toBe(true);
      expect(result.detail.toolCalls.find((item) => item.toolName === "memory_search_context")?.output)
        .toEqual(expect.objectContaining({
          traceId: "trace-1",
          items: [expect.objectContaining({
            unitId: "memory-1",
          })],
        }));
    } finally {
      fixture.dispose();
    }
  });

  test("executes the real Feishu capability provider action tool when enabled", async () => {
    const executions: Array<Record<string, unknown>> = [];
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-feishu-capability-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "feishu_execute_smart_assistant_action",
        input: {
          actionId: "docs.search",
          query: "release notes",
        },
        completionText: "Feishu capability completed",
      }),
      capabilityProviders: [new DesktopFeishuConversationCapabilityProvider({
        async getState() {
          return {
            smartAssistant: {
              enabled: true,
              authStatus: "authorized",
              actions: [{
                actionId: "docs.search",
                domain: "docs",
                title: "Search docs",
                summary: "Search Feishu docs",
                status: "ready",
                transport: "runtime_action_registry",
                mountStrategy: "lazy_by_domain",
                credentialKind: "developer_oauth",
                riskLevel: "low",
              }],
            },
          } as any;
        },
        async executeSmartAssistantAction(input) {
          executions.push({ ...input });
          return {
            workspaceId: input.workspaceId,
            actionId: input.actionId,
            domain: "docs",
            executionMode: "builtin_runtime",
            executed: true,
            confirmationRequired: false,
            summary: {
              headline: "Executed",
              details: ["feishu smart assistant action executed"],
              nextSuggestedActionIds: [],
            },
            result: {
              ok: true,
              actionId: input.actionId,
            },
            notes: [],
          };
        },
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Feishu capability session",
        metadata: {
          workspaceId: "workspace-1",
          conversationSettings: {
            capabilityPreferences: {
              "feishu.smartAssistant": true,
            },
          },
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Search Feishu docs",
      });

      expect(executions).toEqual([expect.objectContaining({
        workspaceId: "workspace-1",
        actionId: "docs.search",
        query: "release notes",
      })]);
      expect(result.detail.toolCalls.some((item) =>
        item.toolName === "feishu_execute_smart_assistant_action" && item.status === "completed")).toBe(true);
      expect(result.detail.toolCalls.find((item) => item.toolName === "feishu_execute_smart_assistant_action")?.output)
        .toEqual(expect.objectContaining({
          executed: true,
          actionId: "docs.search",
        }));
    } finally {
      fixture.dispose();
    }
  });

  test("executes the real MCP capability provider tool when enabled", async () => {
    const executions: Array<Record<string, unknown>> = [];
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-mcp-capability-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "mcp__browser__search__1",
        input: {
          query: "release notes",
        },
        completionText: "MCP capability completed",
      }),
      capabilityProviders: [new DesktopMcpConversationCapabilityProvider({
        async runtimeTools() {
          return [{
            mcpId: "mcp-1",
            mcpName: "browser",
            toolName: "search",
            description: "Search the web",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
              required: ["query"],
              additionalProperties: false,
            },
            timeoutMs: 30_000,
          }];
        },
        async executeRuntimeTool(input) {
          executions.push({ ...input, arguments: input.arguments ? { ...input.arguments } : undefined });
          return {
            structuredContent: {
              hits: ["docs/releases.md"],
            },
            content: [{ type: "text", text: "docs/releases.md" }],
          };
        },
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "MCP capability session",
        metadata: {
          workspaceId: "workspace-1",
          conversationSettings: {
            capabilityPreferences: {
              "mcp.runtime": true,
            },
          },
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Search with MCP",
      });

      expect(executions).toEqual([expect.objectContaining({
        workspaceId: "workspace-1",
        mcpName: "browser",
        toolName: "search",
        arguments: {
          query: "release notes",
        },
      })]);
      expect(result.detail.toolCalls.some((item) =>
        item.toolName === "mcp__browser__search__1" && item.status === "completed")).toBe(true);
      expect(result.detail.toolCalls.find((item) => item.toolName === "mcp__browser__search__1")?.output)
        .toEqual(expect.objectContaining({
          structuredContent: {
            hits: ["docs/releases.md"],
          },
        }));
    } finally {
      fixture.dispose();
    }
  });

  test("executes the real skills capability provider tool by default when skills are effective", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "maomi-desktop-skill-runtime-"));
    rmSync(skillDir, { recursive: true, force: true });
    const managedPath = join(skillDir, "demo-skill");
    const skillFilePath = join(managedPath, "SKILL.md");
    mkdirSync(managedPath, { recursive: true });
    writeFileSync(skillFilePath, [
      "---",
      "name: demo-skill",
      "description: Help with demo tasks",
      "---",
      "Use this skill when the user asks for demo-task handling.",
    ].join("\n"));

    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-skills-capability-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: "skill__demo_skill",
        input: {},
        completionText: "Skills capability completed",
      }),
      capabilityProviders: [new DesktopSkillsConversationCapabilityProvider({
        async getEffective() {
          return {
            paths: [skillDir],
            items: [{
              effectiveId: "global:demo-skill",
              winnerScope: "global",
              winnerSkillId: "demo-skill",
              decision: "effective",
              included: true,
              explain: "managed skill will be discovered from the community skills directory",
              item: {
                skillId: "demo-skill",
                name: "demo-skill",
                label: "Demo skill",
                scope: "global",
                enabled: true,
                managedPath,
                description: "Help with demo tasks",
                createdAt: "2026-05-06T00:00:00.000Z",
                updatedAt: "2026-05-06T00:00:00.000Z",
              },
            }],
            diagnostics: {
              totalManaged: 1,
              enabledManaged: 1,
              effectivePaths: 1,
              skippedDisabled: 0,
              skippedMissingPath: 0,
              skippedMissingSkillMarkdown: 0,
              skippedDuplicatePath: 0,
            },
          };
        },
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Skills capability session",
        metadata: {
          workspaceId: "workspace-1",
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Use the workspace skill",
      });

      expect(result.detail.toolCalls.some((item) =>
        item.toolName === "skill__demo_skill" && item.status === "completed")).toBe(true);
      expect(result.detail.toolCalls.find((item) => item.toolName === "skill__demo_skill")?.output)
        .toEqual(expect.objectContaining({
          skillId: "demo-skill",
          content: expect.stringContaining("Use this skill when the user asks for demo-task handling."),
        }));
    } finally {
      fixture.dispose();
      rmSync(skillDir, { recursive: true, force: true });
    }
  });

  test("omits skills capability tools when the session disables skills.runtime", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-skills-disabled-",
      turnPort,
      capabilityProviders: [new DesktopSkillsConversationCapabilityProvider({
        async getEffective() {
          return {
            paths: ["E:/skills"],
            items: [{
              effectiveId: "global:demo-skill",
              winnerScope: "global",
              winnerSkillId: "demo-skill",
              decision: "effective",
              included: true,
              explain: "managed skill will be discovered from the community skills directory",
              item: {
                skillId: "demo-skill",
                name: "demo-skill",
                scope: "global",
                enabled: true,
                managedPath: "E:/skills/demo-skill",
                createdAt: "2026-05-06T00:00:00.000Z",
                updatedAt: "2026-05-06T00:00:00.000Z",
              },
            }],
            diagnostics: {
              totalManaged: 1,
              enabledManaged: 1,
              effectivePaths: 1,
              skippedDisabled: 0,
              skippedMissingPath: 0,
              skippedMissingSkillMarkdown: 0,
              skippedDuplicatePath: 0,
            },
          };
        },
      })],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Skills capability disabled session",
        metadata: {
          workspaceId: "workspace-1",
          conversationSettings: {
            capabilityPreferences: {
              "skills.runtime": false,
            },
          },
        },
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Stay lightweight",
      });

      expect(turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content)
        .not.toContain("skill__demo_skill");
    } finally {
      fixture.dispose();
    }
  });

  test("filters skills capability tools by the selected agent bindings", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-skills-agent-filter-",
      turnPort,
      capabilityProviders: [new DesktopSkillsConversationCapabilityProvider(
        {
          async getEffective() {
            return {
              paths: ["E:/skills"],
              items: [
                {
                  effectiveId: "global:demo-skill-a",
                  winnerScope: "global",
                  winnerSkillId: "demo-skill-a",
                  decision: "effective",
                  included: true,
                  explain: "managed skill will be discovered from the community skills directory",
                  item: {
                    skillId: "demo-skill-a",
                    name: "demo-skill-a",
                    scope: "global",
                    enabled: true,
                    managedPath: "E:/skills/demo-skill-a",
                    createdAt: "2026-05-06T00:00:00.000Z",
                    updatedAt: "2026-05-06T00:00:00.000Z",
                  },
                },
                {
                  effectiveId: "global:demo-skill-b",
                  winnerScope: "global",
                  winnerSkillId: "demo-skill-b",
                  decision: "effective",
                  included: true,
                  explain: "managed skill will be discovered from the community skills directory",
                  item: {
                    skillId: "demo-skill-b",
                    name: "demo-skill-b",
                    scope: "global",
                    enabled: true,
                    managedPath: "E:/skills/demo-skill-b",
                    createdAt: "2026-05-06T00:00:00.000Z",
                    updatedAt: "2026-05-06T00:00:00.000Z",
                  },
                },
              ],
              diagnostics: {
                totalManaged: 2,
                enabledManaged: 2,
                effectivePaths: 1,
                skippedDisabled: 0,
                skippedMissingPath: 0,
                skippedMissingSkillMarkdown: 0,
                skippedDuplicatePath: 0,
              },
            };
          },
        },
        {
          async get(agentId) {
            if (agentId !== "agent-1") {
              return null;
            }

            return {
              agentId: "agent-1",
              name: "Agent One",
              mode: "primary",
              enabled: true,
              version: "test",
              source: "user-custom",
              skills: {
                bindings: [{
                  skillId: "demo-skill-a",
                  enabled: true,
                }],
              },
              createdAt: "2026-05-06T00:00:00.000Z",
              updatedAt: "2026-05-06T00:00:00.000Z",
            };
          },
        },
      )],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Skills agent filter session",
        selectedAgentId: "agent-1",
        metadata: {
          workspaceId: "workspace-1",
        },
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Use the selected agent",
      });

      const toolsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content;
      expect(toolsBlock).toContain("skill__demo_skill_a");
      expect(toolsBlock).not.toContain("skill__demo_skill_b");
    } finally {
      fixture.dispose();
    }
  });

  test("does not filter skills capability tools by selected agent bindings in plan mode", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-skills-plan-agent-bypass-",
      turnPort,
      capabilityProviders: [new DesktopSkillsConversationCapabilityProvider(
        {
          async getEffective() {
            return {
              paths: ["E:/skills"],
              items: [
                {
                  effectiveId: "global:demo-skill-a",
                  winnerScope: "global",
                  winnerSkillId: "demo-skill-a",
                  decision: "effective",
                  included: true,
                  explain: "managed skill will be discovered from the community skills directory",
                  item: {
                    skillId: "demo-skill-a",
                    name: "demo-skill-a",
                    scope: "global",
                    enabled: true,
                    managedPath: "E:/skills/demo-skill-a",
                    createdAt: "2026-05-06T00:00:00.000Z",
                    updatedAt: "2026-05-06T00:00:00.000Z",
                  },
                },
                {
                  effectiveId: "global:demo-skill-b",
                  winnerScope: "global",
                  winnerSkillId: "demo-skill-b",
                  decision: "effective",
                  included: true,
                  explain: "managed skill will be discovered from the community skills directory",
                  item: {
                    skillId: "demo-skill-b",
                    name: "demo-skill-b",
                    scope: "global",
                    enabled: true,
                    managedPath: "E:/skills/demo-skill-b",
                    createdAt: "2026-05-06T00:00:00.000Z",
                    updatedAt: "2026-05-06T00:00:00.000Z",
                  },
                },
              ],
              diagnostics: {
                totalManaged: 2,
                enabledManaged: 2,
                effectivePaths: 1,
                skippedDisabled: 0,
                skippedMissingPath: 0,
                skippedMissingSkillMarkdown: 0,
                skippedDuplicatePath: 0,
              },
            };
          },
        },
        {
          async get(agentId) {
            if (agentId !== "agent-1") {
              return null;
            }

            return {
              agentId: "agent-1",
              name: "Agent One",
              mode: "primary",
              enabled: true,
              version: "test",
              source: "user-custom",
              skills: {
                bindings: [{
                  skillId: "demo-skill-a",
                  enabled: true,
                }],
              },
              createdAt: "2026-05-06T00:00:00.000Z",
              updatedAt: "2026-05-06T00:00:00.000Z",
            };
          },
        },
      )],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Skills plan agent bypass session",
        selectedAgentId: "agent-1",
        metadata: {
          workspaceId: "workspace-1",
        },
      });

      await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "先规划怎么使用这些能力。",
        composerMode: "plan",
        selectedAgentId: "agent-1",
      });

      const toolsBlock = turnPort.prompts[0]?.systemBlocks.find((block) => block.metadata?.source === "desktop.runtime.tools")?.content;
      expect(toolsBlock).toContain("skill__demo_skill_a");
      expect(toolsBlock).toContain("skill__demo_skill_b");
    } finally {
      fixture.dispose();
    }
  });

  test("sends a message and resumes an approved diagnostic tool run", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-runtime-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.runtime-test",
    });
    const turnPort = new ScriptedDiagnosticTurnPort();
    const materializerCalls: Array<Record<string, unknown>> = [];
    const runtimeSelectors: Array<{ protocolFamily?: string; apiStyle?: string }> = [];
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        agents: {
          async list() {
            return {
              items: [{
                agentId: "agent-1",
                name: "Primary agent",
                description: "Primary test agent",
                mode: "primary",
                enabled: true,
                version: "1",
                source: "user-custom",
                prompt: "You are the desktop primary agent.",
                createdAt: "2026-05-03T00:00:00.000Z",
                updatedAt: "2026-05-03T00:00:00.000Z",
              }],
              meta: {
                total: 1,
                limit: 1,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            materializerCalls.push({ ...input });
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort(selector) {
            runtimeSelectors.push({ ...selector });
            return turnPort;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Runtime session",
        selectedAgentId: "agent-1",
      });

      const blocked = await service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedAgentId: "agent-1",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.status).toBe("active");
      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.toolCalls.some((item) => item.status === "blocked")).toBe(true);
      expect(blocked.detail.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
      expect(blocked.detail.runs).toHaveLength(1);
      expect(blocked.detail.runs[0]?.boundary?.kind).toBe("blocked");

      const resumed = await service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "permission",
          decision: "approve_always",
        },
      });

      expect(resumed.detail.status).toBe("idle");
      expect(resumed.detail.pendingInteractions).toHaveLength(0);
      expect(resumed.detail.toolCalls.some((item) => item.status === "completed")).toBe(true);
      expect(resumed.detail.messages.at(-1)?.role).toBe("assistant");
      expect(resumed.detail.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Diagnostic completed"))).toBe(true);
      expect(resumed.detail.runs).toHaveLength(1);
      expect(resumed.detail.runs[0]?.status).toBe("completed");
      expect(materializerCalls).toHaveLength(4);
      expect(materializerCalls.every((call) =>
        call.scope === "workspace"
        && call.workspaceId === "workspace-1"
        && call.selectedChannelId === "kimi"
        && call.selectedModelId === "moonshot-v1-8k")).toBe(true);
      expect(runtimeSelectors).toHaveLength(3);
      expect(runtimeSelectors.every((selector) =>
        selector.protocolFamily === "openai" && selector.apiStyle === "responses")).toBe(true);
      expect(turnPort.executionProfiles.every((profile) =>
        profile.id === "desktop.openai.kimi.moonshot-v1-8k")).toBe(true);
      expect(turnPort.executionProfiles[0]?.metadata).toMatchObject({
        channelId: "kimi",
        modelId: "moonshot-v1-8k",
        workspaceId: "workspace-1",
        scope: "workspace",
      });
      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.agent"
        && block.metadata?.agentId === "agent-1"
        && block.content.includes("desktop primary agent"))).toBe(true);
      expect(turnPort.callCount).toBe(3);
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("allows two sessions to send messages concurrently", async () => {
    const turnPort = new ScriptedConcurrentSessionTurnPort();
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-concurrent-send-",
      turnPort,
    });

    try {
      const first = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Concurrent session A",
      });
      const second = await harness.service.createSession({
        workspaceId: "workspace-2",
        title: "Concurrent session B",
      });

      const firstSend = harness.service.sendMessage({
        sessionId: first.item.sessionId,
        text: "keep session A busy",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      await waitForValue(turnPort.firstCallStarted, 500, "first session send start");

      const secondSend = harness.service.sendMessage({
        sessionId: second.item.sessionId,
        text: "start session B in parallel",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      await waitForValue(turnPort.secondCallStarted, 500, "second session send start");

      turnPort.releaseFirstCall();

      const [firstResult, secondResult] = await Promise.all([firstSend, secondSend]);
      expect(firstResult.detail.sessionId).toBe(first.item.sessionId);
      expect(secondResult.detail.sessionId).toBe(second.item.sessionId);
      expect(secondResult.detail.status).toBe("idle");
    } finally {
      turnPort.releaseFirstCall();
      harness.dispose();
    }
  });

  test("does not block another session while one session resumes an interaction", async () => {
    const turnPort = new ScriptedBlockedInteractionResumeTurnPort();
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-concurrent-interaction-",
      turnPort,
    });

    try {
      const first = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Interaction session A",
      });
      const second = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Interaction session B",
      });

      const blocked = await harness.service.sendMessage({
        sessionId: first.item.sessionId,
        text: "run a tool that needs approval",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });
      expect(blocked.detail.pendingInteractions).toHaveLength(1);

      const answer = harness.service.answerInteraction({
        sessionId: first.item.sessionId,
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "permission",
          decision: "approve_once",
        },
      });

      const secondSend = harness.service.sendMessage({
        sessionId: second.item.sessionId,
        text: "continue unrelated work",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      await waitForValue(turnPort.thirdCallStarted, 500, "parallel send while interaction resumes");

      turnPort.releaseResume();

      const [answered, secondResult] = await Promise.all([answer, secondSend]);
      expect(answered.detail.sessionId).toBe(first.item.sessionId);
      expect(secondResult.detail.sessionId).toBe(second.item.sessionId);
      expect(secondResult.detail.status).toBe("idle");
    } finally {
      turnPort.releaseResume();
      harness.dispose();
    }
  });

  test("routes runtime events into the internal conversation task bridge", async () => {
    const ensured: Array<Record<string, unknown>> = [];
    const blocked: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const turnPort = new ScriptedDiagnosticTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-task-bridge-",
      turnPort,
      taskBridge: {
        async ensureConversationTaskRunning(input) {
          ensured.push({ ...input });
          return {
            taskId: `conversation-${input.runId}`,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: "interactive",
            runMode: "normal",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: "running",
            progress: 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
          };
        },
        async syncManagedConversationRootTask(input) {
          return {
            taskId: input.rootTaskId,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "background",
            runMode: input.runMode ?? "hosted_autopilot",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: input.status ?? "running",
            progress: input.progress ?? 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async markConversationTaskBlocked(input) {
          blocked.push({ ...input });
          return null;
        },
        async completeConversationTask(input) {
          completed.push({ ...input });
          return null;
        },
        async failConversationTask() {
          return null;
        },
      },
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Task bridge session",
        selectedAgentId: "agent-1",
      });

      const pending = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "What is the diagnostic tool waiting for?",
        scope: "workspace",
        selectedAgentId: "agent-1",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });
      expect(pending.detail.pendingInteractions).toHaveLength(1);

      await fixture.service.answerInteraction({
        interactionId: pending.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "permission",
          decision: "approve_once",
        },
      });

      expect(ensured.length).toBeGreaterThan(0);
      expect(ensured.every((item) => item.sessionId === created.item.sessionId)).toBe(true);
      expect(ensured.every((item) => item.goal === "What is the diagnostic tool waiting for?")).toBe(true);
      expect(ensured.every((item) => item.title === "agent-1: Task bridge session")).toBe(true);
      expect(blocked.some((item) => item.interactionId === pending.detail.pendingInteractions[0]!.interactionId)).toBe(true);
      expect(completed).toHaveLength(1);
      expect(completed[0]).toMatchObject({
        workspaceId: "workspace-1",
        summary: "Diagnostic completed",
      });
    } finally {
      fixture.dispose();
    }
  });

  test("auto-promotes execution-oriented prompts into hosted autopilot task runs", async () => {
    const ensured: Array<Record<string, unknown>> = [];
    const rootTasks: Array<Record<string, unknown>> = [];
    const turnPort = new ScriptedDiagnosticTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-promotion-",
      turnPort,
      agentsList: [{
        agentId: FULLY_MANAGED_AGENT_ID,
        name: "Fully Managed",
        description: "Managed intake agent",
        mode: "primary",
        enabled: true,
        version: "builtin",
        source: "builtin-maomi",
        prompt: "You are the managed autopilot intake agent.",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      }],
      taskBridge: {
        async ensureConversationTaskRunning(input) {
          ensured.push({ ...input });
          return {
            taskId: `conversation-${input.runId}`,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "interactive",
            runMode: input.runMode ?? "normal",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: "running",
            progress: 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async syncManagedConversationRootTask(input) {
          rootTasks.push({ ...input });
          return {
            taskId: input.rootTaskId,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "background",
            runMode: input.runMode ?? "hosted_autopilot",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: input.status ?? "running",
            progress: input.progress ?? 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async markConversationTaskBlocked() {
          return null;
        },
        async completeConversationTask() {
          return null;
        },
        async failConversationTask() {
          return null;
        },
      },
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed promotion session",
      });

      const blocked = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Fix the failing deployment and keep retrying until it passes.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.status).toBe("active");
      expect(blocked.detail.runs[0]?.metadata).toMatchObject({
        selectedAgentId: FULLY_MANAGED_AGENT_ID,
        managedExecution: true,
        rootTask: true,
        runMode: "hosted_autopilot",
      });
      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.agent"
        && block.metadata?.agentId === FULLY_MANAGED_AGENT_ID
        && block.content.includes("managed autopilot intake agent"))).toBe(true);
      expect(ensured).toHaveLength(1);
      expect(ensured[0]).toMatchObject({
        agentId: FULLY_MANAGED_AGENT_ID,
        executionMode: "background",
        runMode: "hosted_autopilot",
      });
      expect((ensured[0]?.metadata as Record<string, unknown> | undefined)).toMatchObject({
        managedExecution: true,
        rootTaskId: `managed-root-${created.item.sessionId}`,
        managedExecutionStage: "intake_locked",
        runMode: "hosted_autopilot",
      });
      expect((ensured[0]?.metadata as Record<string, unknown> | undefined)?.rootTask).toBeUndefined();
      expect(rootTasks).toHaveLength(1);
      expect((rootTasks[0]?.metadata as Record<string, unknown> | undefined)).toMatchObject({
        managedExecution: true,
        rootTask: true,
        rootTaskId: `managed-root-${created.item.sessionId}`,
        managedExecutionStage: "intake_locked",
      });
      expect(blocked.detail.metadata).toMatchObject({
        linkedRootTaskId: `managed-root-${created.item.sessionId}`,
        managedExecutionStage: "intake_locked",
      });

      const resumed = await fixture.service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "permission",
          decision: "approve_once",
        },
      });

      expect(resumed.detail.metadata).toMatchObject({
        linkedRootTaskId: `managed-root-${created.item.sessionId}`,
        managedExecutionStage: "ready",
      });
      expect(rootTasks).toHaveLength(2);
      expect((rootTasks[1]?.metadata as Record<string, unknown> | undefined)).toMatchObject({
        phase: "awaiting_task_confirmation",
        managedExecutionStage: "ready",
      });
    } finally {
      fixture.dispose();
    }
  });

  test("uses workspace managed execution defaults for ordinary prompts", async () => {
    const ensured: Array<Record<string, unknown>> = [];
    const rootTasks: Array<Record<string, unknown>> = [];
    const turnPort = new ScriptedDiagnosticTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-default-",
      turnPort,
      agentsList: [{
        agentId: FULLY_MANAGED_AGENT_ID,
        name: "Fully Managed",
        description: "Managed intake agent",
        mode: "primary",
        enabled: true,
        version: "builtin",
        source: "builtin-maomi",
        prompt: "You are the managed autopilot intake agent.",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      }],
      taskBridge: {
        async ensureConversationTaskRunning(input) {
          ensured.push({ ...input });
          return {
            taskId: `conversation-${input.runId}`,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "interactive",
            runMode: input.runMode ?? "normal",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: "running",
            progress: 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async syncManagedConversationRootTask(input) {
          rootTasks.push({ ...input });
          return {
            taskId: input.rootTaskId,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "background",
            runMode: input.runMode ?? "hosted_autopilot",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: input.status ?? "running",
            progress: input.progress ?? 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async markConversationTaskBlocked() {
          return null;
        },
        async completeConversationTask() {
          return null;
        },
        async failConversationTask() {
          return null;
        },
      },
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed default session",
        metadata: {
          conversationSettings: {
            managedExecutionEnabled: true,
          },
        },
      });

      const blocked = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Summarize the current workspace status.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.status).toBe("active");
      expect(blocked.detail.runs[0]?.metadata).toMatchObject({
        selectedAgentId: FULLY_MANAGED_AGENT_ID,
        managedExecution: true,
        rootTask: true,
        runMode: "hosted_autopilot",
      });
      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.agent"
        && block.metadata?.agentId === FULLY_MANAGED_AGENT_ID
        && block.content.includes("managed autopilot intake agent"))).toBe(true);
      expect(ensured).toHaveLength(1);
      expect(ensured[0]).toMatchObject({
        agentId: FULLY_MANAGED_AGENT_ID,
        executionMode: "background",
        runMode: "hosted_autopilot",
      });
      expect(rootTasks).toHaveLength(1);
      expect(blocked.detail.metadata).toMatchObject({
        linkedRootTaskId: `managed-root-${created.item.sessionId}`,
        managedExecutionStage: "intake_locked",
      });
    } finally {
      fixture.dispose();
    }
  });

  test("injects the dedicated wechat agent prompt when the session selects wechat.agent", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-wechat-agent-",
      turnPort,
      agentsList: BUILTIN_MAOMI_AGENTS,
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "WeChat agent session",
        selectedAgentId: WECHAT_AGENT_ID,
      });

      const sent = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "使用 easytouch 把桌面截图发我",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(sent.detail.runs[0]?.metadata).toMatchObject({
        selectedAgentId: WECHAT_AGENT_ID,
      });
      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.agent"
        && block.metadata?.agentId === WECHAT_AGENT_ID
        && block.content.includes("微信轻量执行器"))).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("executes maomi_managed_task through the managed runtime path", async () => {
    const rootTasks: Array<Record<string, unknown>> = [];
    const patchedRootTasks: Array<Record<string, unknown>> = [];
    const turnPort = new ScriptedManagedTaskTurnPort();
    const managedTaskBridge: Pick<DesktopConversationTaskBridgePort, "patchManagedConversationRootTask"> = {
      async patchManagedConversationRootTask(input) {
        patchedRootTasks.push({ ...input });
        return {
          taskId: input.rootTaskId,
          title: "Managed intake",
          goal: "Collect the managed task specification.",
          workspaceId: input.workspaceId,
          taskType: "conversation",
          executionMode: "background",
          runMode: "hosted_autopilot",
          origin: "chat",
          linkedSessionId: "session-managed-tool",
          agentId: FULLY_MANAGED_AGENT_ID,
          priority: "normal",
          status: input.status ?? "running",
          progress: input.progress ?? 60,
          createdAt: "2026-05-04T00:00:00.000Z",
          updatedAt: "2026-05-04T00:00:00.000Z",
          runCount: 0,
          steps: [],
          metadata: {
            rootTask: true,
            rootTaskId: input.rootTaskId,
            ...(input.metadata ?? {}),
          },
        } satisfies DesktopTaskRecord;
      },
    };
    const builtinTools = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return {
            items: [{
              workspaceId: "workspace-1",
              name: "Mock Workspace",
              directoryPath: "E:/workspace/mock",
              isPinned: false,
              tags: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            }],
            meta: {
              total: 1,
              limit: 20,
              offset: 0,
              hasMore: false,
            },
          };
        },
        async get(workspaceId) {
          return workspaceId === "workspace-1"
            ? {
              workspaceId: "workspace-1",
              name: "Mock Workspace",
              directoryPath: "E:/workspace/mock",
              isPinned: false,
              tags: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            }
            : null;
        },
        async getFileContent(workspaceId, path) {
          return {
            workspaceId,
            rootPath: "E:/workspace/mock",
            path,
            absolutePath: `E:/workspace/mock/${path}`,
            content: "",
            binary: false,
            truncated: false,
          };
        },
      },
      gitQuery: {
        async getGitChanges(workspaceId) {
          return {
            workspaceId,
            rootPath: "E:/workspace/mock",
            isGitRepo: true,
            clean: true,
            detached: false,
            ahead: 0,
            behind: 0,
            stagedSummary: {
              files: 0,
              added: 0,
              modified: 0,
              deleted: 0,
              renamed: 0,
              untracked: 0,
              conflict: 0,
              additions: 0,
              deletions: 0,
            },
            unstagedSummary: {
              files: 0,
              added: 0,
              modified: 0,
              deleted: 0,
              renamed: 0,
              untracked: 0,
              conflict: 0,
              additions: 0,
              deletions: 0,
            },
            items: [],
            summary: {
              files: 0,
              added: 0,
              modified: 0,
              deleted: 0,
              renamed: 0,
              untracked: 0,
              conflict: 0,
              additions: 0,
              deletions: 0,
            },
          };
        },
        async getGitReviewDetail(workspaceId, input) {
          return {
            workspaceId,
            rootPath: "E:/workspace/mock",
            isGitRepo: true,
            path: input.path,
            scope: input.scope,
            baseRef: input.baseRef,
            headRef: input.headRef,
            item: null,
          };
        },
      },
      terminalQuery: {
        async getDetail() {
          return null;
        },
      },
      terminalCommand: {
        async create(input) {
          const now = "2026-05-04T00:00:00.000Z";
          return {
            sessionId: "terminal-managed-tool",
            title: input.title ?? "Managed terminal",
            shellKind: input.shellKind ?? "powershell",
            status: "running",
            cwd: input.cwd ?? "E:/workspace/mock",
            workspaceId: input.workspaceId,
            createdAt: now,
            updatedAt: now,
          };
        },
        async execute(sessionId) {
          const now = "2026-05-04T00:00:00.000Z";
          return {
            sessionId,
            title: "Managed terminal",
            shellKind: "powershell",
            status: "running",
            cwd: "E:/workspace/mock",
            createdAt: now,
            updatedAt: now,
          };
        },
        async close(sessionId) {
          return {
            sessionId,
            closed: true,
          };
        },
      },
      taskBridge: managedTaskBridge,
    });
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-tool-",
      turnPort,
      agentsList: [{
        agentId: FULLY_MANAGED_AGENT_ID,
        name: "Fully Managed",
        description: "Managed intake agent",
        mode: "primary",
        enabled: true,
        version: "builtin",
        source: "builtin-maomi",
        prompt: "You are the managed autopilot intake agent.",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      }],
      taskBridge: {
        async ensureConversationTaskRunning(input) {
          return {
            taskId: `conversation-${input.runId}`,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "interactive",
            runMode: input.runMode ?? "normal",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: "running",
            progress: 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async syncManagedConversationRootTask(input) {
          rootTasks.push({ ...input });
          return {
            taskId: input.rootTaskId,
            title: input.title,
            goal: input.goal,
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: input.executionMode ?? "background",
            runMode: input.runMode ?? "hosted_autopilot",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: input.agentId,
            priority: "normal",
            status: input.status ?? "running",
            progress: input.progress ?? 10,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: input.metadata,
          };
        },
        async patchManagedConversationRootTask(input) {
          return managedTaskBridge.patchManagedConversationRootTask(input);
        },
        async markConversationTaskBlocked() {
          return null;
        },
        async completeConversationTask() {
          return null;
        },
        async failConversationTask() {
          return null;
        },
      },
      toolSources: builtinTools.toolSources,
      toolHandlers: builtinTools.toolHandlers,
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed tool session",
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Fix the failing deployment and keep retrying until it passes.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(result.detail.status).toBe("idle");
      expect(result.detail.pendingInteractions).toHaveLength(0);
      expect(result.detail.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Managed task confirmed"))).toBe(true);
      expect(result.detail.toolCalls.some((item) =>
        item.toolName === "maomi_managed_task" && item.status === "completed")).toBe(true);
      expect(result.detail.metadata).toMatchObject({
        linkedRootTaskId: `managed-root-${created.item.sessionId}`,
      });
      expect(rootTasks.length).toBeGreaterThan(0);
      expect(patchedRootTasks).toHaveLength(1);
      expect(patchedRootTasks[0]).toMatchObject({
        workspaceId: "workspace-1",
        rootTaskId: `managed-root-${created.item.sessionId}`,
        status: "running",
        progress: 60,
      });
      expect((patchedRootTasks[0]?.metadata as Record<string, unknown> | undefined)).toMatchObject({
        phase: "awaiting_task_confirmation",
        managedExecutionStage: "ready",
        completionContract: {
          objective: "Fix the failing deployment.",
          expectedOutcome: "Deployment passes consistently.",
          acceptanceCriteria: ["CI passes", "Smoke passes"],
        },
        notificationPlan: {
          channel: "chat",
          summary: "Notify the operator when deployment is green.",
        },
        wrapUpCommands: ["bun test"],
      });
    } finally {
      fixture.dispose();
    }
  });

  test("preserves a preferred execution subagent for managed takeover sessions", async () => {
    const turnPort = new ScriptedDiagnosticTurnPort({
      text: "managed payload",
      requireApproval: false,
    }, "Managed takeover completed");
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-subagent-",
      turnPort,
      agentsList: [
        {
          agentId: "dev-coordinator",
          name: "Coordinator",
          description: "Primary coordinator",
          mode: "primary",
          enabled: true,
          version: "builtin",
          source: "builtin-maomi",
          prompt: "You are the coordinator agent.",
          createdAt: "2026-05-04T00:00:00.000Z",
          updatedAt: "2026-05-04T00:00:00.000Z",
        },
        {
          agentId: "autopilot-orchestrator",
          name: "Autopilot Orchestrator",
          description: "Managed execution orchestrator",
          mode: "subagent",
          enabled: true,
          version: "builtin",
          source: "builtin-maomi",
          prompt: "You are the long-task orchestration executor.",
          createdAt: "2026-05-04T00:00:00.000Z",
          updatedAt: "2026-05-04T00:00:00.000Z",
        },
      ],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed takeover session",
        selectedAgentId: "autopilot-orchestrator",
        metadata: {
          managedExecution: true,
          rootTask: false,
          linkedRootTaskId: "managed-root-session_intake",
          managedExecutionStage: "running",
          executionAgentId: "autopilot-orchestrator",
          preferredExecutionAgentId: "autopilot-orchestrator",
          runMode: "hosted_autopilot",
          executionMode: "background",
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Continue the managed task.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
        selectedAgentId: "autopilot-orchestrator",
      });

      expect(result.detail.status).toBe("idle");
      expect(turnPort.prompts[0]?.systemBlocks.some((block) =>
        block.metadata?.source === "desktop.agent"
        && block.metadata?.agentId === "autopilot-orchestrator"
        && block.content.includes("long-task orchestration executor"))).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("injects managed root task and resume packets into managed takeover prompts", async () => {
    const turnPort = new ScriptedDiagnosticTurnPort({
      text: "managed payload",
      requireApproval: false,
    }, "Managed takeover completed");
    const rootTask: DesktopTaskRecord = {
      taskId: "managed-root-session_takeover",
      title: "Stabilize the autonomous deployment fix",
      goal: "Finish the deployment recovery flow and verify it.",
      workspaceId: "workspace-1",
      taskType: "execution",
      executionMode: "background",
      runMode: "hosted_autopilot",
      origin: "chat",
      linkedSessionId: "session_takeover",
      agentId: "autopilot-orchestrator",
      priority: "high",
      status: "running",
      progress: 55,
      createdAt: "2026-05-04T00:00:00.000Z",
      updatedAt: "2026-05-04T00:05:00.000Z",
      startedAt: "2026-05-04T00:01:00.000Z",
      runCount: 1,
      lastRunId: "run_takeover_1",
      steps: [{
        stepId: "step-1",
        title: "Reproduce the failure",
        status: "success",
      }, {
        stepId: "step-2",
        title: "Patch the retry path",
        status: "running",
        message: "Updating the managed retry loop.",
      }],
      outputs: [{
        name: "latestPatch",
        value: "Applied retry scheduling adjustments.",
      }],
      metadata: {
        managedExecutionStage: "running",
        phase: "executing_plan",
        completionContract: {
          objective: "Ship the retry fix.",
          expectedOutcome: "Deployment runs end-to-end without manual repair.",
          acceptanceCriteria: ["CI passes", "Smoke passes"],
        },
        verificationPlan: {
          mode: "command",
          summary: "Run bun test and smoke checks.",
        },
        notificationPlan: {
          channel: "chat",
          summary: "Post the final deployment status.",
        },
        wrapUpCommands: ["bun test", "bun run smoke"],
      },
    };
    const tasksQueryCalls: Array<{ workspaceId: string; taskId: string }> = [];
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-context-",
      turnPort,
      agentsList: [{
        agentId: "autopilot-orchestrator",
        name: "Autopilot Orchestrator",
        description: "Managed execution orchestrator",
        mode: "subagent",
        enabled: true,
        version: "builtin",
        source: "builtin-maomi",
        prompt: "You are the long-task orchestration executor.",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      }],
      tasksQuery: {
        async get(workspaceId, taskId) {
          tasksQueryCalls.push({ workspaceId, taskId });
          return workspaceId === rootTask.workspaceId && taskId === rootTask.taskId
            ? rootTask
            : null;
        },
      },
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed takeover session",
        selectedAgentId: "autopilot-orchestrator",
        metadata: {
          managedExecution: true,
          rootTask: false,
          linkedRootTaskId: rootTask.taskId,
          managedExecutionStage: "running",
          executionAgentId: "autopilot-orchestrator",
          preferredExecutionAgentId: "autopilot-orchestrator",
          phase: "executing_plan",
          runMode: "hosted_autopilot",
          executionMode: "background",
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Continue executing the managed task.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
        selectedAgentId: "autopilot-orchestrator",
      });

      expect(result.detail.status).toBe("idle");
      expect(tasksQueryCalls).toHaveLength(2);
      expect(tasksQueryCalls.every((call) =>
        call.workspaceId === "workspace-1" && call.taskId === rootTask.taskId)).toBe(true);

      const taskBlock = turnPort.prompts[0]?.contextBlocks.find((block) =>
        block.metadata?.source === "desktop.managed-task");
      const resumeBlock = turnPort.prompts[0]?.contextBlocks.find((block) =>
        block.metadata?.source === "desktop.managed-resume");

      expect(taskBlock?.kind).toBe("task");
      expect(taskBlock?.content).toContain("Managed task packet");
      expect(taskBlock?.content).toContain(`rootTaskId: ${rootTask.taskId}`);
      expect(taskBlock?.content).toContain("completionContract:");
      expect(taskBlock?.content).toContain("wrapUpCommands:");
      expect(taskBlock?.content).toContain("- bun run smoke");

      expect(resumeBlock?.kind).toBe("task");
      expect(resumeBlock?.content).toContain("Managed resume packet");
      expect(resumeBlock?.content).toContain("preferredAgentId: autopilot-orchestrator");
      expect(resumeBlock?.content).toContain("recentVisibleMessages:");
      expect(resumeBlock?.content).toContain("user: Continue executing the managed task.");
    } finally {
      fixture.dispose();
    }
  });

  test("auto-retries retryable managed failures through system continuation", async () => {
    const turnPort = new ScriptedRetryableFailureThenSuccessTurnPort();
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-autoretry-",
      turnPort,
      agentsList: [{
        agentId: "autopilot-orchestrator",
        name: "Autopilot Orchestrator",
        description: "Managed execution orchestrator",
        mode: "subagent",
        enabled: true,
        version: "builtin",
        source: "builtin-maomi",
        prompt: "You are the long-task orchestration executor.",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed takeover session",
        selectedAgentId: "autopilot-orchestrator",
        metadata: {
          managedExecution: true,
          rootTask: false,
          linkedRootTaskId: "managed-root-session_takeover",
          managedExecutionStage: "running",
          executionAgentId: "autopilot-orchestrator",
          preferredExecutionAgentId: "autopilot-orchestrator",
          runMode: "hosted_autopilot",
          executionMode: "background",
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Continue recovering the deployment.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
        selectedAgentId: "autopilot-orchestrator",
      });

      expect(result.detail.status).toBe("idle");
      expect(turnPort.callCount).toBe(2);
      expect(result.detail.runs).toHaveLength(2);
      expect(result.detail.runs.some((run) => run.boundary?.kind === "failed")).toBe(true);
      expect(result.detail.runs.some((run) => run.boundary?.kind === "completed")).toBe(true);
      expect(result.detail.runs[0]?.boundary).toMatchObject({
        kind: "failed",
        error: {
          code: "provider_runtime_timeout",
          message: "Temporary provider timeout",
          retryable: true,
          metadata: {
            retryAfterMs: 0,
          },
        },
      });
      expect(result.detail.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Retried successfully"))).toBe(true);

      const secondPromptUserMessages = turnPort.prompts[1]?.messages.filter((message) =>
        message.message.role === "user");
      expect(secondPromptUserMessages).toHaveLength(1);
      expect(secondPromptUserMessages?.[0]?.parts.some((part) =>
        part.type === "text" && part.text.includes("Continue recovering the deployment."))).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("allows transport-class retryable failures to use the larger retry budget", async () => {
    const turnPort = new ScriptedRetryableFailureThenSuccessTurnPort({
      failuresBeforeSuccess: 5,
      errorCode: "provider_first_event_timeout",
      errorMessage: "Temporary first-event timeout",
    });
    const fixture = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-managed-transport-autoretry-",
      turnPort,
      agentsList: [{
        agentId: "autopilot-orchestrator",
        name: "Autopilot Orchestrator",
        description: "Managed execution orchestrator",
        mode: "subagent",
        enabled: true,
        version: "builtin",
        source: "builtin-maomi",
        prompt: "You are the long-task orchestration executor.",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      }],
    });

    try {
      const created = await fixture.service.createSession({
        workspaceId: "workspace-1",
        title: "Managed transport retry session",
        selectedAgentId: "autopilot-orchestrator",
        metadata: {
          managedExecution: true,
          rootTask: false,
          linkedRootTaskId: "managed-root-session_transport_retry",
          managedExecutionStage: "running",
          executionAgentId: "autopilot-orchestrator",
          preferredExecutionAgentId: "autopilot-orchestrator",
          runMode: "hosted_autopilot",
          executionMode: "background",
        },
      });

      const result = await fixture.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Continue recovering the deployment.",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
        selectedAgentId: "autopilot-orchestrator",
      });

      expect(result.detail.status).toBe("idle");
      expect(turnPort.callCount).toBe(6);
      expect(result.detail.runs).toHaveLength(6);
      expect(result.detail.metadata).toMatchObject({
        managedAutoRetryCount: 5,
        managedAutoRetryMaxAttempts: 5,
        retryPolicyBucket: "transport",
      });
      expect(result.detail.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Retried successfully"))).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("resumes a blocked diagnostic tool run after approve_once", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-approve-once-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.approve-once-test",
    });
    const turnPort = new ScriptedDiagnosticTurnPort();
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort() {
            return turnPort;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Approve once session",
      });

      const blocked = await service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);

      const resumed = await service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "permission",
          decision: "approve_once",
        },
      });

      expect(resumed.detail.status).toBe("idle");
      expect(resumed.detail.pendingInteractions).toHaveLength(0);
      expect(resumed.detail.toolCalls.some((item) => item.status === "completed")).toBe(true);
      expect(resumed.detail.messages.some((message) => message.parts.some((part) =>
        part.type === "text" && part.text.includes("Diagnostic completed")))).toBe(true);
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("resumes a blocked diagnostic question interaction and persists the submitted answers", async () => {
    const turnPort = new ScriptedDiagnosticTurnPort({
      text: "question payload",
      interactionKind: "question",
    }, "Question diagnostic completed");
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-question-",
      turnPort,
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Question diagnostic session",
      });

      const blocked = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic question",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.pendingInteractions[0]?.request.kind).toBe("question");

      const answers = [
        {
          questionId: "diagnostic_action",
          values: ["continue"],
        },
        {
          questionId: "diagnostic_checks",
          values: ["regression", "sync task badge"],
        },
      ];

      const resumed = await harness.service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "question",
          answers,
        },
      });

      const settled = await waitForValue((async () => {
        while (true) {
          const detail = await harness.service.getSessionDetail(created.item.sessionId);
          if (
            detail
            && detail.status === "idle"
            && detail.pendingInteractions.length === 0
            && detail.toolCalls.some((item) => item.status === "completed")
            && detail.messages.at(-1)?.parts.some((part) =>
              part.type === "text" && part.text.includes("Question diagnostic completed"))
          ) {
            return detail;
          }

          await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
          });
        }
      })(), 3000, "question interaction settle");

      expect(resumed.detail.status === "active" || resumed.detail.status === "idle").toBe(true);
      expect(settled.status).toBe("idle");
      expect(settled.pendingInteractions).toHaveLength(0);
      expect(settled.toolCalls.some((item) => item.status === "completed")).toBe(true);
      expect(settled.toolCalls.find((item) => item.status === "completed")?.output).toEqual(expect.objectContaining({
        ok: true,
        text: "question payload",
        interactionKind: "question",
        answers,
      }));
      expect(settled.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Question diagnostic completed"))).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  test("resumes a blocked diagnostic form interaction and persists the submitted values", async () => {
    const turnPort = new ScriptedDiagnosticTurnPort({
      text: "form payload",
      interactionKind: "form",
    }, "Form diagnostic completed");
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-form-",
      turnPort,
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Form diagnostic session",
      });

      const blocked = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic form",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.pendingInteractions[0]?.request.kind).toBe("form");

      const values = {
        strategy: "tests",
        checks: ["regression", "task-badge"],
        confirm: true,
        notes: "capture desktop regression",
      };

      const resumed = await harness.service.answerInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
        response: {
          kind: "form",
          values,
          actionId: "submit",
        },
      });

      const settled = await waitForSettledSessionDetail(
        harness.service,
        created.item.sessionId,
        "form interaction settle",
      );

      expect(resumed.detail.status === "active" || resumed.detail.status === "idle").toBe(true);
      expect(settled.status).toBe("idle");
      expect(settled.pendingInteractions).toHaveLength(0);
      expect(settled.toolCalls.some((item) => item.status === "completed")).toBe(true);
      expect(settled.toolCalls.find((item) => item.status === "completed")?.output).toEqual(expect.objectContaining({
        ok: true,
        text: "form payload",
        interactionKind: "form",
        values,
        actionId: "submit",
      }));
      expect(settled.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Form diagnostic completed"))).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  test("fails a blocked diagnostic permission interaction after rejection", async () => {
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-reject-",
      turnPort: new ScriptedDiagnosticTurnPort(),
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Rejected diagnostic session",
      });

      const blocked = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(blocked.detail.pendingInteractions).toHaveLength(1);
      expect(blocked.detail.pendingInteractions[0]?.request.kind).toBe("permission");

      const rejected = await harness.service.rejectInteraction({
        interactionId: blocked.detail.pendingInteractions[0]!.interactionId,
      });

      expect(rejected.detail.status).toBe("failed");
      expect(rejected.detail.pendingInteractions).toHaveLength(0);
      expect(rejected.detail.toolCalls.some((item) => item.status === "failed")).toBe(true);
      expect(rejected.detail.toolCalls.find((item) => item.status === "failed")?.error).toEqual(expect.objectContaining({
        code: "tool_execution_rejected",
      }));
      expect(rejected.detail.runs).toHaveLength(1);
      expect(rejected.detail.runs[0]?.status).toBe("failed");
      expect(rejected.detail.runs[0]?.boundary?.kind).toBe("failed");
      expect(harness.logs.query({ level: "error" }).items.some((item) =>
        {
          const boundary = item.context?.boundary;
          const error = isRecord(boundary) && isRecord(boundary.error)
            ? boundary.error
            : undefined;

          return item.message === "Desktop conversation rejectInteraction failed"
            && item.context?.sessionId === created.item.sessionId
            && error?.code === "tool_execution_rejected";
        })).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  test("continues the run after command tool failure and feeds the failure back to the model", async () => {
    const turnPort = new ScriptedCommandFailureRecoveryTurnPort();
    const commandDescriptor = {
      name: "mock_command_execute",
      description: "Execute a mock command that fails",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
        additionalProperties: false,
      },
      metadata: {
        operationKind: "command_execution",
        operationLabel: "Run command",
      },
    };
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-command-failure-",
      turnPort,
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "mock-command-source",
              signature: "mock-command-source:mock_command_execute",
            },
            tools: [commandDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: commandDescriptor,
        async execute() {
          return {
            kind: "failed" as const,
            error: {
              code: "command_failed",
              message: "Command exited with code 1",
              retryable: false,
            },
          };
        },
      }],
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Command failure recovery session",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the command and recover if it fails",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(sent.detail.status).toBe("idle");
      expect(sent.detail.runs).toHaveLength(1);
      expect(sent.detail.runs[0]?.status).toBe("completed");
      expect(sent.detail.toolCalls).toHaveLength(1);
      expect(sent.detail.toolCalls[0]?.status).toBe("failed");
      expect(sent.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "command_failed",
      }));
      expect(sent.detail.toolCalls[0]?.output).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "command_failed",
          message: "Command exited with code 1",
        }),
      }));
      expect(sent.detail.messages.at(-1)?.parts.some((part) =>
        part.type === "text" && part.text.includes("Recovered after command failure"))).toBe(true);
      expect(turnPort.prompts).toHaveLength(2);
      expect(turnPort.prompts[1]?.messages.some((message) =>
        message.message.role === "tool"
        && message.parts.some((part) => part.type === "text" && part.text.includes("command_failed")))).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  test("continues the run after non-command tool failure and feeds the failure back to the model", async () => {
    const turnPort = new ScriptedGenericToolFailureRecoveryTurnPort();
    const toolDescriptor = {
      name: "mock_generic_failure",
      description: "Execute a mock tool that fails without a command payload",
      inputSchema: {
        type: "object",
        properties: {
          objective: { type: "string" },
        },
        required: ["objective"],
        additionalProperties: false,
      },
    };
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-generic-failure-",
      turnPort,
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "mock-generic-source",
              signature: "mock-generic-source:mock_generic_failure",
            },
            tools: [toolDescriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor: toolDescriptor,
        async execute() {
          return {
            kind: "failed" as const,
            error: {
              code: "mock_tool_failed",
              message: "Mock tool could not complete the requested work",
              retryable: false,
            },
          };
        },
      }],
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Generic failure recovery session",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the generic tool and recover if it fails",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(sent.detail.status).toBe("idle");
      expect(sent.detail.runs).toHaveLength(1);
      expect(sent.detail.runs[0]?.status).toBe("completed");
      expect(sent.detail.toolCalls).toHaveLength(1);
      expect(sent.detail.toolCalls[0]?.status).toBe("failed");
      expect(sent.detail.toolCalls[0]?.error).toEqual(expect.objectContaining({
        code: "mock_tool_failed",
      }));
      expect(sent.detail.toolCalls[0]?.output).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "mock_tool_failed",
          message: "Mock tool could not complete the requested work",
        }),
      }));
      expect(sent.detail.messages.some((message) =>
        message.parts.some((part) =>
          part.type === "text" && part.text.includes("Recovered after generic tool failure")))).toBe(true);
      expect(turnPort.prompts).toHaveLength(2);
      expect(turnPort.prompts[1]?.messages.some((message) =>
        message.message.role === "tool"
        && message.parts.some((part) => part.type === "text" && part.text.includes("mock_tool_failed")))).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  test("projects latest token usage from the most recent run", async () => {
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-usage-",
      turnPort: new ScriptedUsageTurnPort(),
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Usage session",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Track token usage",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(sent.detail.latestTokenUsage).toEqual(expect.objectContaining({
        runId: sent.detail.runs[0]?.id,
        channelId: "kimi",
        modelId: "moonshot-v1-8k",
        turnCount: 1,
        inputTokens: 3200,
        outputTokens: 480,
        reasoningTokens: 120,
        totalTokens: 3680,
      }));
    } finally {
      harness.dispose();
    }
  });

  test("truncates oversized session detail payloads before returning them", async () => {
    const detailMarker = "[conversation detail truncated to keep chat responsive]";
    const largeInput = `input-start-${"I".repeat(16_000)}-input-end`;
    const largeOutput = `output-start-${"O".repeat(18_000)}-output-end`;
    const largeNested = `nested-start-${"N".repeat(14_000)}-nested-end`;
    const largeCompletion = `completion-start-${"C".repeat(17_000)}-completion-end`;
    const descriptor = {
      name: "workspace_large_payload",
      description: "Return an oversized payload for detail projection tests",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        additionalProperties: true,
      },
    };
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-detail-truncation-",
      turnPort: new ScriptedCapabilityToolTurnPort({
        toolName: descriptor.name,
        input: {
          query: largeInput,
          nested: {
            note: largeNested,
          },
        },
        completionText: largeCompletion,
      }),
      toolSources: [{
        async listTools() {
          return {
            source: {
              sourceId: "large-payload-source",
              signature: "large-payload-source:workspace_large_payload",
            },
            tools: [descriptor],
          };
        },
      }],
      toolHandlers: [{
        descriptor,
        async execute() {
          return {
            kind: "completed" as const,
            output: {
              stdout: largeOutput,
              nested: {
                stderr: largeNested,
              },
            },
          };
        },
      }],
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Detail truncation session",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Return the oversized payload",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      const toolCall = sent.detail.toolCalls[0];
      expect(toolCall).toBeDefined();
      if (!toolCall) {
        throw new Error("Expected a projected tool call");
      }

      expect(isRecord(toolCall.input)).toBe(true);
      if (!isRecord(toolCall.input)) {
        throw new Error("Expected tool input to be an object");
      }
      expect(typeof toolCall.input.query).toBe("string");
      expect(toolCall.input.query).not.toBe(largeInput);
      expect((toolCall.input.query as string).includes(detailMarker)).toBe(true);
      expect(isRecord(toolCall.input.nested)).toBe(true);
      if (!isRecord(toolCall.input.nested)) {
        throw new Error("Expected nested tool input to be an object");
      }
      expect(typeof toolCall.input.nested.note).toBe("string");
      expect((toolCall.input.nested.note as string).includes(detailMarker)).toBe(true);

      expect(isRecord(toolCall.output)).toBe(true);
      if (!isRecord(toolCall.output)) {
        throw new Error("Expected tool output to be an object");
      }
      expect(typeof toolCall.output.stdout).toBe("string");
      expect(toolCall.output.stdout).not.toBe(largeOutput);
      expect((toolCall.output.stdout as string).includes(detailMarker)).toBe(true);
      expect(isRecord(toolCall.output.nested)).toBe(true);
      if (!isRecord(toolCall.output.nested)) {
        throw new Error("Expected nested tool output to be an object");
      }
      expect(typeof toolCall.output.nested.stderr).toBe("string");
      expect((toolCall.output.nested.stderr as string).includes(detailMarker)).toBe(true);

      const assistantText = sent.detail.messages.flatMap((message) =>
        message.parts.flatMap((part) => part.type === "text" ? [part.text] : []),
      ).at(-1);
      expect(typeof assistantText).toBe("string");
      expect(assistantText).not.toBe(largeCompletion);
      expect((assistantText as string).includes(detailMarker)).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  test("automatically compacts context when estimated prompt reaches the configured threshold", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-auto-compaction-",
      turnPort,
      contextWindow: 400,
      maxOutputTokens: 64,
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Auto compaction session",
        metadata: {
          conversationSettings: {
            contextCompressionThresholdPercent: 85,
          },
        },
      });

      await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "A".repeat(800),
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "B".repeat(800),
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(turnPort.requests).toHaveLength(2);
      expect(sent.detail.currentContextBudget).toEqual(expect.objectContaining({
        runId: sent.detail.runs.at(-1)?.id,
        compressionThresholdPercent: 85,
        contextWindowTokens: 400,
        shouldAutoCompress: false,
        compaction: expect.objectContaining({
          status: "completed",
          reason: "budget_exceeded",
        }),
      }));
      expect(sent.detail.checkpoints).toHaveLength(1);
      expect(sent.detail.messages.some((message) => message.messageId === sent.detail.checkpoints[0]?.summaryMessageId)).toBe(true);
      expect(sent.detail.messages.flatMap((message) =>
        message.parts.flatMap((part) => part.type === "text" ? [part.text] : []))).not.toContain("A".repeat(800));
    } finally {
      harness.dispose();
    }
  });

  test("defaults the context compression threshold to 80 percent when no preference is stored", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-default-compaction-threshold-",
      turnPort,
      contextWindow: 400,
      maxOutputTokens: 64,
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Default compaction threshold session",
      });

      await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "A".repeat(800),
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "B".repeat(800),
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(sent.detail.currentContextBudget).toEqual(expect.objectContaining({
        runId: sent.detail.runs.at(-1)?.id,
        compressionThresholdPercent: 80,
        contextWindowTokens: 400,
        shouldAutoCompress: false,
        compaction: expect.objectContaining({
          status: "completed",
          reason: "budget_exceeded",
        }),
      }));
    } finally {
      harness.dispose();
    }
  });

  test("clamps raw context compression thresholds into the supported 50 to 90 percent range", async () => {
    const turnPort = new RecordingPromptTurnPort();
    const harness = createRuntimeBackedConversationService({
      tempPrefix: "maomi-desktop-conversation-clamped-compaction-threshold-",
      turnPort,
      contextWindow: 400,
      maxOutputTokens: 64,
    });

    try {
      const created = await harness.service.createSession({
        workspaceId: "workspace-1",
        title: "Clamped compaction threshold session",
        metadata: {
          conversationSettings: {
            contextCompressionThresholdPercent: 30,
          },
        },
      });

      await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "A".repeat(800),
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      const sent = await harness.service.sendMessage({
        sessionId: created.item.sessionId,
        text: "B".repeat(800),
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(sent.detail.currentContextBudget).toEqual(expect.objectContaining({
        runId: sent.detail.runs.at(-1)?.id,
        compressionThresholdPercent: 50,
        compressionThresholdTokens: 200,
        contextWindowTokens: 400,
        shouldAutoCompress: true,
        thresholdUsagePercent: 100,
        compaction: expect.objectContaining({
          status: "completed",
          reason: "budget_exceeded",
        }),
      }));
    } finally {
      harness.dispose();
    }
  });

  test("publishes initial active detail before materialization resolves", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-progress-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.progress-test",
    });
    const turnPort = new ScriptedDiagnosticTurnPort();
    const updates: Array<{ reason: string; status: string; runCount: number; messageCount: number }> = [];
    let releaseMaterializer: (() => void) | undefined;
    const materializerGate = new Promise<void>((resolve) => {
      releaseMaterializer = resolve;
    });
    let resolveInitialProgress:
      | ((value: { reason: string; status: string; runCount: number; messageCount: number }) => void)
      | undefined;
    const initialProgress = new Promise<{
      reason: string;
      status: string;
      runCount: number;
      messageCount: number;
    }>((resolve) => {
      resolveInitialProgress = resolve;
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        sessionDetailPublisher: async (update) => {
          const snapshot = {
            reason: update.reason,
            status: update.detail.status,
            runCount: update.detail.runs.length,
            messageCount: update.detail.messages.length,
          };

          updates.push(snapshot);
          if (
            snapshot.reason === "progress"
            && snapshot.status === "active"
            && snapshot.runCount === 0
            && snapshot.messageCount === 0
          ) {
            resolveInitialProgress?.(snapshot);
            resolveInitialProgress = undefined;
          }
        },
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            await materializerGate;
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort() {
            return turnPort;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Progress session",
      });

      const sendPromise = service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      const progress = await waitForValue(initialProgress, 1000, "initial progress publish");
      expect(progress).toEqual({
        reason: "progress",
        status: "active",
        runCount: 0,
        messageCount: 0,
      });

      releaseMaterializer?.();

      const blocked = await sendPromise;
      expect(blocked.detail.status).toBe("active");
      expect(blocked.detail.runs).toHaveLength(1);
      expect(updates.some((update) => update.reason === "final" && update.runCount === 1)).toBe(true);
    } finally {
      releaseMaterializer?.();
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("publishes streamed runtime text parts before sendMessage completes", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-streaming-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logs = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    );
    const logger = logs.createLogger({
      source: "desktop",
      module: "desktop.conversation.streaming-test",
    });
    let releaseStream: (() => void) | undefined;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const turnPort = new ScriptedStreamingTextTurnPort(streamGate);
    const runtimeUpdates: Array<{
      eventTypes: string[];
      detailReasons: string[];
    }> = [];
    let resolveFirstStreamPart:
      | ((value: Extract<DesktopConversationRuntimeEventsUpdateEvent["events"][number], { type: "message.parts.appended" }>) => void)
      | undefined;
    const firstStreamPart = new Promise<Extract<DesktopConversationRuntimeEventsUpdateEvent["events"][number], { type: "message.parts.appended" }>>((resolve) => {
      resolveFirstStreamPart = resolve;
    });
    let sendSettled = false;
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        runtimeEventsPublisher: async (update) => {
          runtimeUpdates.push({
            eventTypes: update.events.map((event) => event.type),
            detailReasons: [],
          });

          const firstPartEvent = update.events.find((event) => event.type === "message.parts.appended");
          if (firstPartEvent) {
            resolveFirstStreamPart?.(firstPartEvent);
            resolveFirstStreamPart = undefined;
          }
        },
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort() {
            return turnPort;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Streaming session",
      });

      const sendPromise = service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Stream the assistant reply",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      }).finally(() => {
        sendSettled = true;
      });

      const firstPartEvent = await waitForValue(firstStreamPart, 1000, "first streamed runtime event");
      expect(sendSettled).toBe(false);
      expect(firstPartEvent.message.parts).toEqual([{
        type: "text",
        partId: expect.any(String),
        text: "hello ",
      }]);

      releaseStream?.();

      const result = await sendPromise;
      expect(result.detail.status).toBe("idle");
      expect(result.detail.messages.at(-1)?.parts).toEqual([
        {
          type: "text",
          partId: expect.any(String),
          text: "hello stream",
        },
      ]);
      expect(runtimeUpdates.flatMap((update) => update.eventTypes).filter((type) => type === "message.parts.appended")).toHaveLength(2);
    } finally {
      releaseStream?.();
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("throttles active detail loads during long-running streamed replies", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-detail-throttle-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logs = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    );
    const logger = logs.createLogger({
      source: "desktop",
      module: "desktop.conversation.detail-throttle-test",
    });
    let releaseStream: (() => void) | undefined;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const turnPort = new ScriptedStreamingTextTurnPort(streamGate);
    const detailReasons: string[] = [];
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        sessionDetailPublisher: async (update) => {
          detailReasons.push(update.reason);
        },
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort() {
            return turnPort;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Detail throttle session",
      });

      const sendPromise = service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Keep the reply open for a while",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 3_300);
      });
      releaseStream?.();

      const result = await sendPromise;
      expect(result.detail.runs.at(-1)?.id).toBeTruthy();
      expect(detailReasons.at(-1)).toBe("final");
    } finally {
      releaseStream?.();
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("publishes provider telemetry stages into the runtime logger", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-provider-telemetry-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logs = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    );
    const logger = logs.createLogger({
      source: "desktop",
      module: "desktop.conversation.provider-telemetry-test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort(_selector, input) {
            return {
              async *stream() {
                await input.telemetrySink?.({
                  stage: "request_sent",
                  modelId: "moonshot-v1-8k",
                  runId: "run-provider-telemetry",
                  turnId: "turn-provider-telemetry",
                });
                await input.telemetrySink?.({
                  stage: "first_protocol_frame",
                  modelId: "moonshot-v1-8k",
                  runId: "run-provider-telemetry",
                  turnId: "turn-provider-telemetry",
                });
                await input.telemetrySink?.({
                  stage: "first_ai_event",
                  modelId: "moonshot-v1-8k",
                  runId: "run-provider-telemetry",
                  turnId: "turn-provider-telemetry",
                });
                yield { type: "text.start" };
                yield { type: "text.delta", delta: "telemetry wired" };
                yield { type: "text.end" };
                yield { type: "finish", reason: "stop" };
              },
            };
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Provider telemetry session",
      });

      const result = await service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the provider telemetry probe",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(result.detail.status).toBe("idle");
      const providerStageLogs = logs.query({ level: "debug" }).items.filter((item) => item.message === "Desktop AI provider stage");
      expect(providerStageLogs.map((item) => item.context?.stage)).toEqual(expect.arrayContaining([
        "request_sent",
        "first_protocol_frame",
        "first_ai_event",
      ]));
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("stops an active streamed reply without leaving the session in replying state", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-stop-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.stop-test",
    });
    let releaseStream: (() => void) | undefined;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const turnPort = new ScriptedStreamingTextTurnPort(streamGate);
    let resolveFirstStreamPart:
      | ((value: Extract<DesktopConversationRuntimeEventsUpdateEvent["events"][number], { type: "message.parts.appended" }>) => void)
      | undefined;
    const firstStreamPart = new Promise<Extract<DesktopConversationRuntimeEventsUpdateEvent["events"][number], { type: "message.parts.appended" }>>((resolve) => {
      resolveFirstStreamPart = resolve;
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        runtimeEventsPublisher: async (update) => {
          const firstPartEvent = update.events.find((event) => event.type === "message.parts.appended");
          if (firstPartEvent) {
            resolveFirstStreamPart?.(firstPartEvent);
            resolveFirstStreamPart = undefined;
          }
        },
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort() {
            return turnPort;
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Streaming stop session",
      });

      const sendPromise = service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Stream the assistant reply",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      await waitForValue(firstStreamPart, 1000, "first streamed runtime event before stop");

      const stopResult = await service.stopMessage({
        sessionId: created.item.sessionId,
      });
      expect(stopResult.stopped).toBe(true);
      expect(stopResult.detail.status).toBe("idle");
      expect(stopResult.detail.messages.at(-1)?.parts).toEqual([
        {
          type: "text",
          partId: expect.any(String),
          text: "hello ",
        },
      ]);

      const sendResult = await sendPromise;
      expect(sendResult.detail.status).toBe("idle");
      expect(sendResult.detail.messages.at(-1)?.parts).toEqual([
        {
          type: "text",
          partId: expect.any(String),
          text: "hello ",
        },
      ]);
    } finally {
      releaseStream?.();
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("marks the session failed when materialization throws after initial progress", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-failure-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logs = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    );
    const logger = logs.createLogger({
      source: "desktop",
      module: "desktop.conversation.failure-test",
    });
    const updates: Array<{ reason: string; status: string; runCount: number; messageCount: number }> = [];
    let resolveFailureFinal:
      | ((value: { reason: string; status: string; runCount: number; messageCount: number }) => void)
      | undefined;
    const failureFinal = new Promise<{
      reason: string;
      status: string;
      runCount: number;
      messageCount: number;
    }>((resolve) => {
      resolveFailureFinal = resolve;
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        sessionDetailPublisher: async (update) => {
          const snapshot = {
            reason: update.reason,
            status: update.detail.status,
            runCount: update.detail.runs.length,
            messageCount: update.detail.messages.length,
          };

          updates.push(snapshot);
          if (snapshot.reason === "final" && snapshot.status === "failed") {
            resolveFailureFinal?.(snapshot);
            resolveFailureFinal = undefined;
          }
        },
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize() {
            throw new Error("materializer unavailable");
          },
        },
        aiRuntime: {
          createTurnPort() {
            return new ScriptedDiagnosticTurnPort();
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Failure session",
      });

      let thrown: unknown;
      try {
        await service.sendMessage({
          sessionId: created.item.sessionId,
          text: "Run the diagnostic tool",
          scope: "workspace",
          selectedChannelId: "kimi",
          selectedModelId: "moonshot-v1-8k",
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("materializer unavailable");

      const failure = await waitForValue(failureFinal, 1000, "failure final publish");
      expect(failure).toEqual({
        reason: "final",
        status: "failed",
        runCount: 0,
        messageCount: 0,
      });

      const stored = await service.getSession(created.item.sessionId);
      expect(stored?.status).toBe("failed");
      expect(updates.some((update) => update.reason === "progress" && update.status === "active")).toBe(true);
      const failureLog = logs.query({ level: "error" }).items.find((item) => item.message === "Desktop conversation message failed");
      expect(failureLog?.context).toEqual(expect.objectContaining({
        sessionId: created.item.sessionId,
        workspaceId: "workspace-1",
        error: "materializer unavailable",
      }));
      expect(failureLog?.stack?.includes("materializer unavailable")).toBe(true);
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });

  test("fails a hung provider stream after exhausting managed auto-retries", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomi-desktop-conversation-timeout-"));
    const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
    const database = new DesktopDatabaseService(configuration);
    const logger = new RuntimeLogsService(
      new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    ).createLogger({
      source: "desktop",
      module: "desktop.conversation.timeout-test",
    });
    const service = new DesktopConversationService(
      new DesktopConversationStore(database.getConnection("conversation")),
      logger,
      {
        conversationDbPath: database.getConnection("conversation").path,
        turnNoActivityTimeoutMs: 25,
        agents: {
          async list() {
            return {
              items: [],
              meta: {
                total: 0,
                limit: 0,
                offset: 0,
                hasMore: false,
              },
            };
          },
        },
        materializer: {
          async materialize(input) {
            return {
              executionProfile: {
                id: "desktop.openai.kimi.moonshot-v1-8k" as never,
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                metadata: {
                  providerType: "openai",
                  channelId: input.selectedChannelId ?? "kimi",
                  modelId: input.selectedModelId ?? "moonshot-v1-8k",
                  protocolFamily: "openai",
                  apiStyle: "responses",
                  ...(input.scope ? { scope: input.scope } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                },
              },
              runtimeSelector: {
                protocolFamily: "openai",
                apiStyle: "responses",
              },
              resolveServiceConfig: async () => ({
                apiKey: "sk-test",
                baseUrl: "https://moonshot.example/v1",
              }),
              target: {
                providerType: "openai",
                channelId: input.selectedChannelId ?? "kimi",
                modelId: input.selectedModelId ?? "moonshot-v1-8k",
                protocolFamily: "openai",
                apiStyle: "responses",
              },
            };
          },
        },
        aiRuntime: {
          createTurnPort() {
            return {
              async *stream() {
                await new Promise<void>(() => {
                  // Intentionally never resolves; DesktopConversationTurnPort should cut this off.
                });
              },
            };
          },
        },
      },
    );

    try {
      const created = await service.createSession({
        workspaceId: "workspace-1",
        title: "Hung runtime session",
      });

      const failed = await waitForValue(service.sendMessage({
        sessionId: created.item.sessionId,
        text: "Run the diagnostic tool",
        scope: "workspace",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      }), 1000, "hung provider timeout");

      expect(failed.detail.status).toBe("failed");
      expect(failed.detail.runs).toHaveLength(3);
      expect(failed.detail.runs.every((run) => run.status === "failed")).toBe(true);
      expect(failed.detail.runs.at(-1)?.boundary?.kind).toBe("failed");
      expect(failed.detail.runs.at(-1)?.boundary).toMatchObject({
        kind: "failed",
        error: {
          code: "provider_runtime_timeout",
          message: "The reply took too long without visible progress. Please try again.",
          retryable: true,
          metadata: {
            channelId: "kimi",
            modelId: "moonshot-v1-8k",
            providerType: "openai",
            protocolFamily: "openai",
            apiStyle: "responses",
            timeoutMs: 25,
            technicalMessage: "Desktop AI runtime produced no activity for 25ms.",
          },
        },
      });
      expect(failed.detail.metadata?.managedExecutionStopReason).toBe("auto_retry_exhausted");
      expect(failed.detail.metadata).toMatchObject({
        managedAutoRetryCount: 2,
        managedAutoRetryMaxAttempts: 2,
        retryPolicyBucket: "inactivity",
      });
      expect(failed.detail.messages.some((message) => message.role === "user")).toBe(true);
    } finally {
      service.dispose();
      database.dispose();
      cleanupTempRoot(tempRoot);
    }
  });
});
