import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Database } from "bun:sqlite";
import type { ToolExecutorPort, ToolExecutionContext, ToolExecutionOutcome } from "#maomiagent/kernel/core";
import {
  DefaultToolVisibilityPolicy,
  type ToolVisibilityInput,
} from "#maomiagent/kernel/src/host/tools/tool-visibility-policy";
import type {
  DynamicToolRuntimeInput,
  DynamicToolRuntimePort,
  ToolCatalogSnapshot,
  ToolSourceSnapshot,
} from "#maomiagent/kernel/src/host/tools";

import {
  AgentRegistry,
  CompactionCoordinator,
  CompactionEngine,
  ConversationRuntimeEventProjector,
  consumeSessionPermissionOnceGrant,
  ContextContributorRegistry,
  ConversationTurnOutputLoader,
  DefaultContextViewBuilder,
  DynamicToolRuntime,
  InteractionBridge,
  InteractionCoordinator,
  InteractionReplyService,
  KernelRunEngine,
  LocalToolExecutor,
  PendingInteractionHost,
  projectConversationCheckpoint,
  projectConversationInteraction,
  projectConversationMessage,
  projectConversationToolCall,
  RandomIdGeneratorAdapter,
  RunLifecycleService,
  RunResumeService,
  RuntimeTurnInputAssembler,
  SessionHost,
  SqliteContextCheckpointStoreAdapter,
  SqliteInteractionStoreAdapter,
  SqliteMessageStoreAdapter,
  SqliteRunStoreAdapter,
  SqliteSessionStoreAdapter,
  SqliteToolCallStoreAdapter,
  SqliteTurnStoreAdapter,
  SqliteUnitOfWorkAdapter,
  SystemClockAdapter,
  TextStreamProcessor,
  TextTurnPlanner,
  asAiExecutionProfileId,
  asInteractionId,
  asMessageId,
  asMessagePartId,
  asSessionId,
  type AgentDescriptor,
  type AgentPolicyDecision,
  type AgentPolicyInput,
  type AgentPolicyResolver,
  type AiExecutionProfileRef,
  type AiTurnEvent,
  type AiTurnPort,
  type AiTurnRequest,
  type ConversationRuntimeEvent,
  type ContextContributor,
  type ContextContributorInput,
  type ConversationCheckpointEntry,
  type ConversationInteractionEntry,
  type ConversationMessageEntry,
  type ConversationTimelineEntry,
  type ConversationToolCallEntry,
  type ExecutionProfilePolicyInput,
  type ExecutionProfilePolicyResolver,
  type FormInteractionRequest,
  type InteractionRecord,
  type KernelMetadata,
  type MessagePart,
  type MessageRecordWithParts,
  type PermissionInteractionRequest,
  type QuestionInteractionRequest,
  type RegisteredToolHandler,
  type RetryBackoffPolicy,
  type RunBoundary,
  type RunRecord,
  type SessionRecord,
  type ToolCallRecord,
  type ToolDescriptor,
  type ToolSource,
  type TurnRecord,
  isFormInteractionResponse,
  isQuestionInteractionResponse,
  isRejectedInteractionResponse,
} from "../../kernel-bridge";
import { buildPromptEnvelope } from "#maomiagent/kernel/src/core/context";
import { RoughTokenEstimator } from "#maomiagent/kernel/src/core/algorithms/context/token-estimator";

import type {
  DesktopAiExecutionMaterialization,
  DesktopAiExecutionProfileMaterializationInput,
} from "../../abstraction/models/desktop-ai-one-shot.models";
import type {
  DesktopAiProviderServiceConfig,
  DesktopAiProviderTelemetryEvent,
} from "../../abstraction/models/desktop-ai-runtime.models";
import type {
  DesktopAiConversationRuntimeCreateInput,
  DesktopAiConversationContinueTurnInput,
  DesktopAiConversationStartUserTurnInput,
} from "../../abstraction/models/desktop-ai-conversation-runtime.models";
import type { DesktopAiExecutionProfileMaterializerPort } from "../../abstraction/ports/desktop-ai-one-shot.ports";
import type { DesktopAiRuntimePort } from "../../abstraction/ports/desktop-ai-runtime.ports";
import type { AgentItem, DesktopAgentsQueryPort } from "../../../agents";
import type { DesktopTaskRecord, DesktopTasksQueryPort } from "../../../tasks";
import type {
  DesktopConversationCompactionStatusSummary,
  DesktopConversationContextBudgetSummary,
  DesktopConversationAttachmentInput,
  DesktopConversationCapabilityPreferences,
  DesktopConversationComposerMode,
  DesktopConversationRunItem,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
  DesktopConversationTokenUsageSummary,
} from "../../../../../shared/desktop-conversation";
import {
  buildDesktopConversationPermissionRuleScope,
  DESKTOP_CONVERSATION_ASSET_BASE_URL,
  filterConversationMessagesForCheckpoint,
  resolveActiveConversationCheckpoint,
} from "../../../../../shared/desktop-conversation";
import {
  FEISHU_DOC_WRITER_AGENT_ID,
  UI_DESIGNER_AGENT_ID,
  UI_DESIGNER_CONTEXT_METADATA_KEY,
} from "../../../../../shared/conversation/managed-execution";
import {
  applyConversationFunctionCallPreferenceToTurnRequest,
  applyConversationHistoryPruningToTurnRequest,
  normalizeProviderFacingTurnRequest,
} from "../shared/turn-request-normalizers";

type DesktopAiConversationRuntimeOptions = {
  conversationDbPath: string;
  agents: Pick<DesktopAgentsQueryPort, "list">;
  aiRuntime: Pick<DesktopAiRuntimePort, "createTurnPort">;
  materializer: Pick<DesktopAiExecutionProfileMaterializerPort, "materialize">;
  turnNoActivityTimeoutMs?: number;
  tasksQuery?: Pick<DesktopTasksQueryPort, "get">;
  toolSources?: ToolSource[];
  toolHandlers?: RegisteredToolHandler[];
  toolContributionResolver?: DesktopAiConversationRuntimeCreateInput["toolContributionResolver"];
  runtimeEventsPublisher?: (
    update: import("../../../../../shared/desktop-conversation").DesktopConversationRuntimeEventsUpdateEvent,
  ) => void | Promise<void>;
  providerTelemetryPublisher?: (
    event: DesktopAiProviderTelemetryEvent,
  ) => void | Promise<void>;
};

type DesktopConversationToolContribution = NonNullable<Awaited<ReturnType<NonNullable<
  DesktopAiConversationRuntimeCreateInput["toolContributionResolver"]
>>>>;

type PermissionRuleDecision = "approve_always" | "reject";
type PermissionDecision = PermissionRuleDecision | "approve_once";
type DiagnosticInteractionKind = "permission" | "question" | "form";

type SessionPermissionRule = {
  scope: string;
  permission: string;
  decision: PermissionRuleDecision;
  updatedAt: number;
  note?: string;
};

const CONTEXT_TOKEN_ESTIMATOR = new RoughTokenEstimator();
const DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT = 80;
const CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN = 50;
const CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX = 90;
const MEDIUM_PROMPT_TURN_NO_ACTIVITY_TIMEOUT_MS = 180_000;
const LARGE_PROMPT_TURN_NO_ACTIVITY_TIMEOUT_MS = 240_000;
const EXTRA_LARGE_PROMPT_TURN_NO_ACTIVITY_TIMEOUT_MS = 300_000;
const FEISHU_DOC_WRITER_TURN_NO_ACTIVITY_TIMEOUT_MS = 420_000;
const MEDIUM_PROMPT_TOKEN_THRESHOLD = 6_000;
const LARGE_PROMPT_TOKEN_THRESHOLD = 12_000;
const EXTRA_LARGE_PROMPT_TOKEN_THRESHOLD = 20_000;
const CONVERSATION_PROVIDER_RETRY_POLICY = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 15_000,
  jitterRatio: 0.2,
} as const satisfies RetryBackoffPolicy;

function normalizeOptionalPositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeOptionalPercentNumber(value: unknown): number | undefined {
  const normalized = normalizeOptionalPositiveFiniteNumber(value);
  if (normalized === undefined) {
    return undefined;
  }

  const rounded = Math.round(normalized / 5) * 5;
  return Math.min(
    CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
    Math.max(CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN, rounded),
  );
}

function resolveContextCompressionThresholdPercent(value: unknown): number {
  return normalizeOptionalPercentNumber(value) ?? DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT;
}

function roundPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readExecutionProfileNumericMetadata(
  executionProfile: AiExecutionProfileRef,
  key: string,
): number | undefined {
  return normalizeOptionalPositiveFiniteNumber(
    isRecord(executionProfile.metadata) ? executionProfile.metadata[key] : undefined,
  );
}

function readExecutionProfileBooleanMetadata(
  executionProfile: AiExecutionProfileRef,
  key: string,
): boolean | undefined {
  const metadata = isRecord(executionProfile.metadata) ? executionProfile.metadata : undefined;
  return typeof metadata?.[key] === "boolean" ? metadata[key] as boolean : undefined;
}

function readExecutionProfileStringMetadata(
  executionProfile: AiExecutionProfileRef,
  key: string,
): string | undefined {
  const metadata = isRecord(executionProfile.metadata) ? executionProfile.metadata : undefined;
  return typeof metadata?.[key] === "string" && metadata[key].trim()
    ? metadata[key].trim()
    : undefined;
}

function readExecutionProfileCompressionThresholdPercent(
  executionProfile: AiExecutionProfileRef,
): number {
  return resolveContextCompressionThresholdPercent(
    isRecord(executionProfile.metadata)
      ? executionProfile.metadata.contextCompressionThresholdPercent
      : undefined,
  );
}

function shouldSkipExecutionProfileBudgetPrecheck(executionProfile: AiExecutionProfileRef): boolean {
  const metadata = isRecord(executionProfile.metadata) ? executionProfile.metadata : undefined;
  return metadata?.compactionStatus === "completed"
    && normalizeOptionalPositiveFiniteNumber(metadata.compactionAttempt) !== undefined;
}

export function applyConversationThinkingPreferenceToServiceConfig(input: {
  executionProfile: AiExecutionProfileRef;
  serviceConfig: DesktopAiProviderServiceConfig;
}): DesktopAiProviderServiceConfig {
  const apiStyle = readExecutionProfileStringMetadata(input.executionProfile, "apiStyle");
  if (apiStyle === "chat-completions") {
    return {
      ...input.serviceConfig,
      reasoning: undefined,
    };
  }

  if (readExecutionProfileBooleanMetadata(input.executionProfile, "thinkingEnabled") !== false) {
    return input.serviceConfig;
  }

  return {
    ...input.serviceConfig,
    reasoning: undefined,
  };
}
export {
  applyConversationFunctionCallPreferenceToTurnRequest,
  applyConversationHistoryPruningToTurnRequest,
  normalizeProviderFacingTurnRequest,
};

export function resolveConversationTurnNoActivityTimeoutMs(input: {
  baseTimeoutMs: number;
  estimatedPromptTokens?: number;
  agentId?: string;
  hasFeishuDocContext?: boolean;
}): number {
  const baseTimeoutMs = normalizeTimeoutMs(input.baseTimeoutMs, DEFAULT_TURN_NO_ACTIVITY_TIMEOUT_MS);
  const estimatedPromptTokens = normalizeOptionalPositiveFiniteNumber(input.estimatedPromptTokens);
  const agentId = normalizeOptionalText(input.agentId);

  if (agentId === FEISHU_DOC_WRITER_AGENT_ID || input.hasFeishuDocContext) {
    return Math.max(baseTimeoutMs, FEISHU_DOC_WRITER_TURN_NO_ACTIVITY_TIMEOUT_MS);
  }

  if (!estimatedPromptTokens) {
    return baseTimeoutMs;
  }

  if (estimatedPromptTokens >= EXTRA_LARGE_PROMPT_TOKEN_THRESHOLD) {
    return Math.max(baseTimeoutMs, EXTRA_LARGE_PROMPT_TURN_NO_ACTIVITY_TIMEOUT_MS);
  }

  if (estimatedPromptTokens >= LARGE_PROMPT_TOKEN_THRESHOLD) {
    return Math.max(baseTimeoutMs, LARGE_PROMPT_TURN_NO_ACTIVITY_TIMEOUT_MS);
  }

  if (estimatedPromptTokens >= MEDIUM_PROMPT_TOKEN_THRESHOLD) {
    return Math.max(baseTimeoutMs, MEDIUM_PROMPT_TURN_NO_ACTIVITY_TIMEOUT_MS);
  }

  return baseTimeoutMs;
}

export function resolveConversationTurnAgentId(
  prompt: AiTurnRequest["prompt"],
): string | undefined {
  const desktopAgentBlock = [...prompt.systemBlocks].reverse().find((block) => {
    if (!isRecord(block.metadata)) {
      return false;
    }

    return normalizeOptionalText(block.metadata.source) === "desktop.agent"
      && Boolean(normalizeOptionalText(block.metadata.agentId));
  });
  const systemAgentId = desktopAgentBlock && isRecord(desktopAgentBlock.metadata)
    ? normalizeOptionalText(desktopAgentBlock.metadata.agentId)
    : undefined;

  return systemAgentId ?? normalizeOptionalText(prompt.agentId);
}

export function promptContainsFeishuDocContext(
  prompt: AiTurnRequest["prompt"],
): boolean {
  if (prompt.systemBlocks.some((block) => FEISHU_DOC_CONTEXT_PATH_RE.test(block.content))) {
    return true;
  }

  if (prompt.contextBlocks.some((block) => FEISHU_DOC_CONTEXT_PATH_RE.test(block.content))) {
    return true;
  }

  return prompt.messages.some((message) => message.parts.some((part) => {
    if (part.type === "text") {
      return FEISHU_DOC_CONTEXT_PATH_RE.test(part.text)
        || part.text.includes(".maomi/feishu-docs/");
    }

    if (part.type === "tool_call_ref") {
      const serializedInput = serializePromptPartValue(part.input);
      return FEISHU_DOC_CONTEXT_PATH_RE.test(serializedInput)
        || serializedInput.includes(".maomi/feishu-docs/");
    }

    if (part.type === "tool_result_ref") {
      const serializedOutput = serializePromptPartValue(part.output);
      return FEISHU_DOC_CONTEXT_PATH_RE.test(serializedOutput)
        || serializedOutput.includes(".maomi/feishu-docs/");
    }

    return false;
  }));
}

function serializePromptPartValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return typeof serialized === "string" ? serialized : "";
}

export function buildConversationProviderRetryPolicy(): RetryBackoffPolicy {
  return {
    ...CONVERSATION_PROVIDER_RETRY_POLICY,
  };
}

export function applyConversationTimeoutToServiceConfig(input: {
  serviceConfig: DesktopAiProviderServiceConfig;
  timeoutMs: number;
}): DesktopAiProviderServiceConfig {
  return {
    ...input.serviceConfig,
    timeoutMs: Math.max(
      normalizeOptionalPositiveFiniteNumber(input.serviceConfig.timeoutMs) ?? 0,
      input.timeoutMs,
    ),
  };
}

export function mergeConversationExecutionProfile(input: {
  requestedExecutionProfile: AiExecutionProfileRef;
  materializedExecutionProfile: AiExecutionProfileRef;
}): AiExecutionProfileRef {
  const requestedMetadata = isRecord(input.requestedExecutionProfile.metadata)
    ? input.requestedExecutionProfile.metadata
    : undefined;
  const materializedMetadata = isRecord(input.materializedExecutionProfile.metadata)
    ? input.materializedExecutionProfile.metadata
    : undefined;
  const mergedMetadata = {
    ...(requestedMetadata ?? {}),
    ...(materializedMetadata ?? {}),
  };

  return {
    ...input.materializedExecutionProfile,
    metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
  };
}

function readRunCompactionSummary(run: RunRecord): DesktopConversationCompactionStatusSummary | undefined {
  const compaction = isRecord(run.metadata?.compaction)
    ? run.metadata.compaction as Record<string, unknown>
    : undefined;
  if (!compaction) {
    return undefined;
  }
  const status = compaction?.status;
  if (status !== "running" && status !== "completed" && status !== "failed") {
    return undefined;
  }

  const attempt = normalizeOptionalPositiveFiniteNumber(compaction.attempt);
  const startedAt = normalizeOptionalPositiveFiniteNumber(compaction.startedAt);
  if (!attempt || !startedAt) {
    return undefined;
  }

  const reason = compaction.reason === "context_overflow"
    || compaction.reason === "budget_exceeded"
    || compaction.reason === "manual"
    ? compaction.reason
    : undefined;
  const summary: DesktopConversationCompactionStatusSummary = {
    status,
    attempt,
    startedAt: new Date(startedAt).toISOString(),
    ...(reason ? { reason } : {}),
  };

  const completedAt = normalizeOptionalPositiveFiniteNumber(compaction.completedAt);
  if (completedAt) {
    summary.completedAt = new Date(completedAt).toISOString();
  }

  const failedAt = normalizeOptionalPositiveFiniteNumber(compaction.failedAt);
  if (failedAt) {
    summary.failedAt = new Date(failedAt).toISOString();
  }

  const prunedMessageCount = normalizeOptionalPositiveFiniteNumber(compaction.prunedMessageCount);
  if (prunedMessageCount !== undefined) {
    summary.prunedMessageCount = prunedMessageCount;
  }

  const protectedMessageCount = normalizeOptionalPositiveFiniteNumber(compaction.protectedMessageCount);
  if (protectedMessageCount !== undefined) {
    summary.protectedMessageCount = protectedMessageCount;
  }

  if (typeof compaction.continuationKind === "string" && compaction.continuationKind.trim()) {
    summary.continuationKind = compaction.continuationKind.trim();
  }

  const error = isRecord(compaction.error) ? compaction.error : undefined;
  if (typeof error?.message === "string" && error.message.trim()) {
    summary.errorMessage = error.message.trim();
  }

  return summary;
}

function buildContextBudgetSummary(input: {
  runId: string;
  prompt: AiTurnRequest["prompt"];
  modelId?: string;
  channelId?: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  compressionThresholdPercent?: number;
  compaction?: DesktopConversationCompactionStatusSummary;
}): DesktopConversationContextBudgetSummary {
  const estimate = CONTEXT_TOKEN_ESTIMATOR.estimate({
    envelope: input.prompt,
  });
  const contextWindowTokens = normalizeOptionalPositiveFiniteNumber(input.contextWindowTokens);
  const thresholdPercent = normalizeOptionalPercentNumber(input.compressionThresholdPercent);
  const compressionThresholdTokens = contextWindowTokens && thresholdPercent
    ? Math.max(1, Math.floor((contextWindowTokens * thresholdPercent) / 100))
    : undefined;
  const promptUsagePercent = contextWindowTokens
    ? roundPercent((estimate.promptTokens / contextWindowTokens) * 100)
    : undefined;
  const thresholdUsagePercent = compressionThresholdTokens
    ? roundPercent((estimate.promptTokens / compressionThresholdTokens) * 100)
    : undefined;

  return {
    runId: input.runId,
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    estimatedPromptTokens: estimate.promptTokens,
    ...(contextWindowTokens ? { contextWindowTokens } : {}),
    ...(normalizeOptionalPositiveFiniteNumber(input.maxOutputTokens)
      ? { maxOutputTokens: normalizeOptionalPositiveFiniteNumber(input.maxOutputTokens)! }
      : {}),
    ...(thresholdPercent ? { compressionThresholdPercent: thresholdPercent } : {}),
    ...(compressionThresholdTokens ? { compressionThresholdTokens } : {}),
    ...(promptUsagePercent !== undefined ? { promptUsagePercent } : {}),
    ...(thresholdUsagePercent !== undefined ? { thresholdUsagePercent } : {}),
    shouldAutoCompress: compressionThresholdTokens !== undefined
      ? estimate.promptTokens >= compressionThresholdTokens
      : false,
    breakdown: {
      ...estimate.breakdown,
    },
    ...(input.compaction ? { compaction: input.compaction } : {}),
  };
}

type PlanModeToolAccess = "read" | "task_write" | "document_write" | "readonly_command" | "deny";

