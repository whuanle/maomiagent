import type { ChatSelectedSessionView } from "../../types";
import type { DirectConversationSessionPaneProps } from "./types";

function formatTokenCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return value.toLocaleString("en-US");
}

export function resolveComposerTokenBudgetUsage(input: {
  detail: ChatSelectedSessionView["detail"] | undefined;
  selectedModel: DirectConversationSessionPaneProps["composerModelOptions"][number] | undefined;
  language: DirectConversationSessionPaneProps["language"];
}) {
  const contextBudget = input.detail?.currentContextBudget;
  const limitTokens = input.selectedModel?.contextWindow ?? contextBudget?.contextWindowTokens;
  if (!limitTokens || limitTokens <= 0) {
    return undefined;
  }

  const latestTokenUsage = input.detail?.latestTokenUsage;
  const budgetMatchesSelection = !contextBudget
    || (!contextBudget.modelId || contextBudget.modelId === input.selectedModel?.modelId)
    && (!contextBudget.channelId || contextBudget.channelId === input.selectedModel?.channelId);
  const usageMatchesSelection = !latestTokenUsage
    || (!latestTokenUsage.modelId || latestTokenUsage.modelId === input.selectedModel?.modelId)
    && (!latestTokenUsage.channelId || latestTokenUsage.channelId === input.selectedModel?.channelId);
  const usedTokens = contextBudget && budgetMatchesSelection
    ? contextBudget.estimatedPromptTokens
    : (usageMatchesSelection ? latestTokenUsage?.totalTokens ?? 0 : 0);
  const percent = Math.max(0, Math.min(100, Math.round((usedTokens / limitTokens) * 100)));
  const usageText = `${formatTokenCount(usedTokens)} / ${formatTokenCount(limitTokens)}`;
  const isEn = input.language === "en-US";
  const thresholdPercent = contextBudget?.compressionThresholdPercent;
  const thresholdLabel = thresholdPercent
    ? (isEn
        ? `Auto compact at ${thresholdPercent}%`
        : `达到 ${thresholdPercent}% 自动压缩`)
    : undefined;
  const isAutoCompressionThresholdReached = contextBudget?.shouldAutoCompress === true;

  return {
    percent,
    usedTokens,
    limitTokens,
    status: isAutoCompressionThresholdReached || percent >= 85
      ? "critical"
      : percent >= 60
        ? "warning"
        : "normal",
    label: isEn
      ? `Current context usage: ${usageText}`
      : `当前上下文使用：${usageText}`,
    ariaLabel: isEn
      ? `Context usage ${percent} percent, ${usageText}`
      : `上下文使用 ${percent}%，${usageText}`,
    ...(thresholdPercent ? { thresholdPercent } : {}),
    ...(thresholdLabel ? { thresholdLabel } : {}),
  } as const;
}

export function resolveContextCompressionStatus(input: {
  detail: ChatSelectedSessionView["detail"] | undefined;
  language: DirectConversationSessionPaneProps["language"];
}) {
  const latestRun = input.detail?.runs.at(-1);
  const compaction = input.detail?.currentContextBudget?.compaction;
  const isEn = input.language === "en-US";

  if (latestRun?.boundary?.kind === "awaiting_compaction") {
    return {
      tone: "warning" as const,
      label: isEn ? "Compacting context" : "正在压缩上下文",
      title: isEn
        ? "The current prompt reached the auto-compaction threshold and is being compacted."
        : "当前提示已达到自动压缩阈值，正在压缩上下文。",
    };
  }

  if (compaction?.status === "completed") {
    return {
      tone: "success" as const,
      label: isEn ? "Context compacted" : "已自动压缩",
      title: isEn
        ? "Context was compacted automatically before the latest turn continued."
        : "最近一轮继续执行前，系统已自动完成上下文压缩。",
    };
  }

  if (compaction?.status === "failed") {
    return {
      tone: "error" as const,
      label: isEn ? "Compaction failed" : "压缩失败",
      title: compaction.errorMessage
        ?? (isEn ? "Context compaction failed." : "上下文压缩失败。"),
    };
  }

  return undefined;
}