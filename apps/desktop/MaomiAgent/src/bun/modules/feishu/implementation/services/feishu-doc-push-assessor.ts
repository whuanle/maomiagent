import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";

import { type FeishuDocPatchPlan, planFeishuDocPatch } from "./feishu-doc-patch-planner";

export type FeishuDocPushAssessment = {
  status: "ready" | "blocked" | "pull_required";
  publishModeRecommendation: "update_existing" | "publish_new" | "pull_required";
  hasRevisionConflict: boolean;
  hasBlockedChanges: boolean;
  unknownBlockCount: number;
  blockedChanges: Array<{ blockId: string; reason: string }>;
  plan?: FeishuDocPatchPlan;
};

export function assessFeishuDocPush(input: {
  hasRawSourceBaseline: boolean;
  base: FeishuDocIR | null;
  current: FeishuDocIR | null;
  blockedChanges: Array<{ blockId: string; reason: string }>;
  sourceRevisionId?: string;
  baseRevisionId?: string;
}): FeishuDocPushAssessment {
  if (!input.hasRawSourceBaseline || !input.base || !input.current) {
    return {
      status: "pull_required",
      publishModeRecommendation: "pull_required",
      hasRevisionConflict: false,
      hasBlockedChanges: false,
      unknownBlockCount: 0,
      blockedChanges: [],
    };
  }

  const unknownBlockCount = Object.values(input.base.blocks).filter((block) => block.type === "undefined").length;
  const hasRevisionConflict = Boolean(
    input.sourceRevisionId
      && input.baseRevisionId
      && input.sourceRevisionId !== input.baseRevisionId,
  );

  if (hasRevisionConflict) {
    return {
      status: "pull_required",
      publishModeRecommendation: "pull_required",
      hasRevisionConflict: true,
      hasBlockedChanges: false,
      unknownBlockCount,
      blockedChanges: [],
    };
  }

  if (input.blockedChanges.length > 0) {
    return {
      status: "blocked",
      publishModeRecommendation: "update_existing",
      hasRevisionConflict: false,
      hasBlockedChanges: true,
      unknownBlockCount,
      blockedChanges: input.blockedChanges,
    };
  }

  const plan = planFeishuDocPatch(input.base, input.current);
  const unsupported = plan.operations.find((operation) => operation.kind === "blocked_change" || operation.kind !== "update_text");
  if (unsupported) {
    const reason = unsupported.kind === "blocked_change"
      ? unsupported.reason
      : `Unsupported patch operation: ${unsupported.kind}`;

    return {
      status: "blocked",
      publishModeRecommendation: "update_existing",
      hasRevisionConflict: false,
      hasBlockedChanges: true,
      unknownBlockCount,
      blockedChanges: [{ blockId: unsupported.blockId, reason }],
      plan,
    };
  }

  return {
    status: "ready",
    publishModeRecommendation: "update_existing",
    hasRevisionConflict: false,
    hasBlockedChanges: false,
    unknownBlockCount,
    blockedChanges: [],
    plan,
  };
}
