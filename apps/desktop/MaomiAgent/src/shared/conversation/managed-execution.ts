import type { DesktopConversationComposerMode } from "../desktop-conversation";
import type {
  DesktopTaskExecutionMode,
  DesktopTaskRunMode,
} from "../desktop-tasks";

export const FULLY_MANAGED_AGENT_ID = "managed-autopilot";
export const CONCISE_AGENT_ID = "concise";
export const WECHAT_AGENT_ID = "wechat.agent";
export const UI_DESIGNER_AGENT_ID = "ui-designer";
export const DEFAULT_DESKTOP_PRIMARY_AGENT_ID = CONCISE_AGENT_ID;
const CONVERSATION_SETTINGS_KEY = "conversationSettings";

const EXECUTION_INTENT_RE = /(implement|fix|debug|repair|refactor|update|write|create|build|ship|deploy|review|test|verify|run|execute|automate|continue|finish|complete|deliver|patch|inspect|investigate|diagnose|retry|实现|修复|调试|排查|重构|修改|新增|创建|搭建|编写|构建|部署|评审|测试|验证|执行|自动|继续推进|完成|交付|重试)/iu;
const ORCHESTRATION_INTENT_RE = /(run|execute|automate|continue|finish|complete|deliver|retry|start|ship|deploy|执行|自动|继续推进|完成|交付|重试|开始|启动|跑起来|收尾|处理完)/iu;
const PROJECT_SCAFFOLDING_RE = /(project|scaffold|skeleton|boilerplate|workspace|module|service|package\.json|go\.mod|cargo\.toml|requirements\.txt|目录结构|项目|工程|脚手架|骨架|模块|初始化|多文件|仓库|应用|服务)/iu;
const QUESTION_FRAMING_RE = /(what|why|how|explain|tell me|describe|介绍|解释|说明|什么|为什么|怎么|为何|聊聊|分析一下)/iu;
const ACTION_REQUEST_RE = /(please|start|continue|help me|帮我|给我|开始|继续|直接|立刻|马上|自动)/iu;

export type DesktopConversationExecutionStrategy = {
  autoPromoted: boolean;
  executionMode: DesktopTaskExecutionMode;
  runMode: DesktopTaskRunMode;
  selectedAgentId?: string;
  sessionMetadata?: Record<string, unknown>;
  runMetadata?: Record<string, unknown>;
  taskMetadata?: Record<string, unknown>;
};

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBooleanFlag(metadata: Record<string, unknown> | undefined, key: string): boolean {
  return metadata?.[key] === true;
}

function readConversationSettingsBooleanFlag(
  metadata: Record<string, unknown> | undefined,
  key: string,
): boolean {
  const settings = isRecord(metadata?.[CONVERSATION_SETTINGS_KEY])
    ? metadata[CONVERSATION_SETTINGS_KEY] as Record<string, unknown>
    : undefined;
  return settings?.[key] === true;
}

function readRunMode(metadata: Record<string, unknown> | undefined): DesktopTaskRunMode | undefined {
  const value = metadata?.runMode;
  return value === "normal" || value === "long_task_orchestration" || value === "hosted_autopilot"
    ? value
    : undefined;
}

function readExecutionMode(metadata: Record<string, unknown> | undefined): DesktopTaskExecutionMode | undefined {
  const value = metadata?.executionMode;
  return value === "interactive" || value === "background" ? value : undefined;
}

