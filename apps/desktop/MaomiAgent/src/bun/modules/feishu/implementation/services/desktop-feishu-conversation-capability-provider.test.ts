import { describe, expect, test } from "bun:test";

import { DesktopFeishuConversationCapabilityProvider } from "./desktop-feishu-conversation-capability-provider";
import { buildFeishuBotConversationMetadata } from "./desktop-feishu-bot-capability-policy";

describe("DesktopFeishuConversationCapabilityProvider", () => {
  test("filters bot conversations to docs/calendar/tasks/meetings and rejects other domains", async () => {
    const executions: Array<Record<string, unknown>> = [];
    const provider = new DesktopFeishuConversationCapabilityProvider({
      async getState() {
        return {
          smartAssistant: {
            enabled: true,
            authStatus: "authorized",
            actions: [
              {
                actionId: "docs.search",
                domain: "docs",
              },
              {
                actionId: "calendar.create_event",
                domain: "calendar",
              },
              {
                actionId: "tasks.create",
                domain: "tasks",
              },
              {
                actionId: "meetings.create",
                domain: "meetings",
              },
              {
                actionId: "mail.send",
                domain: "mail",
              },
            ],
          },
        } as any;
      },
      async executeSmartAssistantAction(input) {
        executions.push({ ...input });
        return {
          workspaceId: input.workspaceId,
          actionId: input.actionId,
          domain: "docs",
          executionMode: "builtin_runtime",
          executed: true,
          confirmationRequired: false,
          summary: {
            headline: "Executed",
            details: [],
            nextSuggestedActionIds: [],
          },
          result: { ok: true },
          notes: [],
        };
      },
    } as any);

    const contribution = await provider.resolveRuntimeContribution({
      workspaceId: "workspace-1",
      sessionMetadata: buildFeishuBotConversationMetadata({
        tenantKey: "tenant-1",
        chatId: "oc_1",
        conversationKey: "tenant-1:oc_1:root",
      }),
    });

    expect(contribution).toBeDefined();
    const listed = await contribution!.toolSources[0]!.listTools();
    expect(listed.source.metadata).toEqual(expect.objectContaining({
      actionCount: 4,
    }));

    await contribution!.toolHandlers[0]!.execute({
      call: { input: { actionId: "docs.search", query: "release notes" } },
      context: { run: { metadata: {} }, session: { metadata: {} } },
    } as any);

    await expect(contribution!.toolHandlers[0]!.execute({
      call: { input: { actionId: "mail.send" } },
      context: { run: { metadata: {} }, session: { metadata: {} } },
    } as any)).rejects.toEqual(expect.objectContaining({
      code: "invalid_argument",
      message: "Action domain mail is not enabled for this Feishu bot conversation.",
    }));

    expect(executions).toEqual([expect.objectContaining({
      actionId: "docs.search",
      workspaceId: "workspace-1",
    })]);
  });
});
