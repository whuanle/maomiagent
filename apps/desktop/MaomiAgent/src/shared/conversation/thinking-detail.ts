import type { DesktopConversationComposerMode } from "../desktop-conversation";

export type DesktopConversationThinkingDetailLevel = "full" | "compact" | "minimal";

const FULL_DETAIL_AGENT_IDS = new Set([
  "managed-autopilot",
  "autopilot-orchestrator",
  "redblue-orchestrator",
  "planner",
]);

const MINIMAL_DETAIL_AGENT_IDS = new Set([
  "concise",
  "feishu-doc-writer",
  "wechat.agent",
  "ui-designer",
]);

const COMPLEX_EXECUTION_INTENT_RE = /(implement|fix|debug|repair|refactor|update|write|create|build|review|test|verify|run|execute|automate|continue|finish|complete|deliver|patch|inspect|investigate|diagnose|retry|实现|修复|调试|排查|重构|修改|新增|创建|构建|评审|测试|验证|执行|继续推进|完成|交付|重试)/iu;
const EXPLANATION_INTENT_RE = /(why|how|explain|analysis|analyze|reason|思路|原因|分析|解释|为什么|怎么回事)/iu;

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveDesktopConversationThinkingDetailLevel(input: {
  composerMode?: DesktopConversationComposerMode;
  selectedAgentId?: string;
  text?: string;
  attachmentCount?: number;
}): DesktopConversationThinkingDetailLevel {
  if (input.composerMode === "plan") {
    return "full";
  }

  const agentId = normalizeOptionalText(input.selectedAgentId);
  const text = normalizeOptionalText(input.text) ?? "";

  if (agentId && FULL_DETAIL_AGENT_IDS.has(agentId)) {
    return "full";
  }

  if (EXPLANATION_INTENT_RE.test(text)) {
    return "full";
  }

  if (agentId && MINIMAL_DETAIL_AGENT_IDS.has(agentId)) {
    return "minimal";
  }

  if (COMPLEX_EXECUTION_INTENT_RE.test(text)) {
    return (input.attachmentCount ?? 0) > 0 ? "full" : "compact";
  }

  return "minimal";
}
