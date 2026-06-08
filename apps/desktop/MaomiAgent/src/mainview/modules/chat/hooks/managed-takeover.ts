import { FULLY_MANAGED_AGENT_ID } from "../../../../shared/conversation/managed-execution";
import type { DesktopConversationSessionItem, DesktopConversationSessionStatus } from "../../../../shared/desktop-conversation";

export const DEFAULT_MANAGED_TAKEOVER_AGENT_ID = "autopilot-orchestrator";

export const MANAGED_TAKEOVER_KICKOFF_TEXT = [
  "Continue executing the confirmed managed task using the linked root task specification.",
  "Keep progressing autonomously until the task is completed or you hit a real blocker that must be surfaced.",
].join(" ");

export type ManagedTakeoverLaunchPlan = {
  rootTaskId: string;
  executionAgentId: string;
  existingSessionId?: string;
};

export type ManagedTakeoverLaunchBehavior =
  | "create_and_open"
  | "keep_current_session";

function trimText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRootTaskId(metadata: Record<string, unknown> | undefined): string | undefined {
  return trimText(metadata?.linkedRootTaskId) ?? trimText(metadata?.rootTaskId);
}

function findExistingManagedTakeoverSession(input: {
  sourceSession: Pick<DesktopConversationSessionItem, "sessionId" | "metadata">;
  sessions: readonly DesktopConversationSessionItem[];
  metadata?: Record<string, unknown>;
}) {
  const metadata = input.metadata ?? input.sourceSession.metadata;
  const rootTaskId = readRootTaskId(metadata);
  if (!rootTaskId) {
    return undefined;
  }

  return input.sessions.find((item) =>
    item.parentSessionId === input.sourceSession.sessionId
    && item.status !== "archived"
    && readRootTaskId(item.metadata) === rootTaskId
    && item.metadata?.rootTask !== true);
}

function readManagedExecutionStage(metadata: Record<string, unknown> | undefined): string | undefined {
  return trimText(metadata?.managedExecutionStage);
}

function readExecutionAgentId(metadata: Record<string, unknown> | undefined): string {
  const preferredExecutionAgentId = trimText(metadata?.preferredExecutionAgentId);
  if (preferredExecutionAgentId) {
    return preferredExecutionAgentId;
  }

  const executionAgentId = trimText(metadata?.executionAgentId);
  if (executionAgentId && executionAgentId !== FULLY_MANAGED_AGENT_ID) {
    return executionAgentId;
  }

  return DEFAULT_MANAGED_TAKEOVER_AGENT_ID;
}

export function resolveManagedTakeoverLaunchPlan(input: {
  sourceSession: Pick<DesktopConversationSessionItem, "sessionId" | "status" | "parentSessionId" | "metadata">;
  sessions: readonly DesktopConversationSessionItem[];
  metadata?: Record<string, unknown>;
}): ManagedTakeoverLaunchPlan | undefined {
  const sourceStatus: DesktopConversationSessionStatus = input.sourceSession.status;
  if (sourceStatus === "failed" || sourceStatus === "archived" || input.sourceSession.parentSessionId) {
    return undefined;
  }

  const metadata = input.metadata ?? input.sourceSession.metadata;
  const rootTaskId = readRootTaskId(metadata);
  const stage = readManagedExecutionStage(metadata);
  const phase = trimText(metadata?.phase);

  if (!rootTaskId || (stage !== "ready" && phase !== "awaiting_task_confirmation")) {
    return undefined;
  }

  const existingSession = findExistingManagedTakeoverSession(input);
  const executionAgentId = readExecutionAgentId(metadata);

  return {
    rootTaskId,
    executionAgentId,
    ...(existingSession ? { existingSessionId: existingSession.sessionId } : {}),
  };
}

export function resolveManagedTakeoverLaunchBehavior(
  plan: ManagedTakeoverLaunchPlan | undefined,
): ManagedTakeoverLaunchBehavior | undefined {
  if (!plan) {
    return undefined;
  }

  return plan.existingSessionId ? "keep_current_session" : "create_and_open";
}

export function hasManagedTakeoverChildSession(input: {
  sourceSession: Pick<DesktopConversationSessionItem, "sessionId" | "metadata">;
  sessions: readonly DesktopConversationSessionItem[];
  metadata?: Record<string, unknown>;
}): boolean {
  return Boolean(findExistingManagedTakeoverSession(input));
}