const USER_ABORTED_TURN_ERROR_CODE = "conversation_turn_aborted";

type ActiveConversationTurn = {
  controller: AbortController;
  completion: Promise<void>;
};

type ConversationRuntimeSettingsSnapshot = {
  composerMode?: DesktopConversationComposerMode;
  approvalMode?: "auto" | "manual";
  contextCompressionThresholdPercent?: number;
  managedExecutionEnabled?: boolean;
  memoryEnabled?: boolean;
  sandboxEnabled?: boolean;
  feishuSmartAssistantEnabled?: boolean;
  capabilityPreferences?: DesktopConversationCapabilityPreferences;
};

const LEGACY_CAPABILITY_PREFERENCE_IDS = new Set([
  "memory.runtime",
  "feishu.smartAssistant",
]);

type DesktopRuntimeAgentDecision = AgentPolicyDecision;

const INTERACTION_GOVERNANCE_KEY = "interactionGovernance";
const PERMISSION_RULES_KEY = "permissionRules";
const APPROVAL_MODE_KEY = "approvalMode";
const CONVERSATION_SETTINGS_KEY = "conversationSettings";
const DEFAULT_AGENT_ID = "desktop.primary";
const DEFAULT_TURN_NO_ACTIVITY_TIMEOUT_MS = 180_000;
const DESKTOP_CONVERSATION_BUILTIN_TOOL_SOURCE_ID = "builtin.desktop.conversation";
const DESKTOP_CONVERSATION_ASSET_PATH_RE = /^\/workspace\/([^/]+)\/conversations\/assets\/([^/]+)\/([^/]+)$/;
const WORKSPACE_REFERENCE_RE = /(workspace|repo|repository|codebase|project|git|branch|commit|diff|local|locally|current workspace|current project|current repo|package\.json|go\.mod|cargo\.toml|requirements\.txt|工作区|仓库|代码库|项目|工程|本地|分支|提交|差异)/iu;
const EXPLICIT_LOCAL_WORKSPACE_REFERENCE_RE = /(current workspace|current project|current repo|this workspace|this project|this repo|local|locally|当前工作区|当前项目|当前仓库|这个工作区|这个项目|这个仓库|本地)/iu;
const DEICTIC_WORKSPACE_SURFACE_RE = /(this|current|existing|当前|这个|现有).{0,8}(error|bug|issue|failure|regression|file|function|class|hook|component|page|screen|view|module|service|button|dialog|modal|table|layout|chat|terminal|报错|问题|故障|回归|文件|函数|类|组件|页面|模块|服务|按钮|弹窗|表格|布局|对话|终端)/iu;
const LOCAL_REPAIR_INTENT_RE = /(fix|debug|repair|patch|refactor|review|inspect|investigate|diagnose|test|verify|run|build|compile|lint|修复|调试|排查|修|改|补|重构|评审|检查|调查|诊断|测试|验证|运行|构建|编译).{0,24}(bug|issue|error|failure|regression|page|screen|view|component|module|service|hook|button|dialog|modal|table|layout|chat|terminal|报错|问题|故障|回归|页面|界面|组件|模块|服务|按钮|弹窗|表格|布局|对话|终端)/iu;
const COMMAND_OPERATION_INTENT_RE = /((run|execute|start|open|launch|invoke|use|在|用).{0,16}(terminal|shell|cmd|powershell|bash|zsh|命令行|终端|命令))|((terminal|shell|cmd|powershell|bash|zsh|命令行|终端).{0,16}(run|execute|start|open|command|script|执行|运行|启动|打开|命令))/iu;
const FILE_OR_PROJECT_OPERATION_INTENT_RE = /((create|modify|edit|update|write|save|add|remove|rename|delete|scaffold|setup|initialize|init|generate|创建|修改|编辑|更新|写入|保存|新增|删除|重命名|脚手架|搭建|初始化|生成).{0,24}(file|folder|directory|project|workspace|repo|repository|package\.json|go\.mod|cargo\.toml|requirements\.txt|readme|文件|目录|文件夹|项目|工程|工作区|仓库|代码库|脚手架|骨架))|((file|folder|directory|project|workspace|repo|repository|package\.json|go\.mod|cargo\.toml|requirements\.txt|readme|文件|目录|文件夹|项目|工程|工作区|仓库|代码库|脚手架|骨架).{0,24}(create|modify|edit|update|write|save|add|remove|rename|delete|scaffold|setup|initialize|init|generate|创建|修改|编辑|更新|写入|保存|新增|删除|重命名|脚手架|搭建|初始化|生成))/iu;
const EXPLICIT_RUNTIME_OPERATION_INTENT_RE = /((run|execute|start|open|launch|test|verify|validate|check|preview|visit|browse|delegate|dispatch|invoke|运行|执行|启动|打开|测试|验证|检查|预览|访问|浏览|委派|调度|调用|跑起来|跑一下).{0,24}(test|tests|build|lint|typecheck|compile|page|browser|url|website|site|server|service|program|app|terminal|shell|cmd|powershell|bash|agent|subagent|playwright|测试|构建|编译|页面|浏览器|网址|网站|服务|程序|应用|终端|命令行|智能体|子智能体))|((test|tests|build|lint|typecheck|compile|page|browser|url|website|site|server|service|program|app|terminal|shell|cmd|powershell|bash|agent|subagent|playwright|测试|构建|编译|页面|浏览器|网址|网站|服务|程序|应用|终端|命令行|智能体|子智能体).{0,24}(run|execute|start|open|launch|test|verify|validate|check|preview|visit|browse|delegate|dispatch|invoke|运行|执行|启动|打开|测试|验证|检查|预览|访问|浏览|委派|调度|调用|跑起来|跑一下))/iu;
const EXPLANATION_REQUEST_RE = /(what|why|how|explain|tell me|describe|介绍|解释|说明|什么|为什么|怎么|为何|聊聊|分析一下)/iu;
const STANDALONE_CODE_ACTION_RE = /(write|implement|create|generate|show|give me|make|build|写|实现|创建|生成|给我|做一个|来个|帮我写)/iu;
const STANDALONE_CODE_SUBJECT_RE = /(algorithm|hash|regex|snippet|example|sample|demo|function|class|component|script|form|sdk|library|cli|算法|哈希|正则|代码片段|示例|例子|函数|类|组件|脚本|表单|库|命令行工具)/iu;
const PROGRAMMING_LANGUAGE_RE = /(go|golang|python|javascript|typescript|java|rust|c\+\+|c#|ruby|php|swift|kotlin|sql|react|vue|next\.js|node\.js|bun)/iu;
const FEISHU_DOC_CONTEXT_PATH_RE = /(original_markdown_path|local_draft_path|<feishu_doc_context>)/iu;
const MANAGED_RUN_MODE_VALUES = new Set(["hosted_autopilot", "long_task_orchestration"]);

let desktopConversationAssetServer: ReturnType<typeof Bun.serve> | null = null;
let desktopConversationAssetServerExternal = false;
const desktopConversationAssetRoots = new Set<string>();

function nowMs() {
  return Date.now();
}

function readComposerModeMetadata(
  metadata: KernelMetadata | undefined,
): DesktopConversationComposerMode | undefined {
  const value = isRecord(metadata) ? metadata.composerMode : undefined;
  return value === "agent" || value === "plan" ? value : undefined;
}

type DesktopConversationPlanState = {
  content: string;
  updatedAt?: string;
  status?: "draft" | "approved";
  approvedAt?: string;
};

const DESKTOP_CONVERSATION_PLAN_STATE_KEY = "planState";

function readPlanStateMetadata(
  metadata: KernelMetadata | undefined,
): DesktopConversationPlanState | undefined {
  const value = isRecord(metadata?.[DESKTOP_CONVERSATION_PLAN_STATE_KEY])
    ? metadata[DESKTOP_CONVERSATION_PLAN_STATE_KEY] as Record<string, unknown>
    : undefined;
  const content = normalizeOptionalText(value?.content);
  if (!content) {
    return undefined;
  }

  const updatedAt = normalizeOptionalText(value?.updatedAt);
  const status = value?.status === "draft" || value?.status === "approved"
    ? value.status
    : undefined;
  const approvedAt = normalizeOptionalText(value?.approvedAt);
  return {
    content,
    ...(updatedAt ? { updatedAt } : {}),
    ...(status ? { status } : {}),
    ...(approvedAt ? { approvedAt } : {}),
  };
}

function resolvePlanState(input: {
  session: SessionRecord;
  run: RunRecord;
}): DesktopConversationPlanState | undefined {
  return readPlanStateMetadata(input.session.metadata)
    ?? readPlanStateMetadata(input.run.metadata);
}

function buildPlanStatePatch(input: {
  content: string;
  status?: "draft" | "approved";
  approvedAt?: string;
  updatedAt?: string;
}): Record<string, unknown> {
  return {
    [DESKTOP_CONVERSATION_PLAN_STATE_KEY]: {
      content: input.content.trim(),
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      ...(input.status ? { status: input.status } : {}),
      ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
    },
  };
}

function mergeMetadata(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!current && !patch) {
    return undefined;
  }

  const next: Record<string, unknown> = {
    ...(current ?? {}),
  };

  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) {
      delete next[key];
      continue;
    }

    next[key] = value;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function readRunModeMetadata(metadata: KernelMetadata | undefined): string | undefined {
  const value = isRecord(metadata) ? metadata.runMode : undefined;
  return typeof value === "string" ? value : undefined;
}

function isPlanConversationMode(input: {
  session: SessionRecord;
  run: RunRecord;
}): boolean {
  return readComposerModeMetadata(input.run.metadata) === "plan"
    || readComposerModeMetadata(input.session.metadata) === "plan";
}

function readToolOperationKind(tool: ToolDescriptor): string | undefined {
  return normalizeOptionalText(tool.metadata?.operationKind);
}

function isTerminalExecutionTool(tool: ToolDescriptor): boolean {
  return tool.name === "terminal_execute";
}

function isTerminalOutputReadTool(tool: ToolDescriptor): boolean {
  return tool.name === "terminal_read_output";
}

function isDedicatedWorkspaceFileEditTool(tool: ToolDescriptor): boolean {
  if (tool.name === "workspace_write_document") {
    return false;
  }

  if (
    tool.name === "workspace_write_file"
    || tool.name === "apply_patch"
    || tool.name === "create_file"
    || tool.name === "edit_file"
  ) {
    return true;
  }

  const operationKind = readToolOperationKind(tool);
  if (operationKind === "file_write") {
    return true;
  }

  return /(patch|write[_-]?file|create[_-]?file|edit[_-]?file|update[_-]?file|replace[_-]?in[_-]?file)/iu
    .test(tool.name);
}

function buildToolUsagePolicyLines(tools: readonly ToolDescriptor[]): string[] {
  const basePolicyLines = [
    "Tool usage policy:",
    "- When a tool is needed, use the runtime's native tool-calling mechanism directly.",
    "- Never emit fake tool syntax in assistant text, including <tool_call>, <function=...>, XML tags, JSON wrappers, or handwritten tool transcripts.",
  ];
  const hasTerminalExecution = tools.some((tool) => isTerminalExecutionTool(tool));
  const hasTerminalOutputRead = tools.some((tool) => isTerminalOutputReadTool(tool));
  const preferredFileEditTools = tools.filter((tool) => isDedicatedWorkspaceFileEditTool(tool));
  if (!hasTerminalExecution && !hasTerminalOutputRead) {
    return basePolicyLines;
  }

  const lines = [...basePolicyLines];

  if (preferredFileEditTools.length > 0) {
    lines.push(
      "- Prefer dedicated file-edit tools for creating or updating workspace files in one operation.",
      "- When modifying an existing long file, prefer targeted edit/patch tools over rewriting the whole file.",
      "- As soon as you know the section boundary to change, call the file-edit tool directly instead of drafting a full replacement in assistant text first.",
      "- If a file-edit tool can handle the target path, do not use terminal commands to assemble file contents line by line.",
      "- Avoid shell file-writing patterns like echo >>, printf >, cat <<EOF, tee, Set-Content, Add-Content, and Out-File when a dedicated file-edit tool is available.",
    );
  }

  if (hasTerminalExecution && hasTerminalOutputRead) {
    lines.push(
      "- When you need command output, run the underlying command once with terminal_execute and inspect the captured result with terminal_read_output.",
      "- Avoid shell paging or truncation patterns like | more, | less, | head, | tail, or PowerShell Select-Object -First/-Last when terminal_read_output is available.",
    );
  }

  lines.push("- Use terminal tools for running programs, tests, builds, version control, and environment inspection.");
  return lines;
}

function readPlanModeToolAccessMetadata(tool: ToolDescriptor): PlanModeToolAccess | undefined {
  const value = normalizeOptionalText(tool.metadata?.planModeAccess);
  return value === "read"
    || value === "task_write"
    || value === "document_write"
    || value === "readonly_command"
    || value === "deny"
    ? value
    : undefined;
}

function isPlanModeOnlyTool(tool: ToolDescriptor): boolean {
  return tool.metadata?.planModeOnly === true;
}

function isManagedConversationExecutionMode(input: {
  session: SessionRecord;
  run: RunRecord;
}): boolean {
  return input.run.metadata?.managedExecution === true
    || input.session.metadata?.managedExecution === true
    || MANAGED_RUN_MODE_VALUES.has(readRunModeMetadata(input.run.metadata) ?? "")
    || MANAGED_RUN_MODE_VALUES.has(readRunModeMetadata(input.session.metadata) ?? "");
}

function resolvePlanModeToolAccess(tool: ToolDescriptor): PlanModeToolAccess {
  const explicitAccess = readPlanModeToolAccessMetadata(tool);
  if (explicitAccess) {
    return explicitAccess;
  }

  if (tool.name === "workspace_write_document") {
    return "document_write";
  }

  if (tool.name === "maomi_managed_task") {
    return "task_write";
  }

  if (
    tool.name === "terminal_create_session"
    || tool.name === "terminal_execute"
    || tool.name === "terminal_close_session"
  ) {
    return "readonly_command";
  }

  const operationKind = readToolOperationKind(tool);
  if (
    operationKind === "file_read"
    || operationKind === "workspace_access"
    || operationKind === "search"
    || operationKind === "instruction_lookup"
  ) {
    return "read";
  }

  return "deny";
}

