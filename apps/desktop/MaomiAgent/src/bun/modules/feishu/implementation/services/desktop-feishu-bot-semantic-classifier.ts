import type { DesktopAiOneShotPort } from "../../../ai";
import type {
  DesktopFeishuBotPendingActionDecision,
  DesktopFeishuBotPendingActionSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";

const FEISHU_BOT_PENDING_ACTION_DECISIONS = new Set<DesktopFeishuBotPendingActionDecision>([
  "confirm",
  "cancel",
  "modify",
  "new_request",
  "unclear",
]);

function normalizeDecision(value: string): DesktopFeishuBotPendingActionDecision {
  const normalized = value.trim().toLowerCase().replace(/[^a-z_]/g, "");
  return FEISHU_BOT_PENDING_ACTION_DECISIONS.has(normalized as DesktopFeishuBotPendingActionDecision)
    ? normalized as DesktopFeishuBotPendingActionDecision
    : "unclear";
}

function fallbackDecision(replyText: string): DesktopFeishuBotPendingActionDecision {
  const normalized = replyText.trim();
  if (!normalized) {
    return "unclear";
  }
  if (/(取消|先别|不用了|不用做了|算了|cancel|stop)/i.test(normalized)) {
    return "cancel";
  }
  if (/(改成|改到|换成|调整|推迟|提前|改为|change|move|reschedule)/i.test(normalized)) {
    return "modify";
  }
  if (/(确认|好的|没问题|可以|是的|嗯好|ok|okay|yes|sure)/i.test(normalized)) {
    return "confirm";
  }
  return "unclear";
}

export interface DesktopFeishuBotSemanticClassifierPort {
  classify(input: {
    workspaceId: string;
    selectedChannelId?: string;
    selectedModelId?: string;
    pendingAction: DesktopFeishuBotPendingActionSnapshot;
    replyText: string;
  }): Promise<DesktopFeishuBotPendingActionDecision>;
}

export class DesktopFeishuBotSemanticClassifier
  implements DesktopFeishuBotSemanticClassifierPort {
  constructor(
    private readonly aiOneShot: Pick<DesktopAiOneShotPort, "execute">,
  ) {}

  async classify(input: {
    workspaceId: string;
    selectedChannelId?: string;
    selectedModelId?: string;
    pendingAction: DesktopFeishuBotPendingActionSnapshot;
    replyText: string;
  }): Promise<DesktopFeishuBotPendingActionDecision> {
    try {
      const result = await this.aiOneShot.execute({
        workspaceId: input.workspaceId,
        selectedChannelId: input.selectedChannelId,
        selectedModelId: input.selectedModelId,
        systemBlocks: [{
          id: "feishu-bot-confirmation-classifier",
          kind: "instruction",
          priority: 100,
          content: [
            "Classify the user's reply to a pending Feishu action.",
            "Return exactly one token from: confirm, cancel, modify, new_request, unclear.",
            "Use modify when the user changes fields of the pending action.",
            "Use new_request when the user starts a different task instead of replying to the pending action.",
          ].join("\n"),
        }],
        messages: [{
          role: "user",
          content: JSON.stringify({
            pendingSummary: input.pendingAction.summary,
            pendingDetails: input.pendingAction.details,
            pendingActionId: input.pendingAction.actionId,
            reply: input.replyText,
          }),
        }],
        settings: {
          temperature: 0,
        },
      });

      const modelDecision = normalizeDecision(result.content);
      return modelDecision === "unclear"
        ? fallbackDecision(input.replyText)
        : modelDecision;
    } catch {
      return fallbackDecision(input.replyText);
    }
  }
}
