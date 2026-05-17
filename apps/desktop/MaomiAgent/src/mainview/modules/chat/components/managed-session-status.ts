import type { DesktopConversationSessionStatus } from "../../../../shared/desktop-conversation";
import type { LanguageCode } from "../../../config/titlebar";

type ManagedSessionBadgeTone = "neutral" | "warning" | "success" | "running";
type ManagedSessionStatusTone = "success" | "running" | "warning" | "error";

export type ManagedSessionIndicator = {
  label: string;
  badgeTone: ManagedSessionBadgeTone;
  statusTone: ManagedSessionStatusTone;
};

function trimText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasManagedRootTask(metadata: Record<string, unknown> | undefined) {
  return Boolean(trimText(metadata?.linkedRootTaskId) ?? trimText(metadata?.rootTaskId));
}

export function resolveManagedSessionIndicator(
  status: DesktopConversationSessionStatus,
  metadata: Record<string, unknown> | undefined,
  language: LanguageCode,
): ManagedSessionIndicator | undefined {
  if (status === "failed" || status === "archived" || !hasManagedRootTask(metadata)) {
    return undefined;
  }

  const phase = trimText(metadata?.phase);
  const stage = trimText(metadata?.managedExecutionStage);
  const stopReason = trimText(metadata?.managedExecutionStopReason);

  if (phase === "completed" || stopReason === "completed" || stage === "completed") {
    return {
      label: language === "en-US" ? "Completed" : "已完成",
      badgeTone: "success",
      statusTone: "success",
    };
  }

  if (phase === "awaiting_task_confirmation" || stage === "ready") {
    return {
      label: language === "en-US" ? "Ready to confirm" : "待确认",
      badgeTone: "warning",
      statusTone: "warning",
    };
  }

  if (phase === "retrying_after_failure") {
    return {
      label: language === "en-US" ? "Retrying" : "重试中",
      badgeTone: "running",
      statusTone: "running",
    };
  }

  if (phase === "executing_plan" || stage === "running") {
    return {
      label: language === "en-US" ? "Running" : "执行中",
      badgeTone: "running",
      statusTone: "running",
    };
  }

  if (stage === "intake_locked") {
    return {
      label: language === "en-US" ? "Collecting spec" : "收集中",
      badgeTone: "running",
      statusTone: "running",
    };
  }

  return undefined;
}