const PLAN_MODE_FORBIDDEN_COMMAND_FRAGMENT_RE = /(\r|\n|&&|\|\||[><|;&`])/u;
const PLAN_MODE_MUTATING_COMMAND_PATTERNS = [
  /^(mkdir|md|rmdir|rm|del|erase|mv|move|ren|rename|cp|copy|touch)\b/iu,
  /^(New-Item|Remove-Item|Move-Item|Rename-Item|Copy-Item|Set-Content|Add-Content|Out-File)\b/iu,
  /^git\s+(add|apply|am|restore|checkout|switch|reset|clean|commit|merge|rebase|cherry-pick|stash|tag|push|pull|fetch|clone)\b/iu,
  /^(npm|pnpm|yarn|bun)\s+(install|add|remove|update|upgrade|create|init|dlx|x)\b/iu,
  /^(npx|pnpm\s+dlx|bun\s+x)\b/iu,
  /^(cargo|go|dotnet|pip|uv|poetry)\s+(new|init|add|install|sync|build|publish|restore)\b/iu,
];

const PLAN_MODE_ALLOWED_DOCUMENT_EXTENSION_SET = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const PLAN_MODE_ROOT_README_RE = /^README(?:[._-][^/\\]+)?\.md$/iu;

function isPlanModeToolAllowed(input: {
  tool: ToolDescriptor;
  isManagedToolTurn?: boolean;
}): boolean {
  const access = resolvePlanModeToolAccess(input.tool);
  if (access === "read" || access === "readonly_command" || access === "document_write") {
    return true;
  }

  if (access === "task_write") {
    return isPlanModeOnlyTool(input.tool) || input.isManagedToolTurn === true;
  }

  return false;
}

function readTerminalCommandInput(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const command = normalizeOptionalText(value.command);
  if (command) {
    return command;
  }

  return normalizeOptionalText(value.text);
}

const INEFFICIENT_TERMINAL_FILE_WRITE_PATTERNS = [
  /(?:^|[\s;(])(?:echo|printf)\b[\s\S]*?(?:>>|>)\s*[^\s]+/iu,
  /(?:^|[\s;(])cat\b[\s\S]*?<</iu,
  /(?:^|[\s;(])tee(?:\.exe)?\b/iu,
  /(?:^|[\s;(])(?:Set-Content|Add-Content|Out-File)\b/iu,
];

const INEFFICIENT_TERMINAL_OUTPUT_CAPTURE_PATTERNS = [
  /\|\s*(?:more|less)\b/iu,
  /\|\s*(?:head|tail)\b/iu,
  /\|\s*Select-Object\b[\s\S]*?(?:-First|-Last)\b/iu,
];

function isInefficientTerminalFileWriteCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  return INEFFICIENT_TERMINAL_FILE_WRITE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isInefficientTerminalOutputCaptureCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  return INEFFICIENT_TERMINAL_OUTPUT_CAPTURE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function readWorkspaceDocumentPathInput(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return normalizeOptionalText(value.path);
}

function normalizePlanModeWorkspaceDocumentPath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isAllowedPlanModeWorkspaceDocumentPath(path: string): boolean {
  const normalized = normalizePlanModeWorkspaceDocumentPath(path);
  if (!normalized || normalized.endsWith("/")) {
    return false;
  }

  if (!normalized.includes("/")) {
    return PLAN_MODE_ROOT_README_RE.test(normalized);
  }

  if (!normalized.toLowerCase().startsWith("docs/")) {
    return false;
  }

  const extension = normalized.includes(".")
    ? normalized.slice(normalized.lastIndexOf(".")).toLowerCase()
    : "";
  return PLAN_MODE_ALLOWED_DOCUMENT_EXTENSION_SET.has(extension);
}

function isAllowedPlanModeInvestigationCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  if (PLAN_MODE_FORBIDDEN_COMMAND_FRAGMENT_RE.test(normalized)) {
    return false;
  }

  return !PLAN_MODE_MUTATING_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildPlanModeBlockedOutcome(input: {
  code: string;
  message: string;
  toolName: string;
  metadata?: Record<string, unknown>;
}): ToolExecutionOutcome {
  return {
    kind: "failed",
    error: {
      code: input.code,
      message: input.message,
      retryable: false,
      metadata: {
        toolName: input.toolName,
        composerMode: "plan",
        ...(input.metadata ?? {}),
      },
    },
  };
}

function buildToolPreferenceBlockedOutcome(input: {
  toolName: string;
  command: string;
  preferredToolNames: string[];
  code?: string;
  message?: string;
}): ToolExecutionOutcome {
  return {
    kind: "failed",
    error: {
      code: input.code ?? "terminal_file_edit_preferred_tool_required",
      message: input.message ?? "Dedicated file-edit tools are available in this turn. Use them instead of terminal_execute to write file contents.",
      retryable: false,
      metadata: {
        toolName: input.toolName,
        command: input.command,
        preferredToolNames: input.preferredToolNames,
      },
    },
  };
}

function guardPlanModeToolExecution(input: {
  call: ToolCallRecord;
  context: ToolExecutionContext;
  descriptor: ToolDescriptor;
}): ToolExecutionOutcome | undefined {
  if (!isPlanConversationMode(input.context)) {
    return undefined;
  }

  const access = resolvePlanModeToolAccess(input.descriptor);
  if (access === "deny") {
    return buildPlanModeBlockedOutcome({
      code: "plan_mode_tool_blocked",
      message: `Tool ${input.call.toolName} is not available in plan mode.`,
      toolName: input.call.toolName,
      metadata: {
        operationKind: readToolOperationKind(input.descriptor),
        access,
      },
    });
  }

  if (
    access === "task_write"
    && !isPlanModeOnlyTool(input.descriptor)
    && !isManagedConversationExecutionMode(input.context)
  ) {
    return buildPlanModeBlockedOutcome({
      code: "plan_mode_tool_blocked",
      message: `Tool ${input.call.toolName} is not available in plan mode unless the conversation is already in managed execution.`,
      toolName: input.call.toolName,
      metadata: {
        operationKind: readToolOperationKind(input.descriptor),
        access,
      },
    });
  }

  if (access === "document_write") {
    const path = readWorkspaceDocumentPathInput(input.call.input);
    if (!path || !isAllowedPlanModeWorkspaceDocumentPath(path)) {
      return buildPlanModeBlockedOutcome({
        code: "plan_mode_document_write_blocked",
        message: "Plan mode only allows writing docs/** and root README*.md documents.",
        toolName: input.call.toolName,
        metadata: {
          operationKind: readToolOperationKind(input.descriptor),
          access,
          ...(path ? { path } : {}),
        },
      });
    }

    return undefined;
  }

  if (access === "readonly_command" && input.call.toolName === "terminal_execute") {
    const command = readTerminalCommandInput(input.call.input);
    if (command && !isAllowedPlanModeInvestigationCommand(command)) {
      return buildPlanModeBlockedOutcome({
        code: "plan_mode_command_forbidden",
        message: "Plan mode only allows terminal commands that do not change workspace state.",
        toolName: input.call.toolName,
        metadata: {
          command,
          access,
        },
      });
    }
  }

  return undefined;
}

function guardTerminalFileEditPreference(input: {
  call: ToolCallRecord;
  descriptor: ToolDescriptor;
  handlers: readonly RegisteredToolHandler[];
}): ToolExecutionOutcome | undefined {
  if (!isTerminalExecutionTool(input.descriptor)) {
    return undefined;
  }

  const command = readTerminalCommandInput(input.call.input);
  if (!command || !isInefficientTerminalFileWriteCommand(command)) {
    return undefined;
  }

  const preferredToolNames = input.handlers
    .map((handler) => handler.descriptor)
    .filter((descriptor) => isDedicatedWorkspaceFileEditTool(descriptor))
    .map((descriptor) => descriptor.name);
  if (preferredToolNames.length === 0) {
    return undefined;
  }

  return buildToolPreferenceBlockedOutcome({
    toolName: input.call.toolName,
    command,
    preferredToolNames,
  });
}

function guardTerminalOutputReadPreference(input: {
  call: ToolCallRecord;
  descriptor: ToolDescriptor;
  handlers: readonly RegisteredToolHandler[];
}): ToolExecutionOutcome | undefined {
  if (!isTerminalExecutionTool(input.descriptor)) {
    return undefined;
  }

  const command = readTerminalCommandInput(input.call.input);
  if (!command || !isInefficientTerminalOutputCaptureCommand(command)) {
    return undefined;
  }

  const preferredToolNames = input.handlers
    .map((handler) => handler.descriptor)
    .filter((descriptor) => isTerminalOutputReadTool(descriptor))
    .map((descriptor) => descriptor.name);
  if (preferredToolNames.length === 0) {
    return undefined;
  }

  return buildToolPreferenceBlockedOutcome({
    toolName: input.call.toolName,
    command,
    preferredToolNames,
    code: "terminal_output_read_preferred_tool_required",
    message: "Run the underlying command with terminal_execute, then inspect the captured output with terminal_read_output instead of adding shell paging or truncation.",
  });
}

function isManagedConversationToolTurn(input: DynamicToolRuntimeInput): boolean {
  return isManagedConversationExecutionMode(input);
}

function extractLatestUserMessage(messages: readonly MessageRecordWithParts[]): MessageRecordWithParts | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.message.role === "user") {
      return message;
    }
  }

  return undefined;
}

function extractMessageText(message: MessageRecordWithParts | undefined): string | undefined {
  if (!message) {
    return undefined;
  }

  const text = message.parts.flatMap((part) => {
    if (part.type !== "text") {
      return [];
    }

    const value = normalizeOptionalText(part.text);
    return value ? [value] : [];
  }).join("\n");

  return normalizeOptionalText(text);
}

function messageHasAttachments(message: MessageRecordWithParts | undefined): boolean {
  return Boolean(message?.parts.some((part) => part.type === "attachment"));
}

export function shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn(input: {
  isManagedToolTurn?: boolean;
  latestUserText?: string;
  hasAttachments?: boolean;
  selectedAgentId?: string;
}): boolean {
  if (input.isManagedToolTurn) {
    return false;
  }

  if (normalizeOptionalText(input.selectedAgentId) === FEISHU_DOC_WRITER_AGENT_ID) {
    return false;
  }

  const latestUserText = normalizeOptionalText(input.latestUserText);
  if (!latestUserText) {
    return false;
  }

  if (input.hasAttachments) {
    return false;
  }

  if (
    FEISHU_DOC_CONTEXT_PATH_RE.test(latestUserText)
    || EXPLICIT_LOCAL_WORKSPACE_REFERENCE_RE.test(latestUserText)
    || WORKSPACE_REFERENCE_RE.test(latestUserText)
    || DEICTIC_WORKSPACE_SURFACE_RE.test(latestUserText)
    || LOCAL_REPAIR_INTENT_RE.test(latestUserText)
    || COMMAND_OPERATION_INTENT_RE.test(latestUserText)
    || FILE_OR_PROJECT_OPERATION_INTENT_RE.test(latestUserText)
    || EXPLICIT_RUNTIME_OPERATION_INTENT_RE.test(latestUserText)
  ) {
    return false;
  }

  if (EXPLANATION_REQUEST_RE.test(latestUserText)) {
    return true;
  }

  return STANDALONE_CODE_ACTION_RE.test(latestUserText)
    && (STANDALONE_CODE_SUBJECT_RE.test(latestUserText) || PROGRAMMING_LANGUAGE_RE.test(latestUserText));
}

function shouldRestrictDesktopConversationBuiltinTools(input: DynamicToolRuntimeInput): boolean {
  const latestUserMessage = extractLatestUserMessage(input.visibleMessages);
  const selectedAgentId = readSelectionMetadata(input.run.metadata).selectedAgentId
    ?? readSelectionMetadata(input.session.metadata).selectedAgentId;

  return shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn({
    isManagedToolTurn: isManagedConversationToolTurn(input),
    latestUserText: extractMessageText(latestUserMessage),
    hasAttachments: messageHasAttachments(latestUserMessage),
    selectedAgentId,
  });
}

class DesktopConversationToolVisibilityPolicy extends DefaultToolVisibilityPolicy {
  async isVisible(input: ToolVisibilityInput): Promise<boolean> {
    if (!await super.isVisible(input)) {
      return false;
    }

    if (isPlanConversationMode({ session: input.session, run: input.run })) {
      return isPlanModeToolAllowed({
        tool: input.tool,
        isManagedToolTurn: isManagedConversationToolTurn(input),
      });
    }

    if (isPlanModeOnlyTool(input.tool)) {
      return false;
    }

    if (input.source.sourceId !== DESKTOP_CONVERSATION_BUILTIN_TOOL_SOURCE_ID) {
      return true;
    }

    return !shouldRestrictDesktopConversationBuiltinTools(input);
  }
}

function normalizeTimeoutMs(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function parseIsoTimestamp(value: string | undefined, fallback = nowMs()): number {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalIsoTimestamp(value: string | undefined): number | undefined {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIsoTimestamp(value: number | undefined): string | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeAttachmentSize(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function sanitizePathSegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  return normalized || fallback;
}

function normalizeAttachmentMimeType(input: {
  mimeType?: string;
  kind: DesktopConversationAttachmentInput["kind"];
}) {
  const normalized = normalizeOptionalText(input.mimeType);
  if (normalized) {
    return normalized;
  }

  if (input.kind === "image") {
    return "image/*";
  }

  if (input.kind === "audio") {
    return "audio/*";
  }

  if (input.kind === "video") {
    return "video/*";
  }

  return "application/octet-stream";
}

function resolveConversationAssetRoot(conversationDbPath: string) {
  return path.join(path.dirname(conversationDbPath), "conversation-assets");
}

async function resolveConversationAssetFile(input: {
  assetRoot: string;
  workspaceId: string;
  assetMonth: string;
  assetId: string;
}) {
  const assetDirectory = path.join(
    input.assetRoot,
    sanitizePathSegment(input.workspaceId, "workspace"),
    input.assetMonth,
    input.assetId,
  );

  try {
    const entries = await readdir(assetDirectory, { withFileTypes: true });
    const fileEntry = entries.find((entry) => entry.isFile());
    return fileEntry ? path.join(assetDirectory, fileEntry.name) : undefined;
  } catch {
    return undefined;
  }
}

function ensureDesktopConversationAssetServer(assetRoot: string) {
  desktopConversationAssetRoots.add(assetRoot);
  if (desktopConversationAssetServer || desktopConversationAssetServerExternal) {
    return desktopConversationAssetServer;
  }

  const baseUrl = new URL(DESKTOP_CONVERSATION_ASSET_BASE_URL);
  try {
    desktopConversationAssetServer = Bun.serve({
      hostname: baseUrl.hostname,
      port: Number(baseUrl.port || 80),
      fetch: async (request) => {
        const url = new URL(request.url);
        const match = url.pathname.match(DESKTOP_CONVERSATION_ASSET_PATH_RE);
        if (!match) {
          return new Response("Not Found", { status: 404 });
        }

        const [, workspaceIdEncoded, assetMonthEncoded, assetIdEncoded] = match;
        const workspaceId = decodeURIComponent(workspaceIdEncoded ?? "");
        const assetMonth = decodeURIComponent(assetMonthEncoded ?? "");
        const assetId = decodeURIComponent(assetIdEncoded ?? "");

        for (const assetRootCandidate of desktopConversationAssetRoots) {
          const resolvedFile = await resolveConversationAssetFile({
            assetRoot: assetRootCandidate,
            workspaceId,
            assetMonth,
            assetId,
          });
          if (!resolvedFile) {
            continue;
          }

          const file = Bun.file(resolvedFile);
          return new Response(file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "Cache-Control": "private, max-age=31536000, immutable",
            },
          });
        }

        return new Response("Not Found", { status: 404 });
      },
    });
  } catch (error) {
    if (isAddressInUseError(error)) {
      desktopConversationAssetServerExternal = true;
      return desktopConversationAssetServer;
    }

    throw error;
  }

  return desktopConversationAssetServer;
}

function isAddressInUseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === "EADDRINUSE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type ExecutionProfileMetadataCandidate = {
  id: string;
  modelId?: unknown;
  metadata?: unknown;
};

function isExecutionProfileMetadataCandidate(value: unknown): value is ExecutionProfileMetadataCandidate {
  return isRecord(value) && typeof value.id === "string";
}

function cloneKernelMetadata(metadata: KernelMetadata | undefined): KernelMetadata | undefined {
  return metadata ? { ...metadata } : undefined;
}

function readSelectionMetadata(metadata: Record<string, unknown> | undefined) {
  return {
    selectedChannelId: normalizeOptionalText(metadata?.selectedChannelId),
    selectedModelId: normalizeOptionalText(metadata?.selectedModelId),
    selectedAgentId: normalizeOptionalText(metadata?.selectedAgentId),
    preferredAgentId: normalizeOptionalText(metadata?.preferredAgentId),
  };
}

function mapAgentItemToDescriptor(item: AgentItem, executionProfile: AiExecutionProfileRef): AgentDescriptor {
  return {
    id: item.agentId,
    description: item.description,
    defaultExecutionProfile: executionProfile,
    ...(typeof item.steps === "number" && Number.isFinite(item.steps)
      ? { maxSteps: Math.max(1, Math.trunc(item.steps)) }
      : {}),
    metadata: {
      mode: item.mode,
      source: item.source,
      ...(item.name ? { name: item.name } : {}),
      ...(item.prompt ? { prompt: item.prompt } : {}),
      ...(item.model ? { model: item.model } : {}),
      ...(item.modelStrategy ? { modelStrategy: { ...item.modelStrategy } } : {}),
      ...(item.identity ? { identity: { ...item.identity } } : {}),
      ...(item.tools ? { tools: { ...item.tools } } : {}),
      ...(item.skills ? { skills: { ...item.skills } } : {}),
      ...(item.workflow ? { workflow: { ...item.workflow } } : {}),
      ...(item.permission ? { permission: { ...item.permission } } : {}),
      ...(item.subAgentPolicy ? { subAgentPolicy: { ...item.subAgentPolicy } } : {}),
      ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
    },
  };
}

async function loadRuntimeAgents(input: {
  agents: Pick<DesktopAgentsQueryPort, "list">;
  executionProfile: AiExecutionProfileRef;
  preferredAgentId?: string;
}): Promise<{
  availableAgents: AgentDescriptor[];
  preferredAgentId?: string;
}> {
  const response = await input.agents.list({
    enabled: true,
    includeRuntimeAgents: true,
  });
  const availableAgents = response.items
    .filter((item) =>
      !item.hidden
      && (item.mode !== "subagent" || item.agentId === input.preferredAgentId))
    .map((item) => mapAgentItemToDescriptor(item, input.executionProfile));

  if (availableAgents.length === 0) {
    return {
      availableAgents: [{
        id: DEFAULT_AGENT_ID,
        description: "Desktop primary agent",
        defaultExecutionProfile: input.executionProfile,
      }],
      preferredAgentId: DEFAULT_AGENT_ID,
    };
  }

  const preferredAgentId = input.preferredAgentId && availableAgents.some((agent) => agent.id === input.preferredAgentId)
    ? input.preferredAgentId
    : availableAgents[0]?.id;

  return {
    availableAgents,
    preferredAgentId,
  };
}

function buildAgentSystemBlocks(
  availableAgents: readonly AgentDescriptor[],
  preferredAgentId?: string,
) {
  const selectedAgent = preferredAgentId
    ? availableAgents.find((agent) => agent.id === preferredAgentId)
    : availableAgents[0];
  const prompt = isRecord(selectedAgent?.metadata)
    ? normalizeOptionalText(selectedAgent.metadata.prompt)
    : undefined;

  if (!selectedAgent || !prompt) {
    return [];
  }

  return [{
    id: `desktop-agent-prompt:${selectedAgent.id}`,
    kind: "instruction" as const,
    content: prompt,
    priority: 100,
    metadata: {
      source: "desktop.agent",
      agentId: selectedAgent.id,
    },
  }];
}

function readWorkspaceId(metadata: Record<string, unknown> | undefined) {
  const directWorkspaceId = normalizeOptionalText(metadata?.workspaceId);
  if (directWorkspaceId) {
    return directWorkspaceId;
  }

  const preferredExecutionProfile = metadata?.preferredExecutionProfile;
  if (!isExecutionProfileMetadataCandidate(preferredExecutionProfile)) {
    return undefined;
  }

  return isRecord(preferredExecutionProfile.metadata)
    ? normalizeOptionalText(preferredExecutionProfile.metadata.workspaceId)
    : undefined;
}

function readManagedRootTaskId(metadata: Record<string, unknown> | undefined) {
  return normalizeOptionalText(metadata?.linkedRootTaskId)
    ?? normalizeOptionalText(metadata?.rootTaskId);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item));
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

const CONVERSATION_DETAIL_TRUNCATED_MARKER = "\n\n[conversation detail truncated to keep chat responsive]\n\n";
const CONVERSATION_DETAIL_HEAD_LENGTH = 6_000;
const CONVERSATION_DETAIL_TAIL_LENGTH = 3_000;
const CONVERSATION_DETAIL_MAX_TEXT_LENGTH = CONVERSATION_DETAIL_HEAD_LENGTH
  + CONVERSATION_DETAIL_TAIL_LENGTH
  + CONVERSATION_DETAIL_TRUNCATED_MARKER.length;

function truncateConversationDetailString(value: string) {
  if (value.length <= CONVERSATION_DETAIL_MAX_TEXT_LENGTH) {
    return value;
  }

  return `${value.slice(0, CONVERSATION_DETAIL_HEAD_LENGTH)}${CONVERSATION_DETAIL_TRUNCATED_MARKER}${value.slice(-CONVERSATION_DETAIL_TAIL_LENGTH)}`;
}

function truncateConversationDetailValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === "string") {
    return truncateConversationDetailString(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => truncateConversationDetailValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, truncateConversationDetailValue(entryValue, seen)]),
  );
}

function truncateConversationDetailMessagePart(
  part: ConversationMessageEntry["parts"][number],
): ConversationMessageEntry["parts"][number] {
  switch (part.type) {
    case "text":
    case "reasoning":
      return {
        ...part,
        text: truncateConversationDetailString(part.text),
      };
    case "tool_call":
      return {
        ...part,
        input: truncateConversationDetailValue(part.input),
      };
    case "error":
      return {
        ...part,
        error: truncateConversationDetailValue(part.error) as typeof part.error,
      };
    case "meta":
      return {
        ...part,
        data: truncateConversationDetailValue(part.data) as typeof part.data,
      };
    default:
      return part;
  }
}

function truncateConversationDetailMessage(message: ConversationMessageEntry): ConversationMessageEntry {
  return {
    ...message,
    metadata: truncateConversationDetailValue(message.metadata) as KernelMetadata | undefined,
    parts: message.parts.map((part) => truncateConversationDetailMessagePart(part)),
  };
}

function truncateConversationDetailToolCall(call: ConversationToolCallEntry): ConversationToolCallEntry {
  return {
    ...call,
    input: truncateConversationDetailValue(call.input),
    output: truncateConversationDetailValue(call.output),
    error: truncateConversationDetailValue(call.error) as typeof call.error,
    metadata: truncateConversationDetailValue(call.metadata) as KernelMetadata | undefined,
  };
}

function truncateConversationDetailInteraction(
  interaction: ConversationInteractionEntry,
): ConversationInteractionEntry {
  return {
    ...interaction,
    request: truncateConversationDetailValue(interaction.request) as typeof interaction.request,
    response: truncateConversationDetailValue(interaction.response) as typeof interaction.response,
    metadata: truncateConversationDetailValue(interaction.metadata) as KernelMetadata | undefined,
  };
}

function truncateConversationDetailCheckpoint(
  checkpoint: ConversationCheckpointEntry,
): ConversationCheckpointEntry {
  return {
    ...checkpoint,
    metadata: truncateConversationDetailValue(checkpoint.metadata) as KernelMetadata | undefined,
  };
}

function serializeStructuredValue(value: unknown): string | undefined {
  const text = normalizeOptionalText(value);
  if (text) {
    return text;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }

    const normalizedItems = value
      .map((item) => normalizeOptionalText(item))
      .filter((item): item is string => Boolean(item));
    if (normalizedItems.length === value.length) {
      return normalizedItems.map((item) => `- ${item}`).join("\n");
    }

    return JSON.stringify(value, null, 2);
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0
      ? JSON.stringify(value, null, 2)
      : undefined;
  }

  return undefined;
}

function appendField(lines: string[], label: string, value: string | number | boolean | undefined) {
  if (value === undefined) {
    return;
  }

  const text = typeof value === "string"
    ? normalizeOptionalText(value)
    : String(value);
  if (!text) {
    return;
  }

  lines.push(`${label}: ${text}`);
}

function appendStructuredField(lines: string[], label: string, value: unknown) {
  const serialized = serializeStructuredValue(value);
  if (!serialized) {
    return;
  }

  const parts = serialized.split("\n");
  if (parts.length === 1) {
    lines.push(`${label}: ${parts[0]}`);
    return;
  }

  lines.push(`${label}:`);
  for (const part of parts) {
    lines.push(`  ${part}`);
  }
}

function formatTaskSteps(task: DesktopTaskRecord) {
  return task.steps.slice(0, 8).map((step) => {
    const message = normalizeOptionalText(step.message);
    return message
      ? `${step.status} ${step.title} - ${truncateText(message, 160)}`
      : `${step.status} ${step.title}`;
  });
}

function formatTaskOutputs(task: DesktopTaskRecord) {
  return (task.outputs ?? []).map((output) => `${output.name}: ${truncateText(output.value, 200)}`);
}

function extractMessagePreview(parts: readonly MessagePart[]) {
  const fragments: string[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      const text = normalizeOptionalText(part.text);
      if (text) {
        fragments.push(text);
      }
      continue;
    }

    fragments.push(`[${part.type}]`);
  }

  const preview = normalizeOptionalText(fragments.join(" "));
  return preview ? truncateText(preview, 240) : undefined;
}

function formatVisibleMessages(messages: readonly MessageRecordWithParts[]) {
  const recentMessages = messages.slice(-4);
  if (recentMessages.length === 0) {
    return ["none"];
  }

  return recentMessages.map((message) => {
    const preview = extractMessagePreview(message.parts) ?? "[no text content]";
    return `${message.message.role}: ${preview}`;
  });
}

export function buildDesktopConversationContinuationPolicyBlock(input: {
  run: Pick<RunRecord, "trigger">;
  visibleMessages: readonly MessageRecordWithParts[];
}): string | undefined {
  if (input.run.trigger.kind !== "tool_result" && input.run.trigger.kind !== "system_continue") {
    return undefined;
  }

  const latestUserMessage = extractLatestUserMessage(input.visibleMessages);
  const latestUserPreview = extractMessageText(latestUserMessage)
    ?? extractMessagePreview(latestUserMessage?.parts ?? []);
  const lines = [
    "Continuation facts:",
    `- Trigger: ${input.run.trigger.kind}.`,
    "- This run is a continuation from prior conversation state and recent tool or system results.",
    "- There is no new user message attached to this run.",
    "- Do not claim that the user said something, said nothing, changed goals, or asked a new question in this turn unless a visible user message explicitly shows it.",
    "- Describe only confirmed facts: the established user goal, completed actions, changed artifacts, latest findings, and the next step.",
  ];

  if (latestUserMessage) {
    lines.push(`- Latest confirmed user message id: ${latestUserMessage.message.id}.`);
  }

  if (latestUserPreview) {
    lines.push(`- Latest confirmed user message preview: ${latestUserPreview}`);
  }

  return lines.join("\n");
}

function formatCheckpointSummaries(checkpoints: ReadonlyArray<{
  kind: string;
  createdAt: number;
  summaryMessageId: string;
  replacesThroughMessageId: string;
}>) {
  if (checkpoints.length === 0) {
    return ["none"];
  }

  return checkpoints.slice(0, 3).map((checkpoint) =>
    `${checkpoint.kind} at ${new Date(checkpoint.createdAt).toISOString()} summary=${checkpoint.summaryMessageId} replacesThrough=${checkpoint.replacesThroughMessageId}`);
}

function buildManagedTaskPacket(task: DesktopTaskRecord) {
  const metadata = isRecord(task.metadata) ? task.metadata : undefined;
  const lines = ["Managed task packet"];

  appendField(lines, "rootTaskId", task.taskId);
  appendField(lines, "workspaceId", task.workspaceId);
  appendField(lines, "title", task.title);
  appendField(lines, "goal", task.goal);
  appendField(lines, "status", task.status);
  appendField(lines, "progress", `${task.progress}%`);
  appendField(lines, "taskType", task.taskType);
  appendField(lines, "executionMode", task.executionMode);
  appendField(lines, "runMode", task.runMode);
  appendField(lines, "linkedSessionId", task.linkedSessionId);
  appendField(lines, "agentId", task.agentId);
  appendField(lines, "lastRunId", task.lastRunId);
  appendField(lines, "managedExecutionStage", normalizeOptionalText(metadata?.managedExecutionStage));
  appendField(lines, "phase", normalizeOptionalText(metadata?.phase));
  appendField(lines, "managedExecutionStopReason", normalizeOptionalText(metadata?.managedExecutionStopReason));
  appendStructuredField(lines, "completionContract", metadata?.completionContract);
  appendStructuredField(lines, "verificationPlan", metadata?.verificationPlan);
  appendStructuredField(lines, "notificationPlan", metadata?.notificationPlan);
  appendStructuredField(lines, "wrapUpCommands", normalizeStringArray(metadata?.wrapUpCommands));
  appendStructuredField(lines, "steps", formatTaskSteps(task));
  appendStructuredField(lines, "outputs", formatTaskOutputs(task));
  appendStructuredField(lines, "error", task.error);

  return lines.join("\n");
}

function buildManagedResumePacket(input: {
  session: SessionRecord;
  run: RunRecord;
  visibleMessages: readonly MessageRecordWithParts[];
  checkpoints: ReadonlyArray<{
    kind: string;
    createdAt: number;
    summaryMessageId: string;
    replacesThroughMessageId: string;
  }>;
}) {
  const sessionMetadata = isRecord(input.session.metadata) ? input.session.metadata : undefined;
  const runMetadata = isRecord(input.run.metadata) ? input.run.metadata : undefined;
  const lines = ["Managed resume packet"];

  appendField(lines, "sessionId", input.session.id);
  appendField(lines, "parentSessionId", input.session.parentSessionId);
  appendField(lines, "sessionStatus", input.session.status);
  appendField(lines, "runId", input.run.id);
  appendField(lines, "runStatus", input.run.status);
  appendField(lines, "trigger", input.run.trigger.kind);
  appendField(
    lines,
    "preferredAgentId",
    normalizeOptionalText(runMetadata?.preferredAgentId)
      ?? normalizeOptionalText(runMetadata?.selectedAgentId)
      ?? normalizeOptionalText(sessionMetadata?.preferredExecutionAgentId)
      ?? normalizeOptionalText(sessionMetadata?.executionAgentId),
  );
  appendField(
    lines,
    "managedExecutionStage",
    normalizeOptionalText(runMetadata?.managedExecutionStage)
      ?? normalizeOptionalText(sessionMetadata?.managedExecutionStage),
  );
  appendField(
    lines,
    "phase",
    normalizeOptionalText(runMetadata?.phase)
      ?? normalizeOptionalText(sessionMetadata?.phase),
  );
  appendField(lines, "checkpointCount", input.checkpoints.length);
  appendStructuredField(lines, "recentVisibleMessages", formatVisibleMessages(input.visibleMessages));
  appendStructuredField(lines, "recentCheckpoints", formatCheckpointSummaries(input.checkpoints));

  return lines.join("\n");
}

function readUiDesignerContextMetadata(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.[UI_DESIGNER_CONTEXT_METADATA_KEY];
  return isRecord(value) ? value : undefined;
}

function buildUiDesignerContextBlock(context: Record<string, unknown>) {
  const lines = [
    "UI designer workspace context",
    "Use this as the active design package state. Stay focused on this package and do not switch into managed execution.",
  ];

  appendField(lines, "agentId", normalizeOptionalText(context.agentId));
  appendField(lines, "surface", normalizeOptionalText(context.surface));
  appendField(lines, "workspaceId", normalizeOptionalText(context.workspaceId));
  appendField(lines, "workspaceName", normalizeOptionalText(context.workspaceName));
  appendField(lines, "workspaceDirectoryPath", normalizeOptionalText(context.workspaceDirectoryPath));
  appendField(lines, "designPackagePath", normalizeOptionalText(context.designPackagePath));
  appendField(lines, "designRoot", normalizeOptionalText(context.designRoot));
  appendField(lines, "hasDesignSpec", typeof context.hasDesignSpec === "boolean" ? context.hasDesignSpec : undefined);
  appendField(lines, "shouldSendKickoff", typeof context.shouldSendKickoff === "boolean" ? context.shouldSendKickoff : undefined);
  appendField(lines, "lockReason", normalizeOptionalText(context.lockReason));
  appendField(lines, "focusBlock", normalizeOptionalText(context.focusBlock));
  appendStructuredField(lines, "readiness", context.readiness);
  appendStructuredField(lines, "preview", context.preview);
  appendStructuredField(lines, "designFiles", context.files);

  return lines.join("\n");
}

function readExecutionProfile(run: RunRecord, session: SessionRecord): AiExecutionProfileRef {
  const candidate = [run.metadata?.preferredExecutionProfile, session.metadata?.preferredExecutionProfile]
    .find(isExecutionProfileMetadataCandidate);
  if (!candidate) {
    throw new Error(`Desktop conversation execution profile is missing for run ${run.id}`);
  }

  const metadata = isRecord(candidate.metadata) ? { ...candidate.metadata } : {};
  const runSettings = readConversationSettingsRecord(run.metadata);
  const sessionSettings = readConversationSettingsRecord(session.metadata);
  const contextCompressionThresholdPercent =
    typeof runSettings?.contextCompressionThresholdPercent === "number"
      ? runSettings.contextCompressionThresholdPercent
      : (typeof sessionSettings?.contextCompressionThresholdPercent === "number"
          ? sessionSettings.contextCompressionThresholdPercent
          : undefined);
  const thinkingEnabled =
    typeof runSettings?.thinkingEnabled === "boolean"
      ? runSettings.thinkingEnabled
      : (typeof sessionSettings?.thinkingEnabled === "boolean"
          ? sessionSettings.thinkingEnabled
          : undefined);
  const compaction = isRecord(run.metadata?.compaction)
    ? run.metadata.compaction as Record<string, unknown>
    : undefined;

  if (typeof contextCompressionThresholdPercent === "number") {
    metadata.contextCompressionThresholdPercent = contextCompressionThresholdPercent;
  }
  if (typeof thinkingEnabled === "boolean") {
    metadata.thinkingEnabled = thinkingEnabled;
  }
  if (typeof compaction?.status === "string" && compaction.status.trim()) {
    metadata.compactionStatus = compaction.status.trim();
  }
  if (typeof compaction?.attempt === "number" && Number.isFinite(compaction.attempt)) {
    metadata.compactionAttempt = compaction.attempt;
  }

  return {
    id: asAiExecutionProfileId(candidate.id),
    modelId: normalizeOptionalText(candidate.modelId),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function normalizeSelectionScope(
  value: unknown,
): DesktopAiExecutionProfileMaterializationInput["scope"] {
  return value === "global" || value === "workspace"
    ? value
    : undefined;
}

function readExecutionProfileMaterializationInput(
  executionProfile: AiExecutionProfileRef,
): DesktopAiExecutionProfileMaterializationInput | undefined {
  const executionMetadata = isRecord(executionProfile.metadata)
    ? executionProfile.metadata
    : undefined;
  const selectedChannelId = normalizeOptionalText(executionMetadata?.channelId);
  const selectedModelId = normalizeOptionalText(executionMetadata?.modelId)
    ?? executionProfile.modelId;

  if (!selectedChannelId || !selectedModelId) {
    return undefined;
  }

  const scope = normalizeSelectionScope(executionMetadata?.scope);
  const workspaceId = normalizeOptionalText(executionMetadata?.workspaceId);

  return {
    ...(scope ? { scope } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    selectedChannelId,
    selectedModelId,
  };
}

function cacheExecutionMaterialization(
  cache: Map<string, DesktopAiExecutionMaterialization>,
  materialization: DesktopAiExecutionMaterialization,
  aliasId?: string,
) {
  cache.set(materialization.executionProfile.id, materialization);
  if (aliasId && aliasId !== materialization.executionProfile.id) {
    cache.set(aliasId, materialization);
  }
}

function cloneRunItem(run: RunRecord, boundary: RunBoundary | undefined): DesktopConversationRunItem {
  return {
    ...run,
    trigger: { ...run.trigger },
    metadata: cloneKernelMetadata(run.metadata),
    ...(boundary ? { boundary } : {}),
  };
}

function cloneKernelRunMetadata(metadata: RunRecord["metadata"]): RunRecord["metadata"] {
  return metadata ? { ...metadata } : undefined;
}

function readRunCompactionReason(run: RunRecord): Extract<RunBoundary, { kind: "awaiting_compaction" }> ["reason"] {
  const reason = normalizeOptionalText(isRecord(run.metadata?.compaction) ? run.metadata.compaction.reason : undefined);
  return reason === "budget_exceeded" ? "budget_exceeded" : "context_overflow";
}

function readStoredFailedRunBoundary(
  run: RunRecord,
): Extract<RunBoundary, { kind: "failed" }> | undefined {
  const storedBoundary = isRecord(run.metadata?.terminalBoundary)
    ? run.metadata.terminalBoundary
    : undefined;
  if (storedBoundary?.kind !== "failed") {
    return undefined;
  }

  const storedError = isRecord(storedBoundary.error)
    ? storedBoundary.error
    : undefined;
  if (!storedError) {
    return undefined;
  }

  const code = normalizeOptionalText(storedError?.code);
  const message = normalizeOptionalText(storedError?.message);
  if (!code || !message) {
    return undefined;
  }

  const retryable = typeof storedError.retryable === "boolean"
    ? storedError.retryable
    : undefined;
  const metadata = isRecord(storedError.metadata)
    ? storedError.metadata as KernelMetadata
    : undefined;

  return {
    kind: "failed",
    error: {
      code,
      message,
      ...(retryable !== undefined ? { retryable } : {}),
      ...(metadata ? { metadata } : {}),
    },
  };
}

function inferRunBoundary(input: {
  run: RunRecord;
  interactions: readonly InteractionRecord[];
}): RunBoundary | undefined {
  if (input.run.status === "completed") {
    return { kind: "completed" };
  }

  if (input.run.status === "blocked") {
    const pendingInteraction = input.interactions.find((item) => item.runId === input.run.id && item.status === "pending");
    return pendingInteraction
      ? {
          kind: "blocked",
          interactionId: pendingInteraction.id,
        }
      : undefined;
  }

  if (input.run.status === "awaiting_compaction") {
    return {
      kind: "awaiting_compaction",
      reason: readRunCompactionReason(input.run),
    };
  }

  if (input.run.status === "failed") {
    return readStoredFailedRunBoundary(input.run) ?? {
      kind: "failed",
      error: {
        code: "run_failed",
        message: `Desktop conversation run failed: ${input.run.id}`,
        retryable: false,
      },
    };
  }

  return undefined;
}

function sortRuns(runs: readonly RunRecord[]) {
  return [...runs].sort((left, right) =>
    left.startedAt - right.startedAt
    || left.updatedAt - right.updatedAt
    || left.id.localeCompare(right.id));
}

function sortMessages(messages: readonly ConversationMessageEntry[]) {
  return [...messages].sort((left, right) =>
    left.createdAt - right.createdAt
    || left.messageId.localeCompare(right.messageId));
}

function sortToolCalls(toolCalls: readonly ConversationToolCallEntry[]) {
  return [...toolCalls].sort((left, right) =>
    left.startedAt - right.startedAt
    || left.callId.localeCompare(right.callId));
}

function sortInteractions(interactions: readonly ConversationInteractionEntry[]) {
  return [...interactions].sort((left, right) =>
    left.createdAt - right.createdAt
    || left.interactionId.localeCompare(right.interactionId));
}

function sortCheckpoints(checkpoints: readonly ConversationCheckpointEntry[]) {
  return [...checkpoints].sort((left, right) =>
    left.createdAt - right.createdAt
    || left.checkpointId.localeCompare(right.checkpointId));
}

function summarizeRunTokenUsage(input: {
  runId: RunRecord["id"];
  turns: readonly TurnRecord[];
}): DesktopConversationTokenUsageSummary | undefined {
  const turnsWithUsage = input.turns.filter((turn) => turn.usage);
  if (turnsWithUsage.length === 0) {
    return undefined;
  }

  const latestTurnWithUsage = turnsWithUsage.at(-1);
  const profileMetadata = latestTurnWithUsage?.executionProfile.metadata;
  const inputTokens = turnsWithUsage.reduce((sum, turn) => sum + (turn.usage?.inputTokens ?? 0), 0);
  const outputTokens = turnsWithUsage.reduce((sum, turn) => sum + (turn.usage?.outputTokens ?? 0), 0);
  const reasoningTokens = turnsWithUsage.reduce((sum, turn) => sum + (turn.usage?.reasoningTokens ?? 0), 0);
  const cachedInputTokens = turnsWithUsage.reduce((sum, turn) => sum + (turn.usage?.cachedInputTokens ?? 0), 0);

  return {
    runId: input.runId,
    modelId: normalizeOptionalText(latestTurnWithUsage?.executionProfile.modelId)
      ?? (isRecord(profileMetadata) ? normalizeOptionalText(profileMetadata.modelId) : undefined),
    channelId: isRecord(profileMetadata) ? normalizeOptionalText(profileMetadata.channelId) : undefined,
    turnCount: turnsWithUsage.length,
    inputTokens,
    outputTokens,
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
    ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
    totalTokens: inputTokens + outputTokens,
  };
}

function buildTimeline(input: {
  messages: readonly ConversationMessageEntry[];
  toolCalls: readonly ConversationToolCallEntry[];
  interactions: readonly ConversationInteractionEntry[];
  checkpoints: readonly ConversationCheckpointEntry[];
}): ConversationTimelineEntry[] {
  return [
    ...input.messages.map((message) => ({
      type: "message" as const,
      at: message.createdAt,
      message,
    })),
    ...input.toolCalls.map((toolCall) => ({
      type: "tool_call" as const,
      at: toolCall.startedAt,
      toolCall,
    })),
    ...input.interactions.map((interaction) => ({
      type: "interaction" as const,
      at: interaction.createdAt,
      interaction,
    })),
    ...input.checkpoints.map((checkpoint) => ({
      type: "checkpoint" as const,
      at: checkpoint.createdAt,
      checkpoint,
    })),
  ].sort((left, right) => left.at - right.at);
}

function buildSessionMetadata(input: {
  item: DesktopConversationSessionItem;
  selectedChannelId?: string;
  selectedModelId?: string;
  selectedAgentId?: string;
}): KernelMetadata {
  const metadata: Record<string, unknown> = {
    ...(input.item.metadata ? { ...input.item.metadata } : {}),
    workspaceId: input.item.workspaceId,
  };

  if (input.selectedChannelId) {
    metadata.selectedChannelId = input.selectedChannelId;
  }
  if (input.selectedModelId) {
    metadata.selectedModelId = input.selectedModelId;
  }
  if (input.selectedAgentId) {
    metadata.selectedAgentId = input.selectedAgentId;
    metadata.preferredAgentId = input.selectedAgentId;
  }

  return metadata;
}

function buildPermissionRuleScope(request: PermissionInteractionRequest): string {
  return buildDesktopConversationPermissionRuleScope(request);
}

function parseSessionPermissionRules(metadata: SessionRecord["metadata"]): SessionPermissionRule[] {
  const governance = isRecord(metadata?.[INTERACTION_GOVERNANCE_KEY])
    ? metadata[INTERACTION_GOVERNANCE_KEY] as Record<string, unknown>
    : undefined;
  const rules = Array.isArray(governance?.[PERMISSION_RULES_KEY])
    ? governance[PERMISSION_RULES_KEY]
    : [];

  return rules.flatMap((rule) => {
    if (!isRecord(rule)) {
      return [];
    }

    if (
      typeof rule.scope !== "string"
      || typeof rule.permission !== "string"
      || (rule.decision !== "approve_always" && rule.decision !== "reject")
      || typeof rule.updatedAt !== "number"
    ) {
      return [];
    }

    return [{
      scope: rule.scope,
      permission: rule.permission,
      decision: rule.decision,
      updatedAt: rule.updatedAt,
      note: normalizeOptionalText(rule.note),
    }];
  });
}

function parseSessionApprovalMode(
  metadata: SessionRecord["metadata"],
): "auto" | "manual" | undefined {
  const governance = isRecord(metadata?.[INTERACTION_GOVERNANCE_KEY])
    ? metadata[INTERACTION_GOVERNANCE_KEY] as Record<string, unknown>
    : undefined;
  const approvalMode = governance?.[APPROVAL_MODE_KEY];
  return approvalMode === "auto" || approvalMode === "manual" ? approvalMode : undefined;
}

function readConversationSettingsRecord(
  metadata: KernelMetadata | undefined,
): Record<string, unknown> | undefined {
  return isRecord(metadata?.[CONVERSATION_SETTINGS_KEY])
    ? metadata[CONVERSATION_SETTINGS_KEY] as Record<string, unknown>
    : undefined;
}

function readCapabilityPreferences(
  value: unknown,
): DesktopConversationCapabilityPreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([key, entryValue]) => {
    const capabilityId = normalizeOptionalText(key);
    if (!capabilityId || typeof entryValue !== "boolean") {
      return [];
    }

    return [[capabilityId, entryValue] as const];
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function readConversationRuntimeSettingsSnapshot(input: {
  session: SessionRecord;
  run: RunRecord;
}): ConversationRuntimeSettingsSnapshot {
  const sessionSettings = readConversationSettingsRecord(input.session.metadata);
  const runSettings = readConversationSettingsRecord(input.run.metadata);

  return {
    composerMode: readComposerModeMetadata(input.run.metadata) ?? readComposerModeMetadata(input.session.metadata),
    approvalMode: parseSessionApprovalMode(input.run.metadata) ?? parseSessionApprovalMode(input.session.metadata),
    contextCompressionThresholdPercent: resolveContextCompressionThresholdPercent(
      typeof runSettings?.contextCompressionThresholdPercent === "number"
        ? runSettings.contextCompressionThresholdPercent
        : sessionSettings?.contextCompressionThresholdPercent,
    ),
    managedExecutionEnabled:
      typeof runSettings?.managedExecutionEnabled === "boolean"
        ? runSettings.managedExecutionEnabled
        : (typeof sessionSettings?.managedExecutionEnabled === "boolean"
            ? sessionSettings.managedExecutionEnabled
            : undefined),
    memoryEnabled:
      typeof runSettings?.memoryEnabled === "boolean"
        ? runSettings.memoryEnabled
        : (typeof sessionSettings?.memoryEnabled === "boolean"
            ? sessionSettings.memoryEnabled
            : undefined),
    sandboxEnabled:
      typeof runSettings?.sandboxEnabled === "boolean"
        ? runSettings.sandboxEnabled
        : (typeof sessionSettings?.sandboxEnabled === "boolean"
            ? sessionSettings.sandboxEnabled
            : undefined),
    feishuSmartAssistantEnabled:
      typeof runSettings?.feishuSmartAssistantEnabled === "boolean"
        ? runSettings.feishuSmartAssistantEnabled
        : (typeof sessionSettings?.feishuSmartAssistantEnabled === "boolean"
            ? sessionSettings.feishuSmartAssistantEnabled
            : undefined),
    capabilityPreferences:
      readCapabilityPreferences(runSettings?.capabilityPreferences)
      ?? readCapabilityPreferences(sessionSettings?.capabilityPreferences),
  };
}

function hasConversationRuntimeSettingsSnapshot(snapshot: ConversationRuntimeSettingsSnapshot): boolean {
  return (
    snapshot.composerMode !== undefined
    || snapshot.approvalMode !== undefined
    || snapshot.contextCompressionThresholdPercent !== undefined
    || snapshot.managedExecutionEnabled !== undefined
    || snapshot.memoryEnabled !== undefined
    || snapshot.sandboxEnabled !== undefined
    || snapshot.feishuSmartAssistantEnabled !== undefined
    || snapshot.capabilityPreferences !== undefined
  );
}

function formatConversationRuntimeSettingState(value: boolean | undefined): string {
  if (value === true) {
    return "enabled";
  }

  if (value === false) {
    return "disabled";
  }

  return "default";
}

function buildConversationRuntimeSettingsLines(snapshot: ConversationRuntimeSettingsSnapshot): string[] {
  const lines = ["Conversation settings:"];

  if (snapshot.composerMode) {
    lines.push(`- Composer mode: ${snapshot.composerMode}`);
  }
  if (snapshot.approvalMode) {
    lines.push(`- Approval mode: ${snapshot.approvalMode}`);
  }
  if (typeof snapshot.contextCompressionThresholdPercent === "number") {
    lines.push(`- Context compression preference: ${snapshot.contextCompressionThresholdPercent}%`);
  }
  if (snapshot.managedExecutionEnabled !== undefined) {
    lines.push(`- Managed execution default: ${formatConversationRuntimeSettingState(snapshot.managedExecutionEnabled)}`);
  }
  if (snapshot.memoryEnabled !== undefined) {
    lines.push(`- Memory MCP default: ${formatConversationRuntimeSettingState(snapshot.memoryEnabled)}`);
  }
  if (snapshot.sandboxEnabled !== undefined) {
    lines.push(`- Sandbox mode default: ${formatConversationRuntimeSettingState(snapshot.sandboxEnabled)}`);
  }
  if (snapshot.feishuSmartAssistantEnabled !== undefined) {
    lines.push(`- Feishu capability default: ${formatConversationRuntimeSettingState(snapshot.feishuSmartAssistantEnabled)}`);
  }
  for (const [capabilityId, enabled] of Object.entries(snapshot.capabilityPreferences ?? {})
    .filter(([capabilityId]) => !LEGACY_CAPABILITY_PREFERENCE_IDS.has(capabilityId))
    .sort(([left], [right]) => left.localeCompare(right, "en", { sensitivity: "base" }))) {
    lines.push(`- Capability default (${capabilityId}): ${formatConversationRuntimeSettingState(enabled)}`);
  }

  if (snapshot.composerMode === "plan") {
    lines.push("- Plan mode policy: investigate first, implement later. Read tools and non-mutating commands are allowed. Do not create or modify non-doc workspace files. Writing docs/** and root README*.md documents is allowed when it helps the plan. The plan artifact must be a structured execution plan with goals, implementation steps, task breakdown, validation, and at least one clear design view such as architecture, module design, or affected surfaces and ownership. Prefer literal headings like 'Goals & Constraints', 'Implementation Steps', 'Task Breakdown', and 'Validation' so approval can pass cleanly. Keep it updated via plan_write, then call plan_exit when it is ready for approval.");
  }

  return lines;
}

function buildPlanModeReminderBlock(planState: DesktopConversationPlanState | undefined): string {
  const planArtifactLines = planState
    ? [
        "## Plan Artifact",
        `- Current status: ${planState.status ?? "draft"}`,
        ...(planState.updatedAt ? [`- Updated at: ${planState.updatedAt}`] : []),
        "- The artifact must be a structured execution plan, not a dependency list or a loose idea list.",
        "- For non-trivial work, the artifact is incomplete unless it covers goals and constraints, ordered implementation steps, task breakdown, validation, and at least one concrete design view such as architecture, module design, or affected surfaces and ownership.",
        "- For feature-scoped work, the design view can be lightweight; it does not need full greenfield project architecture sections if the change boundaries are still clear.",
        "- Prefer an explicit Task Breakdown section or a clearly named checklist section such as Execution Checklist, Action Items, or Task List. Ordered implementation steps alone are usually not enough.",
        "- Use plan_write to replace the stored plan artifact with the latest full plan.",
        "- Call plan_exit when you want the user to approve leaving plan mode.",
      ]
    : [
        "## Plan Artifact",
        "- No plan artifact exists yet.",
        "- The first artifact must be a structured execution plan, not a dependency list or a loose idea list.",
        "- For non-trivial work, the artifact must cover goals and constraints, ordered implementation steps, task breakdown, validation, and at least one concrete design view such as architecture, module design, or affected surfaces and ownership.",
        "- For feature-scoped work, the design view can be lightweight; it does not need full greenfield project architecture sections if the change boundaries are still clear.",
        "- Prefer an explicit Task Breakdown section or a clearly named checklist section such as Execution Checklist, Action Items, or Task List. Ordered implementation steps alone are usually not enough.",
        "- Use plan_write to create the first full version of the plan.",
        "- Call plan_exit only after the artifact is ready for approval.",
      ];

  return [
    "# Plan Mode - System Reminder",
    "",
    "Plan mode is active. The user wants a plan first, not implementation.",
    "",
    "Strictly forbidden:",
    "- Creating or modifying workspace source/config files, git state, or project structure",
    "- Running commands that scaffold projects, install dependencies, build artifacts, or otherwise mutate workspace state",
    "- Starting implementation before the plan is ready and approved",
    "",
    "Allowed actions:",
    "- Read workspace and git context, and run investigation commands that do not change workspace state",
    "- Write supporting notes under docs/** or root README*.md when that helps the plan",
    "- Asking the user clarifying questions in your reply",
    "- Updating the dedicated plan artifact with plan_write",
    "- Updating internal planning state when the managed task tool is available in a managed conversation",
    "",
    ...planArtifactLines,
    "",
    "## Plan Workflow",
    "",
    "### Phase 1: Initial Understanding",
    "- Read the relevant code and inspect the current state with investigation tools",
    "- Identify the current entrypoints, ownership boundaries, data flow, and constraints that the final implementation must respect",
    "- Clarify ambiguities before locking in the plan",
    "- Do not create directories, bootstrap projects, or start implementation during this phase",
    "",
    "### Phase 2: Architecture and Module Design",
    "- Synthesize the implementation approach from the evidence you gathered",
    "- Define the target architecture, major runtime or data flow, state ownership, and critical boundaries or contracts",
    "- Name the concrete modules, components, services, stores, routes, schemas, or files that will own each responsibility",
    "- For feature-scoped work, this phase can stay lightweight: an affected-surfaces or ownership section is acceptable if it clearly explains what changes and why",
    "- Compare tradeoffs only when they materially affect execution",
    "",
    "### Phase 3: Implementation Breakdown",
    "- Break the work into ordered phases or tasks that can actually be executed in sequence",
    "- For each phase or task, describe the objective, main files or surfaces, dependency order, and expected result",
    "- Call out prerequisite work, migrations, rollout considerations, or unresolved risks when they matter",
    "",
    "### Phase 4: Final Plan",
    "- Store one recommended approach in the plan artifact, not every alternative",
    "- The final plan must include Goals/Constraints, Implementation Steps, Task Breakdown or a clearly named checklist section, Validation, and at least one concrete design view",
    "- For larger scopes, use dedicated Architecture and Module Design sections; for smaller feature work, a merged Affected Surfaces / Ownership section is acceptable",
    "- If you only wrote phase sequencing, add a dedicated Task Breakdown, Execution Checklist, Action Items, or Task List section before plan_exit",
    "- Name the critical files or surfaces that would change",
    "- A dependency list or component list alone is not a valid final plan",
    "- Before calling plan_exit, ensure the visible assistant reply summarizes the architecture, module design, execution phases, and key risks",
    "- Include an end-to-end verification plan",
    "",
    "### Completion Rule",
    "- End the turn by either asking a blocking question or calling plan_exit after the plan artifact is ready",
    "- plan_exit will be blocked if Task Breakdown, Validation, Goals/Constraints, or a concrete design view is missing",
    "- Do not start implementation until the user approves leaving plan mode",
  ].join("\n");
}

function buildPlanArtifactContextBlock(planState: DesktopConversationPlanState): string {
  return [
    "Plan artifact:",
    `- Status: ${planState.status ?? "draft"}`,
    ...(planState.updatedAt ? [`- Updated at: ${planState.updatedAt}`] : []),
    ...(planState.approvedAt ? [`- Approved at: ${planState.approvedAt}`] : []),
    "",
    planState.content,
  ].join("\n");
}

function resolvePermissionRuleDecision(input: {
  session: SessionRecord;
  interaction: PermissionInteractionRequest;
}): PermissionRuleDecision | undefined {
  const scope = buildPermissionRuleScope(input.interaction);
  const matched = parseSessionPermissionRules(input.session.metadata)
    .find((rule) => rule.scope === scope);
  return matched?.decision;
}

function parsePermissionDecisionResponse(value: unknown): PermissionDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const decision = value.decision;
  return decision === "approve_once" || decision === "approve_always" || decision === "reject"
    ? decision
    : undefined;
}

async function resolvePermissionDecision(input: {
  interactionStore: Pick<SqliteInteractionStoreAdapter, "get">;
  sessionStore: Pick<SqliteSessionStoreAdapter, "save">;
  session: SessionRecord;
  call: ToolCallRecord;
  request: PermissionInteractionRequest;
}): Promise<PermissionDecision | undefined> {
  const persistedDecision = resolvePermissionRuleDecision({
    session: input.session,
    interaction: input.request,
  });
  if (persistedDecision) {
    return persistedDecision;
  }

  if (parseSessionApprovalMode(input.session.metadata) === "auto") {
    return "approve_once";
  }

  const onceGrant = consumeSessionPermissionOnceGrant({
    session: input.session,
    request: input.request,
    updatedAt: nowMs(),
  });
  if (onceGrant.granted) {
    await input.sessionStore.save(onceGrant.session);
    return "approve_once";
  }

  if (!input.call.interactionId) {
    return undefined;
  }

  try {
    const interaction = await input.interactionStore.get(input.call.interactionId);
    if (interaction.status === "rejected" || isRejectedInteractionResponse(interaction.response)) {
      return "reject";
    }

    return interaction.status === "answered"
      ? parsePermissionDecisionResponse(interaction.response)
      : undefined;
  } catch {
    return undefined;
  }
}

function buildDiagnosticToolDescriptor(): ToolDescriptor {
  return {
    name: "desktop_diagnostic",
    description: "Runs a minimal desktop diagnostic action for conversation runtime validation.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
        },
        requireApproval: {
          type: "boolean",
        },
        interactionKind: {
          type: "string",
          enum: ["permission", "question", "form"],
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
    metadata: {
      toolSourceKind: "builtin",
      operationKind: "tool_execution",
      operationLabel: "Desktop diagnostic",
    },
  };
}

function buildPlanWriteToolDescriptor(): ToolDescriptor {
  return {
    name: "plan_write",
    description: "Create or replace the dedicated structured plan artifact for the current conversation session, including goals, scope-appropriate design coverage, implementation phases, task breakdown, validation, and relevant risks or open questions.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    metadata: {
      toolSourceKind: "builtin",
      operationKind: "tool_execution",
      operationLabel: "Write plan artifact",
      planModeAccess: "task_write",
      planModeOnly: true,
    },
  };
}

function buildPlanExitToolDescriptor(): ToolDescriptor {
  return {
    name: "plan_exit",
    description: "Ask the user to approve the current plan artifact and leave plan mode for the next turn.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    metadata: {
      toolSourceKind: "builtin",
      operationKind: "tool_execution",
      operationLabel: "Exit plan mode",
      planModeAccess: "task_write",
      planModeOnly: true,
    },
  };
}

function dedupeToolHandlersFirstWins(
  handlers: readonly RegisteredToolHandler[],
): RegisteredToolHandler[] {
  const seen = new Set<string>();
  const deduped: RegisteredToolHandler[] = [];

  for (const handler of handlers) {
    const toolName = handler.descriptor.name;
    if (seen.has(toolName)) {
      continue;
    }

    seen.add(toolName);
    deduped.push(handler);
  }

  return deduped;
}

async function resolveDesktopConversationToolContribution(input: {
  contributionResolver?: DesktopAiConversationRuntimeOptions["toolContributionResolver"];
  session: SessionRecord;
  run: RunRecord;
}): Promise<DesktopConversationToolContribution | undefined> {
  if (!input.contributionResolver) {
    return undefined;
  }

  const workspaceId = readWorkspaceId(input.run.metadata)
    ?? readWorkspaceId(input.session.metadata);
  if (!workspaceId) {
    return undefined;
  }

  return input.contributionResolver({
    workspaceId,
    sessionId: input.session.id,
    sessionMetadata: input.session.metadata,
    runMetadata: input.run.metadata,
  });
}

class DesktopConversationToolSource implements ToolSource {
  constructor(private readonly descriptors: readonly ToolDescriptor[]) {}

  async listTools() {
    return {
      source: {
        sourceId: DESKTOP_CONVERSATION_BUILTIN_TOOL_SOURCE_ID,
        signature: "desktop-conversation-builtin-v2",
        metadata: {
          toolSourceKind: "builtin",
        },
      },
      tools: [...this.descriptors],
    };
  }
}

class DesktopConversationCapabilityToolRuntime implements DynamicToolRuntimePort {
  constructor(
    private readonly baseSources: readonly ToolSource[],
    private readonly contributionResolver?: DesktopAiConversationRuntimeOptions["toolContributionResolver"],
  ) {}

  private async createRuntime(input: DynamicToolRuntimeInput) {
    const contribution = await resolveDesktopConversationToolContribution({
      contributionResolver: this.contributionResolver,
      session: input.session,
      run: input.run,
    });

    return new DynamicToolRuntime({
      sources: [
        ...this.baseSources,
        ...(contribution?.toolSources ?? []),
      ],
      visibilityPolicy: new DesktopConversationToolVisibilityPolicy(),
    });
  }

  async listSourceSnapshots(input: DynamicToolRuntimeInput): Promise<readonly ToolSourceSnapshot[]> {
    return (await this.createRuntime(input)).listSourceSnapshots(input);
  }

  async listCatalog(input: DynamicToolRuntimeInput): Promise<ToolCatalogSnapshot> {
    return (await this.createRuntime(input)).listCatalog(input);
  }

  async listTools(input: DynamicToolRuntimeInput): Promise<readonly ToolDescriptor[]> {
    return (await this.createRuntime(input)).listTools(input);
  }
}

class DesktopConversationCapabilityToolExecutor implements ToolExecutorPort {
  constructor(
    private readonly baseHandlers: readonly RegisteredToolHandler[],
    private readonly contributionResolver?: DesktopAiConversationRuntimeOptions["toolContributionResolver"],
    private readonly defaultTimeoutMs?: number,
  ) {}

  async execute(call: ToolCallRecord, context: ToolExecutionContext): Promise<ToolExecutionOutcome> {
    const contribution = await resolveDesktopConversationToolContribution({
      contributionResolver: this.contributionResolver,
      session: context.session,
      run: context.run,
    });

    const handlers = dedupeToolHandlersFirstWins([
      ...this.baseHandlers,
      ...(contribution?.toolHandlers ?? []),
    ]);
    const descriptor = handlers.find((handler) => handler.descriptor.name === call.toolName)?.descriptor;
    if (descriptor) {
      const blocked = guardPlanModeToolExecution({
        call,
        context,
        descriptor,
      });
      if (blocked) {
        return blocked;
      }

      const blockedByPreference = guardTerminalFileEditPreference({
        call,
        descriptor,
        handlers,
      });
      if (blockedByPreference) {
        return blockedByPreference;
      }

      const blockedByOutputPreference = guardTerminalOutputReadPreference({
        call,
        descriptor,
        handlers,
      });
      if (blockedByOutputPreference) {
        return blockedByOutputPreference;
      }
    }

    const executor = new LocalToolExecutor({
      handlers,
      defaultTimeoutMs: this.defaultTimeoutMs,
    });

    return executor.execute(call, context);
  }
}

class DesktopConversationAgentPolicyResolver implements AgentPolicyResolver {
  constructor(
    private readonly agents: Pick<DesktopAgentsQueryPort, "list">,
    private readonly decisions: Map<RunRecord["id"], DesktopRuntimeAgentDecision>,
  ) {}

  async resolve(input: AgentPolicyInput): Promise<AgentPolicyDecision> {
    const executionProfile = readExecutionProfile(input.run, input.session);
    const runSelection = readSelectionMetadata(input.run.metadata);
    const sessionSelection = readSelectionMetadata(input.session.metadata);
    const preferredAgentId = runSelection.selectedAgentId
      ?? runSelection.preferredAgentId
      ?? sessionSelection.selectedAgentId
      ?? sessionSelection.preferredAgentId;
    const runtimeAgents = await loadRuntimeAgents({
      agents: this.agents,
      executionProfile,
      preferredAgentId,
    });

    this.decisions.set(input.run.id, runtimeAgents);

    return runtimeAgents;
  }
}

class DesktopConversationExecutionProfilePolicyResolver implements ExecutionProfilePolicyResolver {
  async resolve(input: ExecutionProfilePolicyInput): Promise<readonly AiExecutionProfileRef[]> {
    return [readExecutionProfile(input.run, input.session)];
  }
}

class DesktopConversationAgentPromptContextContributor implements ContextContributor {
  constructor(private readonly decisions: Map<RunRecord["id"], DesktopRuntimeAgentDecision>) {}

  async contribute(input: ContextContributorInput) {
    if (isPlanConversationMode({ session: input.session, run: input.run })) {
      return {
        systemBlocks: [],
        contextBlocks: [],
      };
    }

    const decision = this.decisions.get(input.run.id);

    return {
      systemBlocks: buildAgentSystemBlocks(
        decision?.availableAgents ?? [],
        decision?.preferredAgentId,
      ),
      contextBlocks: [],
    };
  }
}

class DesktopConversationManagedTaskContextContributor implements ContextContributor {
  constructor(
    private readonly tasksQuery: Pick<DesktopTasksQueryPort, "get"> | undefined,
    private readonly checkpointStore: Pick<SqliteContextCheckpointStoreAdapter, "listBySession">,
  ) {}

  async contribute(input: ContextContributorInput) {
    if (!this.tasksQuery) {
      return {
        contextBlocks: [],
      };
    }

    const workspaceId = readWorkspaceId(input.run.metadata)
      ?? readWorkspaceId(input.session.metadata);
    const rootTaskId = readManagedRootTaskId(input.run.metadata)
      ?? readManagedRootTaskId(input.session.metadata);
    if (!workspaceId || !rootTaskId) {
      return {
        contextBlocks: [],
      };
    }

    const rootTask = await this.tasksQuery.get(workspaceId, rootTaskId);
    if (!rootTask) {
      return {
        contextBlocks: [],
      };
    }

    const checkpoints = await this.checkpointStore.listBySession(input.session.id);

    return {
      contextBlocks: [
        {
          id: `desktop-managed-task:${rootTask.taskId}`,
          kind: "task" as const,
          content: buildManagedTaskPacket(rootTask),
          priority: 96,
          metadata: {
            source: "desktop.managed-task",
            workspaceId,
            rootTaskId: rootTask.taskId,
          },
        },
        {
          id: `desktop-managed-resume:${input.session.id}:${input.run.id}`,
          kind: "task" as const,
          content: buildManagedResumePacket({
            session: input.session,
            run: input.run,
            visibleMessages: input.visibleMessages,
            checkpoints,
          }),
          priority: 95,
          metadata: {
            source: "desktop.managed-resume",
            workspaceId,
            rootTaskId: rootTask.taskId,
          },
        },
      ],
    };
  }
}

class DesktopConversationUiDesignerContextContributor implements ContextContributor {
  async contribute(input: ContextContributorInput) {
    const context = readUiDesignerContextMetadata(input.run.metadata)
      ?? readUiDesignerContextMetadata(input.session.metadata);
    if (!context || normalizeOptionalText(context.agentId) !== UI_DESIGNER_AGENT_ID) {
      return {
        contextBlocks: [],
      };
    }

    return {
      contextBlocks: [
        {
          id: `desktop-ui-designer:${input.session.id}:${input.run.id}`,
          kind: "task" as const,
          content: buildUiDesignerContextBlock(context),
          priority: 94,
          metadata: {
            source: "desktop.ui-designer",
            agentId: UI_DESIGNER_AGENT_ID,
          },
        },
      ],
    };
  }
}

class DesktopConversationRuntimeContextContributor implements ContextContributor {
  async contribute(input: ContextContributorInput) {
    const now = new Date();
    const tools = input.availableTools ?? [];
    const settings = readConversationRuntimeSettingsSnapshot({
      session: input.session,
      run: input.run,
    });
    const planState = resolvePlanState({
      session: input.session,
      run: input.run,
    });

    const environmentLines = [
      "Runtime environment:",
      `- Platform: ${process.platform}`,
      `- Date: ${now.toDateString()}`,
    ];

    const toolLines = tools.length === 0
      ? ["Tool capabilities:", "- No tools are currently available in this turn."]
      : [
          "Tool capabilities:",
          ...tools.map((tool) => {
            const description = normalizeOptionalText(tool.description) ?? "No description.";
            return `- ${tool.name}: ${description}`;
          }),
          ...(() => {
            const policyLines = buildToolUsagePolicyLines(tools);
            return policyLines.length > 0 ? ["", ...policyLines] : [];
          })(),
        ];

    return {
      systemBlocks: [
        {
          id: "desktop-runtime-environment",
          kind: "system" as const,
          content: environmentLines.join("\n"),
          priority: 99,
          metadata: {
            source: "desktop.runtime.environment",
          },
        },
        {
          id: "desktop-runtime-tools",
          kind: "system" as const,
          content: toolLines.join("\n"),
          priority: 98,
          metadata: {
            source: "desktop.runtime.tools",
            toolCount: tools.length,
          },
        },
        ...(() => {
          const continuationPolicyBlock = buildDesktopConversationContinuationPolicyBlock({
            run: input.run,
            visibleMessages: input.visibleMessages,
          });
          return continuationPolicyBlock
            ? [{
                id: "desktop-runtime-continuation-policy",
                kind: "system" as const,
                content: continuationPolicyBlock,
                priority: 97,
                metadata: {
                  source: "desktop.runtime.continuation-policy",
                  trigger: input.run.trigger.kind,
                },
              }]
            : [];
        })(),
        ...(settings.composerMode === "plan"
          ? [{
              id: "desktop-runtime-plan-mode",
              kind: "system" as const,
              content: buildPlanModeReminderBlock(planState),
              priority: 96,
              metadata: {
                source: "desktop.runtime.plan-mode",
              },
            }]
          : []),
        ...(hasConversationRuntimeSettingsSnapshot(settings)
          ? [{
              id: "desktop-runtime-settings",
              kind: "system" as const,
              content: buildConversationRuntimeSettingsLines(settings).join("\n"),
              priority: 95,
              metadata: {
                source: "desktop.runtime.settings",
              },
            }]
          : []),
      ],
      contextBlocks: planState
        ? [{
            id: `desktop-plan-artifact:${input.session.id}`,
            kind: "task" as const,
            content: buildPlanArtifactContextBlock(planState),
            priority: 94,
            metadata: {
              source: "desktop.runtime.plan-artifact",
              status: planState.status ?? "draft",
            },
          }]
        : [],
    };
  }
}

class DesktopConversationTurnPort implements AiTurnPort {
  private readonly noActivityTimeoutMs: number;
  private readonly providerTelemetryPublisher?: (
    event: DesktopAiProviderTelemetryEvent,
  ) => void | Promise<void>;

  constructor(
    private readonly aiRuntime: Pick<DesktopAiRuntimePort, "createTurnPort">,
    private readonly materializer: Pick<DesktopAiExecutionProfileMaterializerPort, "materialize">,
    private readonly materializationCache: Map<string, DesktopAiExecutionMaterialization>,
    providerTelemetryPublisher?: (
      event: DesktopAiProviderTelemetryEvent,
    ) => void | Promise<void>,
    timeoutMs?: number,
  ) {
    this.providerTelemetryPublisher = providerTelemetryPublisher;
    this.noActivityTimeoutMs = normalizeTimeoutMs(
      timeoutMs,
      DEFAULT_TURN_NO_ACTIVITY_TIMEOUT_MS,
    );
  }

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    try {
      const materialized = await this.resolveExecutionMaterialization(input.executionProfile);

      if (!materialized) {
        yield {
          type: "error",
          error: {
            code: "provider_runtime_missing",
            message: "Desktop conversation execution profile is missing channel or model selection.",
            retryable: false,
          },
        };
        return;
      }

      const effectiveExecutionProfile = mergeConversationExecutionProfile({
        requestedExecutionProfile: input.executionProfile,
        materializedExecutionProfile: materialized.executionProfile,
      });
      const requestWithEffectiveExecutionProfile: AiTurnRequest = {
        ...input,
        executionProfile: effectiveExecutionProfile,
      };

      const normalizedInput = normalizeProviderFacingTurnRequest({
        executionProfile: effectiveExecutionProfile,
        request: requestWithEffectiveExecutionProfile,
      });

      const contextBudget = buildContextBudgetSummary({
        runId: normalizedInput.trace?.runId ?? "runtime-turn",
        prompt: normalizedInput.prompt,
        modelId: normalizedInput.executionProfile.modelId ?? materialized.target.modelId,
        channelId: isRecord(normalizedInput.executionProfile.metadata)
          ? normalizeOptionalText(normalizedInput.executionProfile.metadata.channelId)
          : undefined,
        contextWindowTokens:
          readExecutionProfileNumericMetadata(normalizedInput.executionProfile, "contextWindow")
          ?? materialized.target.contextWindow,
        maxOutputTokens:
          normalizeOptionalPositiveFiniteNumber(normalizedInput.settings.maxOutputTokens)
          ?? readExecutionProfileNumericMetadata(normalizedInput.executionProfile, "maxOutputTokens")
          ?? materialized.target.maxOutputTokens,
        compressionThresholdPercent: readExecutionProfileCompressionThresholdPercent(normalizedInput.executionProfile),
      });
      const turnNoActivityTimeoutMs = resolveConversationTurnNoActivityTimeoutMs({
        baseTimeoutMs: this.noActivityTimeoutMs,
        estimatedPromptTokens: contextBudget.estimatedPromptTokens,
        agentId: resolveConversationTurnAgentId(normalizedInput.prompt),
        hasFeishuDocContext: promptContainsFeishuDocContext(normalizedInput.prompt),
      });

      if (contextBudget.shouldAutoCompress
        && !shouldSkipExecutionProfileBudgetPrecheck(normalizedInput.executionProfile)) {
        yield {
          type: "error",
          error: {
            code: "budget_exceeded",
            message: `Prompt budget reached the context compression threshold at ${contextBudget.compressionThresholdPercent ?? 100}% of the model window. Compact context before continuing.`,
            retryable: true,
            metadata: {
              estimatedPromptTokens: contextBudget.estimatedPromptTokens,
              ...(contextBudget.contextWindowTokens
                ? { contextWindowTokens: contextBudget.contextWindowTokens }
                : {}),
              ...(contextBudget.compressionThresholdTokens
                ? { compressionThresholdTokens: contextBudget.compressionThresholdTokens }
                : {}),
              ...(contextBudget.compressionThresholdPercent
                ? { compressionThresholdPercent: contextBudget.compressionThresholdPercent }
                : {}),
            },
          },
        };
        return;
      }

      const turnPort = this.aiRuntime.createTurnPort(
        materialized.runtimeSelector,
        {
          resolveServiceConfig: async (executionProfile) => {
            const base = await materialized.resolveServiceConfig(executionProfile);
            return applyConversationTimeoutToServiceConfig({
              serviceConfig: applyConversationThinkingPreferenceToServiceConfig({
                executionProfile,
                serviceConfig: base,
              }),
              timeoutMs: turnNoActivityTimeoutMs,
            });
          },
          retryPolicy: buildConversationProviderRetryPolicy(),
          telemetrySink: this.providerTelemetryPublisher,
        },
      );

      if (!turnPort) {
        yield {
          type: "error",
          error: {
            code: "provider_runtime_missing",
            message: `Desktop AI runtime is not implemented for ${materialized.target.protocolFamily ?? "unknown"}/${materialized.target.apiStyle ?? "unknown"}.`,
            retryable: false,
            metadata: {
              channelId: materialized.target.channelId,
              modelId: materialized.target.modelId,
              providerType: materialized.target.providerType,
              protocolFamily: materialized.target.protocolFamily,
              apiStyle: materialized.target.apiStyle,
            },
          },
        };
        return;
      }

      const iterator = turnPort.stream(normalizedInput)[Symbol.asyncIterator]();

      try {
        while (true) {
          const step = await raceAsyncIteratorNext(
            iterator,
            turnNoActivityTimeoutMs,
            () => ({
              code: "provider_runtime_timeout",
              message: "The reply took too long without visible progress. Please try again.",
              retryable: true,
              metadata: {
                channelId: materialized.target.channelId,
                modelId: materialized.target.modelId,
                providerType: materialized.target.providerType,
                protocolFamily: materialized.target.protocolFamily,
                apiStyle: materialized.target.apiStyle,
                timeoutMs: turnNoActivityTimeoutMs,
                technicalMessage: `Desktop AI runtime produced no activity for ${turnNoActivityTimeoutMs}ms.`,
              },
            }),
          );

          if (step.done) {
            break;
          }

          yield step.value;
        }
      } finally {
        const finalize = iterator.return?.();
        if (finalize) {
          void Promise.resolve(finalize).catch(() => undefined);
        }
      }
    } catch (error) {
      const providerError = error instanceof DesktopTurnNoActivityTimeoutError
        ? {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            ...(error.metadata ? { metadata: error.metadata } : {}),
          }
        : {
            code: "provider_runtime_error",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          };

      yield {
        type: "error",
        error: providerError,
      };
    }
  }

  private async resolveExecutionMaterialization(
    executionProfile: AiExecutionProfileRef,
  ): Promise<DesktopAiExecutionMaterialization | undefined> {
    const materializationInput = readExecutionProfileMaterializationInput(executionProfile);
    if (!materializationInput) {
      return undefined;
    }

    const materialized = await this.materializer.materialize(materializationInput);
    cacheExecutionMaterialization(this.materializationCache, materialized, executionProfile.id);
    return materialized;
  }
}

async function raceAsyncIteratorNext<TValue>(
  iterator: AsyncIterator<TValue>,
  timeoutMs: number,
  createTimeoutError: () => {
    code: string;
    message: string;
    retryable: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<IteratorResult<TValue>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<TValue>>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new DesktopTurnNoActivityTimeoutError(createTimeoutError()));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

class DesktopTurnNoActivityTimeoutError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly metadata?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    metadata?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "DesktopTurnNoActivityTimeoutError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.metadata = input.metadata;
  }
}

function normalizeDiagnosticInteractionKind(
  input: Record<string, unknown>,
): DiagnosticInteractionKind | undefined {
  if (
    input.interactionKind === "permission"
    || input.interactionKind === "question"
    || input.interactionKind === "form"
  ) {
    return input.interactionKind;
  }

  return input.requireApproval === true ? "permission" : undefined;
}

function buildDiagnosticQuestionInteractionRequest(text: string): QuestionInteractionRequest {
  return {
    kind: "question",
    title: "Answer desktop diagnostic questions",
    description: `Provide diagnostic answers before continuing with payload "${text}".`,
    items: [
      {
        id: "diagnostic_action",
        header: "Execution strategy",
        question: "How should the desktop diagnostic continue?",
        allowCustom: true,
        options: [
          { value: "continue", label: "Continue" },
          { value: "pause", label: "Pause" },
        ],
      },
      {
        id: "diagnostic_checks",
        header: "Follow-up checks",
        question: "Which follow-up checks should run after the diagnostic?",
        multiple: true,
        allowCustom: true,
        options: [
          { value: "regression", label: "Run regression" },
          { value: "logs", label: "Capture logs" },
        ],
      },
    ],
    confirmLabel: "Submit answers",
    rejectLabel: "Reject",
  };
}

function buildDiagnosticFormInteractionRequest(text: string): FormInteractionRequest {
  return {
    kind: "form",
    title: "Complete desktop diagnostic form",
    description: `Fill in the diagnostic form before continuing with payload "${text}".`,
    submitLabel: "Submit form",
    rejectLabel: "Reject",
    fields: [
      {
        key: "strategy",
        label: "Execution strategy",
        kind: "select",
        required: true,
        options: [
          { value: "tests", label: "Prioritize tests" },
          { value: "ui", label: "Prioritize UI validation" },
        ],
      },
      {
        key: "checks",
        label: "Required checks",
        kind: "multiselect",
        required: true,
        options: [
          { value: "regression", label: "Regression run" },
          { value: "task-badge", label: "Task badge sync" },
        ],
      },
      {
        key: "confirm",
        label: "Continue execution",
        kind: "boolean",
        required: true,
        trueLabel: "Continue",
        falseLabel: "Stop",
      },
      {
        key: "notes",
        label: "Notes",
        kind: "textarea",
        required: true,
        placeholder: "Add diagnostic notes",
      },
    ],
  };
}

function buildPlanExitInteractionRequest(
  planState: DesktopConversationPlanState,
): QuestionInteractionRequest {
  return {
    kind: "question",
    title: "Approve plan artifact",
    description: "Approve the current plan artifact and switch the conversation back to agent mode for the next turn.",
    items: [
      {
        id: "plan_exit_decision",
        header: "Plan approval",
        question: "Leave plan mode and continue in agent mode on the next turn?",
        allowCustom: false,
        options: [
          {
            value: "approve",
            label: "Approve and exit plan mode",
            description: "Keep the current plan artifact and switch the session back to agent mode.",
          },
          {
            value: "continue_planning",
            label: "Keep planning",
            description: "Stay in plan mode and continue refining the plan artifact.",
          },
        ],
      },
    ],
    confirmLabel: "Submit",
    rejectLabel: "Reject",
    metadata: {
      toolName: "plan_exit",
      planStatus: planState.status ?? "draft",
      ...(planState.updatedAt ? { planUpdatedAt: planState.updatedAt } : {}),
    },
  };
}

function buildPlanToolFailure(
  toolName: string,
  code: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  return {
    kind: "failed" as const,
    error: {
      code,
      message,
      retryable: false,
      metadata: {
        toolName,
        ...(metadata ?? {}),
      },
    },
  };
}

async function patchSessionMetadata(
  sessionStore: Pick<SqliteSessionStoreAdapter, "get" | "save">,
  sessionId: SessionRecord["id"],
  patch: Record<string, unknown> | undefined,
): Promise<SessionRecord> {
  const current = await sessionStore.get(sessionId);
  const nextSession: SessionRecord = {
    ...current,
    updatedAt: nowMs(),
    metadata: mergeMetadata(current.metadata, patch),
  };
  await sessionStore.save(nextSession);
  return nextSession;
}

function resolvePlanExitApproval(
  response: QuestionInteractionRequest | InteractionRecord["response"],
): boolean | undefined {
  if (!isQuestionInteractionResponse(response)) {
    return undefined;
  }

  const decision = response.answers.find((answer) => answer.questionId === "plan_exit_decision");
  if (!decision) {
    return undefined;
  }

  if (decision.values.includes("approve")) {
    return true;
  }

  if (decision.values.includes("continue_planning")) {
    return false;
  }

  return undefined;
}

type PlanArtifactSectionRule = {
  id: string;
  label: string;
  patterns: readonly RegExp[];
};

const PLAN_ARTIFACT_CORE_SECTION_RULES: readonly PlanArtifactSectionRule[] = [
  {
    id: "goals_constraints",
    label: "Goals/Constraints",
    patterns: [
      /\b(goals?|objectives?|constraints?|requirements?)\b/iu,
      /(目标|约束|要求|范围)/u,
    ],
  },
  {
    id: "implementation_steps",
    label: "Implementation Steps",
    patterns: [
      /\b(implementation steps|development steps|execution phases|phases|milestones?)\b/iu,
      /(实施步骤|开发步骤|实现步骤|执行阶段|阶段划分|里程碑)/u,
    ],
  },
  {
    id: "task_breakdown",
    label: "Task Breakdown",
    patterns: [
      /\b(task breakdown|work breakdown|task list|action items?|work items?|execution checklist|implementation checklist|deliverables?|subtasks?|todos?|next steps)\b/iu,
      /(任务拆解|任务规划|任务清单|子任务|工作拆解|工作项|行动项|执行清单|实施清单|交付项|后续步骤|待办)/u,
    ],
  },
  {
    id: "validation",
    label: "Validation",
    patterns: [
      /\b(validation|verification|test plan|testing)\b/iu,
      /(验证|验收|测试方案|测试计划|回归验证)/u,
    ],
  },
];

const PLAN_ARTIFACT_DESIGN_SECTION_RULES: readonly PlanArtifactSectionRule[] = [
  {
    id: "architecture",
    label: "Architecture",
    patterns: [
      /\b(architecture|architectural|system design)\b/iu,
      /(架构设计|系统架构|技术架构|总体设计)/u,
    ],
  },
  {
    id: "module_design",
    label: "Module Design",
    patterns: [
      /\b(module design|module breakdown|module layout|component design|service design)\b/iu,
      /(模块设计|模块拆分|模块划分|组件设计|服务设计)/u,
    ],
  },
  {
    id: "impact_scope",
    label: "Affected Surfaces / Ownership",
    patterns: [
      /\b(affected files?|affected surfaces?|touchpoints?|ownership|boundaries|state ownership|data flow|interfaces?|contracts?)\b/iu,
      /(影响文件|影响面|涉及文件|涉及模块|触点|职责边界|责任边界|状态归属|数据流|接口|契约)/u,
    ],
  },
];

function validatePlanArtifactContent(content: string) {
  const normalized = content.trim();
  const missingCoreRules = PLAN_ARTIFACT_CORE_SECTION_RULES.filter((rule) =>
    !rule.patterns.some((pattern) => pattern.test(normalized)));
  const matchedDesignRules = PLAN_ARTIFACT_DESIGN_SECTION_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized)));
  const missingRules = matchedDesignRules.length > 0
    ? missingCoreRules
    : [...missingCoreRules, ...PLAN_ARTIFACT_DESIGN_SECTION_RULES];

  return {
    isComplete: missingRules.length === 0,
    missingSections: missingRules.map((rule) => rule.id),
    missingSectionLabels: missingRules.map((rule) => rule.label),
    matchedDesignSections: matchedDesignRules.map((rule) => rule.id),
  };
}

function readInteractionToolName(interaction: InteractionRecord): string | undefined {
  if (isRecord(interaction.metadata)) {
    const metadataToolName = normalizeOptionalText(interaction.metadata.toolName);
    if (metadataToolName) {
      return metadataToolName;
    }
  }

  if (isRecord(interaction.request) && isRecord(interaction.request.metadata)) {
    return normalizeOptionalText(interaction.request.metadata.toolName);
  }

  return undefined;
}

async function tryGetStoredInteraction(
  interactionStore: Pick<SqliteInteractionStoreAdapter, "get" | "listByRun">,
  input: {
    interactionId: ToolCallRecord["interactionId"];
    runId: ToolCallRecord["runId"];
    toolName: string;
    interactionKind: DiagnosticInteractionKind;
  },
) {
  if (input.interactionId) {
    try {
      return await interactionStore.get(input.interactionId);
    } catch {
      return null;
    }
  }

  try {
    const interactions = await interactionStore.listByRun(input.runId);
    return [...interactions].reverse().find((interaction) =>
      interaction.kind === input.interactionKind
      && normalizeOptionalText(interaction.metadata?.toolName) === input.toolName,
    ) ?? null;
  } catch {
    return null;
  }
}

function buildRejectedDiagnosticResult(
  toolName: string,
  interactionKind: DiagnosticInteractionKind,
) {
  return {
    kind: "failed" as const,
    error: {
      code: "tool_execution_rejected",
      message: `Desktop diagnostic ${interactionKind} interaction was rejected: ${toolName}`,
      retryable: false,
      metadata: {
        toolName,
        interactionKind,
      },
    },
  };
}

function buildInvalidDiagnosticResponseResult(
  toolName: string,
  interactionKind: DiagnosticInteractionKind,
) {
  return {
    kind: "failed" as const,
    error: {
      code: "tool_execution_invalid_interaction_response",
      message: `Desktop diagnostic ${interactionKind} interaction returned an invalid response: ${toolName}`,
      retryable: false,
      metadata: {
        toolName,
        interactionKind,
      },
    },
  };
}

function buildBlockedDiagnosticInteraction(input: {
  call: Pick<ToolCallRecord, "id" | "toolName">;
  context: {
    session: Pick<SessionRecord, "id">;
    run: Pick<RunRecord, "id">;
  };
  request: PermissionInteractionRequest | QuestionInteractionRequest | FormInteractionRequest;
}) {
  return {
    kind: "blocked" as const,
    interaction: {
      id: asInteractionId(`interaction-${randomUUID().replaceAll("-", "")}`),
      sessionId: input.context.session.id,
      runId: input.context.run.id,
      toolCallId: input.call.id,
      kind: input.request.kind,
      status: "pending" as const,
      request: input.request,
      createdAt: nowMs(),
      updatedAt: nowMs(),
      metadata: {
        toolName: input.call.toolName,
      },
    },
  };
}

function createDiagnosticToolHandler(
  descriptor: ToolDescriptor,
  interactionStore: Pick<SqliteInteractionStoreAdapter, "get" | "listByRun">,
  sessionStore: Pick<SqliteSessionStoreAdapter, "save">,
): RegisteredToolHandler {
  return {
    descriptor,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const text = normalizeOptionalText(input.text) ?? "diagnostic";
      const interactionKind = normalizeDiagnosticInteractionKind(input);
      const storedInteraction = interactionKind
        ? await tryGetStoredInteraction(interactionStore, {
            interactionId: call.interactionId,
            runId: call.runId,
            toolName: call.toolName,
            interactionKind,
          })
        : null;

      if (!interactionKind) {
        return {
          kind: "completed",
          output: {
            ok: true,
            text,
            approved: false,
          },
        };
      }

      if (interactionKind === "permission") {
        const interactionRequest: PermissionInteractionRequest = {
          kind: "permission",
          permission: "desktop.diagnostic.run",
          title: "Run desktop diagnostic tool",
          description: `Allow desktop diagnostic tool to run with payload "${text}"?`,
          operation: {
            kind: "tool_execution",
            label: "Desktop diagnostic",
          },
          resources: [{
            kind: "tool",
            label: "desktop_diagnostic",
            toolName: call.toolName,
          }],
          allowAlways: true,
          defaultDecision: "approve_once",
          confirmLabel: "Approve",
          rejectLabel: "Reject",
        };
        const decision = await resolvePermissionDecision({
          interactionStore,
          sessionStore,
          call,
          session: context.session,
          request: interactionRequest,
        });

        if (decision === "approve_always" || decision === "approve_once") {
          return {
            kind: "completed",
            output: {
              ok: true,
              text,
              approved: true,
            },
          };
        }

        if (decision === "reject") {
          return buildRejectedDiagnosticResult(call.toolName, interactionKind);
        }

        if (storedInteraction?.status === "pending") {
          return {
            kind: "blocked",
            interaction: storedInteraction,
          };
        }

        return buildBlockedDiagnosticInteraction({
          call,
          context,
          request: interactionRequest,
        });
      }

      if (storedInteraction?.status === "rejected" || isRejectedInteractionResponse(storedInteraction?.response)) {
        return buildRejectedDiagnosticResult(call.toolName, interactionKind);
      }

      if (interactionKind === "question") {
        if (storedInteraction?.status === "answered") {
          if (!isQuestionInteractionResponse(storedInteraction.response)) {
            return buildInvalidDiagnosticResponseResult(call.toolName, interactionKind);
          }

          return {
            kind: "completed",
            output: {
              ok: true,
              text,
              interactionKind,
              answers: storedInteraction.response.answers,
            },
          };
        }

        if (storedInteraction?.status === "pending") {
          return {
            kind: "blocked",
            interaction: storedInteraction,
          };
        }

        return buildBlockedDiagnosticInteraction({
          call,
          context,
          request: buildDiagnosticQuestionInteractionRequest(text),
        });
      }

      if (storedInteraction?.status === "answered") {
        if (!isFormInteractionResponse(storedInteraction.response)) {
          return buildInvalidDiagnosticResponseResult(call.toolName, interactionKind);
        }

        return {
          kind: "completed",
          output: {
            ok: true,
            text,
            interactionKind,
            values: storedInteraction.response.values,
            ...(storedInteraction.response.actionId ? { actionId: storedInteraction.response.actionId } : {}),
          },
        };
      }

      if (storedInteraction?.status === "pending") {
        return {
          kind: "blocked",
          interaction: storedInteraction,
        };
      }

      return buildBlockedDiagnosticInteraction({
        call,
        context,
        request: buildDiagnosticFormInteractionRequest(text),
      });
    },
  };
}

function createPlanWriteToolHandler(
  descriptor: ToolDescriptor,
  sessionStore: Pick<SqliteSessionStoreAdapter, "get" | "save">,
): RegisteredToolHandler {
  return {
    descriptor,
    async execute({ call, context }) {
      if (!isPlanConversationMode({ session: context.session, run: context.run })) {
        return buildPlanToolFailure(
          call.toolName,
          "plan_mode_required",
          "plan_write is only available while plan mode is active.",
        );
      }

      const input = isRecord(call.input) ? call.input : {};
      const content = typeof input.content === "string" ? input.content.trim() : "";
      if (!content) {
        return buildPlanToolFailure(
          call.toolName,
          "plan_content_required",
          "content is required for plan_write.",
        );
      }

      const updatedAt = new Date().toISOString();
      const nextSession = await patchSessionMetadata(sessionStore, context.session.id, buildPlanStatePatch({
        content,
        status: "draft",
        updatedAt,
      }));
      context.session.metadata = nextSession.metadata;
      context.session.updatedAt = nextSession.updatedAt;
      const planState = readPlanStateMetadata(nextSession.metadata);
      const truncatedContent = truncateText(content, 4_000);

      return {
        kind: "completed",
        output: {
          ok: true,
          status: planState?.status ?? "draft",
          updatedAt: planState?.updatedAt ?? updatedAt,
          content: truncatedContent,
          truncated: truncatedContent !== content,
        },
      };
    },
  };
}

function createPlanExitToolHandler(
  descriptor: ToolDescriptor,
  interactionStore: Pick<SqliteInteractionStoreAdapter, "get" | "listByRun">,
  sessionStore: Pick<SqliteSessionStoreAdapter, "get" | "save">,
): RegisteredToolHandler {
  return {
    descriptor,
    async execute({ call, context }) {
      if (!isPlanConversationMode({ session: context.session, run: context.run })) {
        return buildPlanToolFailure(
          call.toolName,
          "plan_mode_required",
          "plan_exit is only available while plan mode is active.",
        );
      }

      const currentSession = await sessionStore.get(context.session.id);
      const planState = readPlanStateMetadata(currentSession.metadata);
      if (!planState) {
        return buildPlanToolFailure(
          call.toolName,
          "plan_artifact_missing",
          "No plan artifact exists yet. Use plan_write before calling plan_exit.",
        );
      }

      const completeness = validatePlanArtifactContent(planState.content);
      if (!completeness.isComplete) {
        return buildPlanToolFailure(
          call.toolName,
          "plan_artifact_incomplete",
          `Plan artifact is incomplete. Add sections for ${completeness.missingSectionLabels.join(", ")} before calling plan_exit.`,
          {
            missingSections: completeness.missingSections,
            missingSectionLabels: completeness.missingSectionLabels,
            planStatus: planState.status ?? "draft",
          },
        );
      }

      const storedInteraction = await tryGetStoredInteraction(interactionStore, {
        interactionId: call.interactionId,
        runId: call.runId,
        toolName: call.toolName,
        interactionKind: "question",
      });

      if (storedInteraction?.status === "rejected" || isRejectedInteractionResponse(storedInteraction?.response)) {
        return buildPlanToolFailure(
          call.toolName,
          "plan_exit_rejected",
          "The user rejected leaving plan mode.",
        );
      }

      if (storedInteraction?.status === "answered") {
        const approved = resolvePlanExitApproval(storedInteraction.response);
        if (approved === undefined) {
          return buildPlanToolFailure(
            call.toolName,
            "plan_exit_invalid_response",
            "plan_exit received an invalid question response.",
          );
        }

        if (!approved) {
          return buildPlanToolFailure(
            call.toolName,
            "plan_exit_rejected",
            "The user chose to keep refining the plan.",
          );
        }

        const approvedAt = new Date().toISOString();
        const nextSession = await patchSessionMetadata(sessionStore, context.session.id, mergeMetadata(
          buildPlanStatePatch({
            content: planState.content,
            status: "approved",
            updatedAt: planState.updatedAt,
            approvedAt,
          }),
          {
            composerMode: "agent",
          },
        ));
        context.session.metadata = nextSession.metadata;
        context.session.updatedAt = nextSession.updatedAt;
        const nextPlanState = readPlanStateMetadata(nextSession.metadata);

        return {
          kind: "completed",
          output: {
            ok: true,
            composerMode: "agent",
            exitedPlanMode: true,
            approvedAt,
            status: nextPlanState?.status ?? "approved",
          },
        };
      }

      if (storedInteraction?.status === "pending") {
        return {
          kind: "blocked",
          interaction: storedInteraction,
        };
      }

      return buildBlockedDiagnosticInteraction({
        call,
        context,
        request: buildPlanExitInteractionRequest(planState),
      });
    },
  };
}

export class DesktopAiConversationRuntime {
  private readonly db: Database;
  private readonly sessionStore: SqliteSessionStoreAdapter;
  private readonly runStore: SqliteRunStoreAdapter;
  private readonly turnStore: SqliteTurnStoreAdapter;
  private readonly messageStore: SqliteMessageStoreAdapter;
  private readonly toolCallStore: SqliteToolCallStoreAdapter;
  private readonly interactionStore: SqliteInteractionStoreAdapter;
  private readonly checkpointStore: SqliteContextCheckpointStoreAdapter;
  private readonly outputLoader: ConversationTurnOutputLoader;
  private readonly pendingInteractionHost = new PendingInteractionHost();
  private readonly interactionBridge: InteractionBridge;
  private readonly runLifecycleService: RunLifecycleService;
  private readonly runResumeService: RunResumeService;
  private readonly turnInputAssembler: RuntimeTurnInputAssembler;
  private readonly turnPlanner: TextTurnPlanner;
  private readonly clock = new SystemClockAdapter();
  private readonly idGenerator = new RandomIdGeneratorAdapter();
  private readonly executionMaterializations = new Map<string, DesktopAiExecutionMaterialization>();
  private readonly activeTurns = new Map<SessionRecord["id"], ActiveConversationTurn>();

  constructor(private readonly options: DesktopAiConversationRuntimeOptions) {
    ensureDesktopConversationAssetServer(resolveConversationAssetRoot(options.conversationDbPath));
    this.db = new Database(options.conversationDbPath);

    this.sessionStore = new SqliteSessionStoreAdapter(this.db);
    this.runStore = new SqliteRunStoreAdapter(this.db);
    this.turnStore = new SqliteTurnStoreAdapter(this.db);
    this.messageStore = new SqliteMessageStoreAdapter(this.db);
    this.toolCallStore = new SqliteToolCallStoreAdapter(this.db);
    this.interactionStore = new SqliteInteractionStoreAdapter(this.db);
    this.checkpointStore = new SqliteContextCheckpointStoreAdapter(this.db);

    const runtimeEventSink = options.runtimeEventsPublisher
      ? new ConversationRuntimeEventProjector({
          delivery: {
            publish: async (events) => {
              await this.publishRuntimeEventsBatch(events);
            },
          },
        })
      : undefined;

    const unitOfWork = new SqliteUnitOfWorkAdapter(this.db);
    const interactionCoordinator = new InteractionCoordinator({
      interactionStore: this.interactionStore,
      runStore: this.runStore,
      sessionStore: this.sessionStore,
      unitOfWork,
      clock: this.clock,
      idGenerator: this.idGenerator,
      eventSink: runtimeEventSink,
    });
    const interactionReplyService = new InteractionReplyService({
      interactionStore: this.interactionStore,
      sessionStore: this.sessionStore,
      interactionCoordinator,
      pendingInteractionHost: this.pendingInteractionHost,
    });
    this.interactionBridge = new InteractionBridge({
      interactionStore: this.interactionStore,
      replyService: interactionReplyService,
      pendingInteractionHost: this.pendingInteractionHost,
    });

    const diagnosticDescriptor = buildDiagnosticToolDescriptor();
    const planWriteDescriptor = buildPlanWriteToolDescriptor();
    const planExitDescriptor = buildPlanExitToolDescriptor();
    const internalDescriptors = [diagnosticDescriptor, planWriteDescriptor, planExitDescriptor];
    const internalHandlers = [
      createDiagnosticToolHandler(
        diagnosticDescriptor,
        this.interactionStore,
        this.sessionStore,
      ),
      createPlanWriteToolHandler(
        planWriteDescriptor,
        this.sessionStore,
      ),
      createPlanExitToolHandler(
        planExitDescriptor,
        this.interactionStore,
        this.sessionStore,
      ),
    ];
    const handlers = [
      ...(options.toolHandlers ?? []),
      ...internalHandlers,
    ];
    const toolSources = [
      ...(options.toolSources ?? []),
      new DesktopConversationToolSource(internalDescriptors),
    ];
    const dynamicToolRuntime = new DesktopConversationCapabilityToolRuntime(
      toolSources,
      options.toolContributionResolver,
    );
    const agentPolicyDecisions = new Map<RunRecord["id"], DesktopRuntimeAgentDecision>();
    this.turnInputAssembler = new RuntimeTurnInputAssembler({
      agentRegistry: new AgentRegistry(),
      agentPolicyResolver: new DesktopConversationAgentPolicyResolver(
        options.agents,
        agentPolicyDecisions,
      ),
      executionProfilePolicyResolver: new DesktopConversationExecutionProfilePolicyResolver(),
      dynamicToolRuntime,
      contextContributorRegistry: new ContextContributorRegistry([
        new DesktopConversationRuntimeContextContributor(),
        new DesktopConversationAgentPromptContextContributor(agentPolicyDecisions),
        new DesktopConversationUiDesignerContextContributor(),
        new DesktopConversationManagedTaskContextContributor(
          options.tasksQuery,
          this.checkpointStore,
        ),
      ]),
    });
    const turnPort = new DesktopConversationTurnPort(
      options.aiRuntime,
      options.materializer,
      this.executionMaterializations,
      options.providerTelemetryPublisher,
      options.turnNoActivityTimeoutMs,
    );
    const contextViewBuilder = new DefaultContextViewBuilder();
    this.turnPlanner = new TextTurnPlanner({
      clock: this.clock,
      idGenerator: this.idGenerator,
      contextViewBuilder,
    });
    const kernelRunEngine = new KernelRunEngine({
      sessionStore: this.sessionStore,
      runStore: this.runStore,
      turnStore: this.turnStore,
      messageStore: this.messageStore,
      toolCallStore: this.toolCallStore,
      contextCheckpointStore: this.checkpointStore,
      turnInputAssembler: this.turnInputAssembler,
      turnPlanner: this.turnPlanner,
      turnPort,
      streamProcessor: new TextStreamProcessor({
        messageStore: this.messageStore,
        toolCallStore: this.toolCallStore,
        clock: this.clock,
        idGenerator: this.idGenerator,
        eventSink: runtimeEventSink,
      }),
      toolExecutor: new DesktopConversationCapabilityToolExecutor(
        handlers,
        options.toolContributionResolver,
        30_000,
      ),
      interactionCoordinator,
      unitOfWork,
      clock: this.clock,
      idGenerator: this.idGenerator,
      eventSink: runtimeEventSink,
    });
    const sessionHost = new SessionHost({
      kernelRunEngine,
      sessionStore: this.sessionStore,
      runStore: this.runStore,
      messageStore: this.messageStore,
      contextCheckpointStore: this.checkpointStore,
      turnInputAssembler: this.turnInputAssembler,
      contextViewBuilder,
      compactionCoordinator: new CompactionCoordinator({
        compactionEngine: new CompactionEngine({
          clock: this.clock,
          idGenerator: this.idGenerator,
          summaryGenerator: {
            async generate() {
              return "Desktop conversation compaction summary placeholder.";
            },
          },
        }),
        messageStore: this.messageStore,
        contextCheckpointStore: this.checkpointStore,
        unitOfWork,
      }),
      unitOfWork,
      clock: this.clock,
      idGenerator: this.idGenerator,
      eventSink: runtimeEventSink,
    });

    this.runLifecycleService = new RunLifecycleService({
      sessionStore: this.sessionStore,
      runStore: this.runStore,
      sessionHost,
      unitOfWork,
      clock: this.clock,
      idGenerator: this.idGenerator,
    });
    this.runResumeService = new RunResumeService({
      sessionStore: this.sessionStore,
      runStore: this.runStore,
      sessionHost,
      unitOfWork,
      clock: this.clock,
    });
    this.outputLoader = new ConversationTurnOutputLoader({
      sessionStore: this.sessionStore,
      runStore: this.runStore,
      turnStore: this.turnStore,
      messageStore: this.messageStore,
      toolCallStore: this.toolCallStore,
      interactionStore: this.interactionStore,
      contextCheckpointStore: this.checkpointStore,
    });
  }

  async ensureSession(input: {
    item: DesktopConversationSessionItem;
    selectedChannelId?: string;
    selectedModelId?: string;
    selectedAgentId?: string;
  }): Promise<SessionRecord> {
    const sessionId = asSessionId(input.item.sessionId);
    const current = await this.tryGetSession(sessionId);
    const nextSession: SessionRecord = {
      id: sessionId,
      title: input.item.title,
      status: input.item.status,
      parentSessionId: input.item.parentSessionId ? asSessionId(input.item.parentSessionId) : undefined,
      createdAt: parseIsoTimestamp(input.item.createdAt),
      updatedAt: parseIsoTimestamp(input.item.updatedAt),
      archivedAt: parseOptionalIsoTimestamp(input.item.archivedAt),
      metadata: buildSessionMetadata({
        item: input.item,
        selectedChannelId: input.selectedChannelId,
        selectedModelId: input.selectedModelId,
        selectedAgentId: input.selectedAgentId,
      }),
    };

    if (current) {
      await this.sessionStore.save({
        ...current,
        ...nextSession,
      });
      return this.sessionStore.get(sessionId);
    }

    await this.sessionStore.save(nextSession);
    return nextSession;
  }

  async abortActiveTurn(sessionId: string): Promise<boolean> {
    const activeTurn = this.activeTurns.get(asSessionId(sessionId));
    if (!activeTurn) {
      return false;
    }

    activeTurn.controller.abort();
    await activeTurn.completion.catch(() => undefined);
    return true;
  }

  async archiveSession(item: DesktopConversationSessionItem): Promise<void> {
    const session = await this.tryGetSession(asSessionId(item.sessionId));
    if (!session) {
      return;
    }

    await this.sessionStore.save({
      ...session,
      status: "archived",
      archivedAt: parseOptionalIsoTimestamp(item.archivedAt),
      updatedAt: parseIsoTimestamp(item.updatedAt),
      metadata: buildSessionMetadata({
        item,
      }),
    });
  }

  async startUserTurn(input: DesktopAiConversationStartUserTurnInput) {
    const materialization = await this.options.materializer.materialize({
      ...(input.scope ? { scope: input.scope } : {}),
      workspaceId: normalizeOptionalText(input.workspaceId) ?? input.item.workspaceId,
      ...(input.selectedChannelId ? { selectedChannelId: input.selectedChannelId } : {}),
      ...(input.selectedModelId ? { selectedModelId: input.selectedModelId } : {}),
    });
    const session = await this.ensureSession({
      item: input.item,
      selectedChannelId: materialization.target.channelId,
      selectedModelId: materialization.target.modelId,
      selectedAgentId: input.selectedAgentId,
    });
    const userMessageId = asMessageId(this.idGenerator.next("message"));
    this.rememberExecutionMaterialization(materialization);

    const messageParts: MessagePart[] = [];
    const text = normalizeOptionalText(input.text);
    if (text) {
      messageParts.push({
        id: asMessagePartId(this.idGenerator.next("part")),
        type: "text",
        text,
      });
    }

    if (input.attachments && input.attachments.length > 0) {
      const storedAttachments = await this.storeConversationAttachments({
        workspaceId: input.item.workspaceId,
        sessionId: session.id,
        attachments: input.attachments,
      });
      messageParts.push(...storedAttachments);
    }

    if (messageParts.length === 0) {
      throw new Error("Desktop conversation message must include text or attachments.");
    }

    await this.messageStore.append({
      id: userMessageId,
      sessionId: session.id,
      role: "user",
      createdAt: this.clock.now(),
      metadata: {
        workspaceId: input.item.workspaceId,
      },
    }, messageParts);

    return this.executeForegroundTurn(session.id, async (signal) => {
      const result = await this.runLifecycleService.start({
        sessionId: session.id,
        trigger: {
          kind: "user_message",
          refId: userMessageId,
        },
        metadata: {
          ...(input.metadata ? { ...input.metadata } : {}),
          ...(input.selectedAgentId
            ? {
                selectedAgentId: input.selectedAgentId,
                preferredAgentId: input.selectedAgentId,
              }
            : {}),
          preferredExecutionProfile: materialization.executionProfile,
          channelSelection: {
            channelId: materialization.target.channelId,
            modelId: materialization.target.modelId,
          },
        },
        signal,
      });

      return {
        runId: result.run.id,
        boundary: result.boundary,
      };
    });
  }

  async continueSystemTurn(input: DesktopAiConversationContinueTurnInput) {
    const materialization = await this.options.materializer.materialize({
      ...(input.scope ? { scope: input.scope } : {}),
      workspaceId: normalizeOptionalText(input.workspaceId) ?? input.item.workspaceId,
      ...(input.selectedChannelId ? { selectedChannelId: input.selectedChannelId } : {}),
      ...(input.selectedModelId ? { selectedModelId: input.selectedModelId } : {}),
    });
    const session = await this.ensureSession({
      item: input.item,
      selectedChannelId: materialization.target.channelId,
      selectedModelId: materialization.target.modelId,
      selectedAgentId: input.selectedAgentId,
    });
    this.rememberExecutionMaterialization(materialization);

    return this.executeForegroundTurn(session.id, async (signal) => {
      const result = await this.runLifecycleService.start({
        sessionId: session.id,
        trigger: {
          kind: "system_continue",
        },
        metadata: {
          ...(input.metadata ? { ...input.metadata } : {}),
          ...(input.selectedAgentId
            ? {
                selectedAgentId: input.selectedAgentId,
                preferredAgentId: input.selectedAgentId,
              }
            : {}),
          preferredExecutionProfile: materialization.executionProfile,
          channelSelection: {
            channelId: materialization.target.channelId,
            modelId: materialization.target.modelId,
          },
        },
        signal,
      });

      return {
        runId: result.run.id,
        boundary: result.boundary,
      };
    });
  }

  private async storeConversationAttachments(input: {
    workspaceId: string;
    sessionId: SessionRecord["id"];
    attachments: readonly DesktopConversationAttachmentInput[];
  }): Promise<Array<Extract<MessageRecordWithParts["parts"][number], { type: "attachment" }>>> {
    const assetMonth = new Date().toISOString().slice(0, 7);
    const assetRoot = resolveConversationAssetRoot(this.options.conversationDbPath);
    const workspaceSegment = sanitizePathSegment(input.workspaceId, "workspace");
    const stored: Array<Extract<MessageRecordWithParts["parts"][number], { type: "attachment" }>> = [];

    for (const attachment of input.attachments) {
      const assetId = randomUUID().replaceAll("-", "");
      const fileName = sanitizePathSegment(attachment.fileName, "attachment");
      const assetDirectory = path.join(assetRoot, workspaceSegment, assetMonth, assetId);
      const assetFilePath = path.join(assetDirectory, fileName);
      const binary = Buffer.from(attachment.dataBase64, "base64");
      const bytes = Uint8Array.from(binary);
      await mkdir(assetDirectory, { recursive: true });
      await writeFile(assetFilePath, bytes);

      stored.push({
        id: asMessagePartId(this.idGenerator.next("part")),
        type: "attachment",
        attachmentId: assetId,
        mimeType: normalizeAttachmentMimeType({
          mimeType: attachment.mimeType,
          kind: attachment.kind,
        }),
        name: fileName,
        kind: attachment.kind,
        path: assetFilePath,
        assetId,
        assetMonth,
        fileName,
        sizeBytes: normalizeAttachmentSize(attachment.sizeBytes) ?? bytes.byteLength,
      });
    }

    return stored;
  }

  async answerInteraction(input: {
    interactionId: string;
    response: unknown;
  }) {
    const result = await this.interactionBridge.answer({
      interactionId: asInteractionId(input.interactionId),
      response: input.response,
    });

    const resolvedPlanExit = await this.tryResolvePlanExitInteraction(result.interaction);
    if (resolvedPlanExit) {
      return resolvedPlanExit;
    }

    const resumed = await this.runResumeService.resume(result.resume);

    return this.loadRunOutput({
      sessionId: resumed.run.sessionId,
      runId: resumed.run.id,
      boundary: resumed.boundary,
    });
  }

  async rejectInteraction(input: {
    interactionId: string;
    reason?: string;
  }) {
    const result = await this.interactionBridge.reject({
      interactionId: asInteractionId(input.interactionId),
      reason: input.reason,
    });
    const resumed = await this.runResumeService.resume(result.resume);

    return this.loadRunOutput({
      sessionId: resumed.run.sessionId,
      runId: resumed.run.id,
      boundary: resumed.boundary,
    });
  }

  async loadSessionDetail(item: DesktopConversationSessionItem): Promise<DesktopConversationSessionDetail> {
    const session = await this.tryGetSession(asSessionId(item.sessionId));
    if (!session) {
      return {
        ...item,
        runs: [],
        messages: [],
        toolCalls: [],
        interactions: [],
        pendingInteractions: [],
        checkpoints: [],
        timeline: [],
      };
    }

    const runs = sortRuns(await this.runStore.listBySession(session.id));
    const messages = await this.messageStore.listBySession(session.id);
    const checkpoints = await this.checkpointStore.listBySession(session.id);
    const toolCallsRaw = (await Promise.all(runs.map((run) => this.toolCallStore.listByRun(run.id)))).flat();
    const interactionsRaw = (await Promise.all(runs.map((run) => this.interactionStore.listByRun(run.id)))).flat();
    const toolCalls = sortToolCalls(toolCallsRaw.map((call) => projectConversationToolCall(call)));
    const toolCallsById = new Map<ToolCallRecord["id"], ConversationToolCallEntry>(
      toolCalls.map((call) => [call.callId as ToolCallRecord["id"], call]),
    );
    const projectedMessages = sortMessages(messages.map((message) => projectConversationMessage({
      message,
      toolCallsById,
    })));
    const projectedInteractions = sortInteractions(interactionsRaw.map((interaction) => projectConversationInteraction(interaction)));
    const projectedCheckpoints = sortCheckpoints(checkpoints.map((checkpoint) => projectConversationCheckpoint(checkpoint)));
    const activeCheckpoint = resolveActiveConversationCheckpoint({
      messages: projectedMessages,
      checkpoints: projectedCheckpoints,
    });
    const visibleMessages = filterConversationMessagesForCheckpoint({
      messages: projectedMessages,
      checkpoint: activeCheckpoint,
    });
    const visibleMessageIds = new Set(visibleMessages.map((message) => message.messageId));
    const detailToolCalls = activeCheckpoint
      ? toolCalls.filter((toolCall) => visibleMessageIds.has(toolCall.messageId))
      : toolCalls;
    const detailCheckpoints = activeCheckpoint ? [activeCheckpoint] : projectedCheckpoints;
    const detailMessages = visibleMessages.map((message) => truncateConversationDetailMessage(message));
    const detailToolCallsProjected = detailToolCalls.map((toolCall) => truncateConversationDetailToolCall(toolCall));
    const detailInteractions = projectedInteractions.map((interaction) => truncateConversationDetailInteraction(interaction));
    const detailCheckpointsProjected = detailCheckpoints.map((checkpoint) => truncateConversationDetailCheckpoint(checkpoint));
    const pendingInteractions = detailInteractions.filter((interaction) => interaction.status === "pending");
    const workspaceId = normalizeOptionalText(session.metadata?.workspaceId) ?? item.workspaceId;
    let latestTokenUsage: DesktopConversationTokenUsageSummary | undefined;
    const managedExecution = session.metadata?.managedExecution === true;
    const latestRun = runs.at(-1);
    const currentContextBudget = latestRun && !managedExecution
      ? await this.tryBuildCurrentContextBudget({
          session,
          run: latestRun,
          messages,
          checkpoints,
        })
      : undefined;

    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const run = runs[index];
      const summary = summarizeRunTokenUsage({
        runId: run.id,
        turns: await this.turnStore.listByRun(run.id),
      });
      if (summary) {
        latestTokenUsage = {
          ...summary,
          modelId: summary.modelId ?? normalizeOptionalText(session.metadata?.selectedModelId),
          channelId: summary.channelId ?? normalizeOptionalText(session.metadata?.selectedChannelId),
        };
        break;
      }
    }

    return {
      ...item,
      workspaceId,
      title: session.title,
      status: session.status,
      createdAt: toIsoTimestamp(session.createdAt) ?? item.createdAt,
      updatedAt: toIsoTimestamp(session.updatedAt) ?? item.updatedAt,
      archivedAt: toIsoTimestamp(session.archivedAt),
      metadata: session.metadata ? { ...session.metadata } : undefined,
      runs: runs.map((run) => cloneRunItem(run, inferRunBoundary({
        run,
        interactions: interactionsRaw,
      }))),
      messages: detailMessages,
      toolCalls: detailToolCallsProjected,
      interactions: detailInteractions,
      pendingInteractions,
      checkpoints: detailCheckpointsProjected,
      timeline: buildTimeline({
        messages: detailMessages,
        toolCalls: detailToolCallsProjected,
        interactions: detailInteractions,
        checkpoints: detailCheckpointsProjected,
      }),
      latestTokenUsage,
      ...(currentContextBudget ? { currentContextBudget } : {}),
    };
  }

  private async tryBuildCurrentContextBudget(input: {
    session: SessionRecord;
    run: RunRecord;
    messages: Awaited<ReturnType<SqliteMessageStoreAdapter["listBySession"]>>;
    checkpoints: Awaited<ReturnType<SqliteContextCheckpointStoreAdapter["listBySession"]>>;
  }): Promise<DesktopConversationContextBudgetSummary | undefined> {
    try {
      const turnInput = await this.turnInputAssembler.load({
        session: input.session,
        run: input.run,
        visibleMessages: input.messages,
      });
      const nextSequence = (await this.turnStore.listByRun(input.run.id)).length + 1;
      const plan = await this.turnPlanner.plan({
        session: input.session,
        run: input.run,
        visibleMessages: input.messages,
        checkpoints: input.checkpoints,
        turnInput,
        nextSequence,
      });
      const materialized = await this.resolveExecutionMaterialization(plan.executionProfile);

      return buildContextBudgetSummary({
        runId: input.run.id,
        prompt: plan.envelope,
        modelId: plan.executionProfile.modelId ?? materialized?.target.modelId,
        channelId: isRecord(plan.executionProfile.metadata)
          ? normalizeOptionalText(plan.executionProfile.metadata.channelId)
          : undefined,
        contextWindowTokens:
          readExecutionProfileNumericMetadata(plan.executionProfile, "contextWindow")
          ?? materialized?.target.contextWindow,
        maxOutputTokens:
          readExecutionProfileNumericMetadata(plan.executionProfile, "maxOutputTokens")
          ?? materialized?.target.maxOutputTokens,
        compressionThresholdPercent: readExecutionProfileCompressionThresholdPercent(plan.executionProfile),
        compaction: readRunCompactionSummary(input.run),
      });
    } catch {
      return undefined;
    }
  }

  private async resolveExecutionMaterialization(
    executionProfile: AiExecutionProfileRef,
  ): Promise<DesktopAiExecutionMaterialization | undefined> {
    const materializationInput = readExecutionProfileMaterializationInput(executionProfile);
    if (!materializationInput) {
      return undefined;
    }

    const materialized = await this.options.materializer.materialize(materializationInput);
    cacheExecutionMaterialization(this.executionMaterializations, materialized, executionProfile.id);
    return materialized;
  }

  dispose() {
    this.db.close();
  }

  private async loadRunOutput(input: {
    sessionId: SessionRecord["id"];
    runId: RunRecord["id"];
    boundary: RunBoundary;
  }) {
    const output = await this.outputLoader.load(input);
    this.pendingInteractionHost.syncRun({
      session: output.session,
      run: output.run,
      interactions: output.interactions,
    });

    return output;
  }

  private async tryGetSession(sessionId: SessionRecord["id"]): Promise<SessionRecord | null> {
    try {
      return await this.sessionStore.get(sessionId);
    } catch {
      return null;
    }
  }

  private async tryResolvePlanExitInteraction(interaction: InteractionRecord) {
    if (interaction.kind !== "question" || readInteractionToolName(interaction) !== "plan_exit") {
      return undefined;
    }

    const approved = resolvePlanExitApproval(interaction.response);
    if (approved !== true) {
      return undefined;
    }

    const session = await this.sessionStore.get(interaction.sessionId);
    const run = await this.runStore.get(interaction.runId);
    const blockedCall = (await this.toolCallStore.listByRun(interaction.runId)).find((call) =>
      call.interactionId === interaction.id && call.toolName === "plan_exit",
    );
    if (!blockedCall) {
      return undefined;
    }

    const turn = await this.turnStore.getLastByRun(interaction.runId);
    const currentPlanState = readPlanStateMetadata(session.metadata);
    const now = nowMs();
    let nextSession = session;
    let output: Record<string, unknown>;

    const approvedAt = new Date().toISOString();
    nextSession = await patchSessionMetadata(this.sessionStore, session.id, mergeMetadata(
      buildPlanStatePatch({
        content: currentPlanState?.content ?? "",
        status: "approved",
        updatedAt: currentPlanState?.updatedAt,
        approvedAt,
      }),
      {
        composerMode: "agent",
      },
    ));
    output = {
      ok: true,
      composerMode: "agent",
      exitedPlanMode: true,
      approvedAt,
      status: "approved",
    };

    await this.toolCallStore.patch({
      ...blockedCall,
      status: "completed",
      output,
      updatedAt: now,
      completedAt: now,
    });

    if (turn && turn.id === blockedCall.turnId) {
      await this.turnStore.save({
        ...turn,
        status: "finished",
        finishedAt: turn.finishedAt ?? now,
        finishReason: turn.finishReason ?? "tool_calls",
      });
    }

    await this.runStore.save({
      ...run,
      status: "completed",
      updatedAt: now,
      completedAt: now,
      currentTurnId: blockedCall.turnId,
    });

    await this.sessionStore.save({
      ...nextSession,
      status: "idle",
      updatedAt: now,
    });

    return this.loadRunOutput({
      sessionId: session.id,
      runId: run.id,
      boundary: {
        kind: "completed",
      },
    });
  }

  private rememberExecutionMaterialization(
    materialization: DesktopAiExecutionMaterialization,
    aliasId?: string,
  ) {
    cacheExecutionMaterialization(this.executionMaterializations, materialization, aliasId);
  }

  private async executeForegroundTurn(
    sessionId: SessionRecord["id"],
    work: (signal: AbortSignal) => Promise<{
      runId: RunRecord["id"];
      boundary: RunBoundary;
    }>,
  ) {
    const controller = new AbortController();
    let resolveCompletion: (() => void) | undefined;
    let rejectCompletion: ((reason?: unknown) => void) | undefined;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    this.activeTurns.set(sessionId, {
      controller,
      completion,
    });

    try {
      const result = await work(controller.signal);
      if (controller.signal.aborted && isUserAbortedBoundary(result.boundary)) {
        await this.persistAbortedRunState({
          sessionId,
          runId: result.runId,
        });
      }

      return await this.loadRunOutput({
        sessionId,
        runId: result.runId,
        boundary: result.boundary,
      });
    } catch (error) {
      rejectCompletion?.(error);
      throw error;
    } finally {
      const activeTurn = this.activeTurns.get(sessionId);
      if (activeTurn?.controller === controller) {
        this.activeTurns.delete(sessionId);
      }
      resolveCompletion?.();
    }
  }

  private async persistAbortedRunState(input: {
    sessionId: SessionRecord["id"];
    runId: RunRecord["id"];
  }) {
    const session = await this.sessionStore.get(input.sessionId);
    const run = await this.runStore.get(input.runId);
    const now = this.clock.now();
    const unitOfWork = new SqliteUnitOfWorkAdapter(this.db);

    await unitOfWork.transaction(async () => {
      await this.sessionStore.save({
        ...session,
        status: "idle",
        updatedAt: now,
      });
      await this.runStore.save({
        ...run,
        status: "cancelled",
        updatedAt: now,
        completedAt: run.completedAt ?? now,
        metadata: {
          ...(run.metadata ? { ...run.metadata } : {}),
          cancelledByUser: true,
        },
      });
    });
  }

  private async publishRuntimeEventsBatch(events: readonly ConversationRuntimeEvent[]) {
    if (!this.options.runtimeEventsPublisher || events.length === 0) {
      return;
    }

    const sessionId = normalizeOptionalText(events[0]?.sessionId);
    if (!sessionId) {
      return;
    }

    const session = await this.tryGetSession(asSessionId(sessionId));
    const workspaceId = normalizeOptionalText(session?.metadata?.workspaceId);
    await this.options.runtimeEventsPublisher({
      sessionId,
      ...(workspaceId ? { workspaceId } : {}),
      events: [...events],
    });
  }
}

function isUserAbortedBoundary(boundary: RunBoundary): boolean {
  return boundary.kind === "failed" && boundary.error.code === USER_ABORTED_TURN_ERROR_CODE;
}
