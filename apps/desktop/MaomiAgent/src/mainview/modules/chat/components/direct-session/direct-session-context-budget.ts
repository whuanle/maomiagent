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

function formatPercent(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.max(0, Math.round(value))}%`
    : undefined;
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
  const shouldMatchSelectedModel = Boolean(input.selectedModel);
  const budgetMatchesSelection = !contextBudget
    || !shouldMatchSelectedModel
    || (!contextBudget.modelId || contextBudget.modelId === input.selectedModel?.modelId)
    && (!contextBudget.channelId || contextBudget.channelId === input.selectedModel?.channelId);
  const usageMatchesSelection = !latestTokenUsage
    || !shouldMatchSelectedModel
    || (!latestTokenUsage.modelId || latestTokenUsage.modelId === input.selectedModel?.modelId)
    && (!latestTokenUsage.channelId || latestTokenUsage.channelId === input.selectedModel?.channelId);
  const usedTokens = contextBudget && budgetMatchesSelection
    ? contextBudget.estimatedPromptTokens
    : (usageMatchesSelection ? latestTokenUsage?.totalTokens ?? 0 : 0);
  const promptUsagePercent = contextBudget && budgetMatchesSelection
    ? contextBudget.promptUsagePercent
    : undefined;
  const percent = Math.max(
    0,
    Math.min(100, promptUsagePercent ?? Math.round((usedTokens / limitTokens) * 100)),
  );
  const usageText = `${formatTokenCount(usedTokens)} / ${formatTokenCount(limitTokens)}`;
  const isEn = input.language === "en-US";
  const thresholdPercent = contextBudget?.compressionThresholdPercent;
  const thresholdUsagePercent = contextBudget?.thresholdUsagePercent;
  const thresholdLabel = thresholdPercent
    ? (isEn
        ? `Auto compact at ${thresholdPercent}%`
        : `达到 ${thresholdPercent}% 自动压缩`)
    : undefined;
  const isAutoCompressionThresholdReached = contextBudget?.shouldAutoCompress === true;
  const thresholdUsageLabel = formatPercent(thresholdUsagePercent);
  const detailLabel = [
    isEn ? `Context window: ${percent}%` : `模型窗口占比：${percent}%`,
    thresholdLabel,
    thresholdUsageLabel
      ? (isEn ? `Threshold usage: ${thresholdUsageLabel}` : `阈值使用：${thresholdUsageLabel}`)
      : undefined,
  ].filter((item): item is string => Boolean(item)).join("\n");

  return {
    percent,
    ...(typeof thresholdUsagePercent === "number" ? { thresholdUsagePercent } : {}),
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
    ...(detailLabel ? { detailLabel } : {}),
  } as const;
}

export function resolveContextCompressionStatus(input: {
  detail: ChatSelectedSessionView["detail"] | undefined;
  language: DirectConversationSessionPaneProps["language"];
}) {
  const latestRun = input.detail?.runs.at(-1);
  const compaction = input.detail?.currentContextBudget?.compaction;
  const isEn = input.language === "en-US";

  if (
    latestRun?.boundary?.kind === "awaiting_compaction"
    || compaction?.status === "running"
  ) {
    return {
      tone: "warning" as const,
      label: isEn ? "Compacting context" : "正在压缩上下文",
      title: isEn
        ? "The current turn is compacting context before continuing."
        : "当前这一轮正在压缩上下文后继续执行。",
    };
  }

  if (input.detail?.currentContextBudget?.shouldAutoCompress === true) {
    return {
      tone: "warning" as const,
      label: isEn ? "Threshold reached, waiting to compact" : "已达到阈值，等待压缩",
      title: isEn
        ? "This turn has crossed the auto-compaction threshold and will compact context before the next continuation."
        : "当前这一轮已超过自动压缩阈值，会在下一次续跑前先压缩上下文。",
    };
  }

  if (compaction?.status === "completed") {
    return {
      tone: "success" as const,
      label: isEn ? "Context compacted" : "已完成上下文压缩",
      title: isEn
        ? "Context compaction completed and the conversation can continue with the compressed history."
        : "上下文压缩已经完成，会话将基于压缩后的历史继续。",
    };
  }

  if (compaction?.status === "failed") {
    return {
      tone: "error" as const,
      label: isEn ? "Compaction failed" : "上下文压缩失败",
      title: compaction.errorMessage
        ? (isEn
            ? `Context compaction failed: ${compaction.errorMessage}`
            : `上下文压缩失败：${compaction.errorMessage}`)
        : (isEn
            ? "Context compaction failed."
            : "上下文压缩失败。"),
    };
  }

  return undefined;
}