export function shouldAutoPromoteDesktopConversationToManagedExecution(input: {
  text?: string;
  attachmentCount?: number;
  selectedAgentId?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  const selectedAgentId = normalizeOptionalText(input.selectedAgentId);
  if (selectedAgentId === FULLY_MANAGED_AGENT_ID) {
    return true;
  }

  if (selectedAgentId === CONCISE_AGENT_ID) {
    return false;
  }

  const metadata = isRecord(input.metadata) ? input.metadata : undefined;
  if (readBooleanFlag(metadata, "managedExecution")) {
    return true;
  }

  if (readConversationSettingsBooleanFlag(metadata, "managedExecutionEnabled")) {
    return true;
  }

  const existingRunMode = readRunMode(metadata);
  if (existingRunMode === "hosted_autopilot" || existingRunMode === "long_task_orchestration") {
    return true;
  }

  const text = normalizeOptionalText(input.text);
  if (!text) {
    return false;
  }

  if (!EXECUTION_INTENT_RE.test(text)) {
    return false;
  }

  const hasOrchestrationIntent = ORCHESTRATION_INTENT_RE.test(text)
    || PROJECT_SCAFFOLDING_RE.test(text);
  if (!hasOrchestrationIntent) {
    return false;
  }

  if (!QUESTION_FRAMING_RE.test(text)) {
    return true;
  }

  return ACTION_REQUEST_RE.test(text) || (input.attachmentCount ?? 0) > 0;
}

export function resolveDesktopConversationExecutionStrategy(input: {
  text?: string;
  attachmentCount?: number;
  selectedAgentId?: string;
  composerMode?: DesktopConversationComposerMode;
  metadata?: Record<string, unknown>;
}): DesktopConversationExecutionStrategy {
  const metadata = isRecord(input.metadata) ? input.metadata : undefined;
  const existingRunMode = readRunMode(metadata);
  const existingExecutionMode = readExecutionMode(metadata);
  const selectedAgentId = normalizeOptionalText(input.selectedAgentId);
  const composerMode = input.composerMode === "plan" ? "plan" : "agent";
  const workspaceManagedExecutionEnabled = readConversationSettingsBooleanFlag(
    metadata,
    "managedExecutionEnabled",
  );

  if (composerMode === "plan") {
    return {
      autoPromoted: false,
      executionMode: "interactive",
      runMode: "normal",
      selectedAgentId,
    };
  }

  if (
    readBooleanFlag(metadata, "managedExecution")
    || existingRunMode === "hosted_autopilot"
    || existingRunMode === "long_task_orchestration"
  ) {
    const managedMetadata = {
      managedExecution: true,
      rootTask: metadata?.rootTask === true,
      runMode: existingRunMode ?? "hosted_autopilot",
      executionMode: existingExecutionMode ?? "background",
      ...(selectedAgentId ? { executionAgentId: selectedAgentId } : {}),
    } satisfies Record<string, unknown>;

    return {
      autoPromoted: false,
      executionMode: existingExecutionMode ?? "background",
      runMode: existingRunMode ?? "hosted_autopilot",
      selectedAgentId,
      sessionMetadata: managedMetadata,
      runMetadata: managedMetadata,
      taskMetadata: managedMetadata,
    };
  }

  if (selectedAgentId === CONCISE_AGENT_ID) {
    return {
      autoPromoted: false,
      executionMode: "interactive",
      runMode: "normal",
      selectedAgentId,
    };
  }

  if (workspaceManagedExecutionEnabled) {
    const managedMetadata = {
      managedExecution: true,
      rootTask: true,
      runMode: "hosted_autopilot",
      executionMode: "background",
      executionAgentId: FULLY_MANAGED_AGENT_ID,
      ...(selectedAgentId && selectedAgentId !== FULLY_MANAGED_AGENT_ID
        ? { preferredExecutionAgentId: selectedAgentId }
        : {}),
    } satisfies Record<string, unknown>;

    return {
      autoPromoted: selectedAgentId !== FULLY_MANAGED_AGENT_ID,
      executionMode: "background",
      runMode: "hosted_autopilot",
      selectedAgentId: FULLY_MANAGED_AGENT_ID,
      sessionMetadata: managedMetadata,
      runMetadata: managedMetadata,
      taskMetadata: managedMetadata,
    };
  }

  if (!shouldAutoPromoteDesktopConversationToManagedExecution(input)) {
    return {
      autoPromoted: false,
      executionMode: "interactive",
      runMode: "normal",
      selectedAgentId,
    };
  }

  const managedMetadata = {
    managedExecution: true,
    rootTask: true,
    runMode: "hosted_autopilot",
    executionMode: "background",
    executionAgentId: FULLY_MANAGED_AGENT_ID,
    ...(selectedAgentId && selectedAgentId !== FULLY_MANAGED_AGENT_ID
      ? { preferredExecutionAgentId: selectedAgentId }
      : {}),
  } satisfies Record<string, unknown>;

  return {
    autoPromoted: selectedAgentId !== FULLY_MANAGED_AGENT_ID,
    executionMode: "background",
    runMode: "hosted_autopilot",
    selectedAgentId: FULLY_MANAGED_AGENT_ID,
    sessionMetadata: managedMetadata,
    runMetadata: managedMetadata,
    taskMetadata: managedMetadata,
  };
}
