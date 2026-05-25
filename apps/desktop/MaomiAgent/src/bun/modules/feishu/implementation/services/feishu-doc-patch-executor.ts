import type { FeishuDocPatchPlan } from "./feishu-doc-patch-planner";

export class FeishuDocPatchExecutor {
  constructor(private readonly api: {
    updateText(input: { documentId: string; revisionId: string; blockId: string; text: string }): Promise<void>;
    uploadAsset(input: { documentId: string; blockId: string; localPath: string }): Promise<{ token: string }>;
  }) {}

  async execute(plan: FeishuDocPatchPlan): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }> {
    const blocked = plan.operations.find((operation) => operation.kind === "blocked_change");
    if (blocked?.kind === "blocked_change") {
      return { status: "blocked", message: blocked.reason };
    }

    const unsupported = plan.operations.find((operation) => operation.kind !== "update_text");
    if (unsupported) {
      return { status: "blocked", message: `Unsupported patch operation: ${unsupported.kind}` };
    }

    try {
      for (const operation of plan.operations) {
        if (operation.kind === "update_text") {
          await this.api.updateText({
            documentId: plan.documentId,
            revisionId: plan.baseRevisionId,
            blockId: operation.blockId,
            text: operation.text,
          });
        }
      }
      return { status: "succeeded" };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  }
}