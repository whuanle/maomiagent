import { describe, expect, test } from "bun:test";

import { DesktopFeishuConversationCapabilityProvider } from "./desktop-feishu-conversation-capability-provider";
import { buildFeishuBotConversationMetadata } from "./desktop-feishu-bot-capability-policy";

describe("DesktopFeishuConversationCapabilityProvider", () => {
  test("uses bot tenant actions even when smart assistant oauth is disabled", async () => {
    const executions: Array<Record<string, unknown>> = [];
    const provider = new DesktopFeishuConversationCapabilityProvider({
      async getState() {
        return {
          smartAssistant: {
            enabled: false,
            authStatus: "idle",
            actions: [],
          },
        } as any;
      },
      async getBotState() {
        return {
          tenantCapabilities: {
            profile: "feishu_bot_tenant",
            actions: [
              { actionId: "calendar.create_event", domain: "calendar" },
              { actionId: "tasks.create", domain: "tasks" },
            ],
            blockedActionIds: ["docs.search"],
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
      actionCount: 2,
    }));
    expect((listed.tools[0] as any).inputSchema.properties.actionId.enum).toEqual([
      "calendar.create_event",
      "tasks.create",
    ]);

    await contribution!.toolHandlers[0]!.execute({
      call: {
        input: {
          actionId: "create_event",
          title: "AI 落地讨论",
          startAt: "2026-05-26T09:00:00+08:00",
          endAt: "2026-05-26T10:00:00+08:00",
          createMeeting: true,
        },
      },
      context: {
        run: {
          metadata: {
            feishuBotActor: {
              chatId: "oc_1",
              chatType: "p2p",
              messageId: "om_1",
              senderId: "ou_user_1",
              senderIdType: "open_id",
              senderOpenId: "ou_user_1",
            },
          },
        },
        session: { metadata: {} },
      },
    } as any);

    await expect(contribution!.toolHandlers[0]!.execute({
      call: { input: { actionId: "docs.search", query: "AI 落地" } },
      context: { run: { metadata: {} }, session: { metadata: {} } },
    } as any)).rejects.toEqual(expect.objectContaining({
      code: "invalid_argument",
      message: "当前飞书机器人未开通此能力。",
    }));

    expect(executions).toEqual([
      expect.objectContaining({
        actionId: "calendar.create_event",
        executionProfile: "feishu_bot_tenant",
        workspaceId: "workspace-1",
        userId: "ou_user_1",
        userIdType: "open_id",
        chatId: "oc_1",
        messageId: "om_1",
        attendeeIds: ["ou_user_1"],
        createMeeting: true,
      }),
    ]);
  });

  test("accepts legacy bot session metadata and maps legacy action ids to tenant actions", async () => {
    const executions: Array<Record<string, unknown>> = [];
    const provider = new DesktopFeishuConversationCapabilityProvider({
      async getState() {
        return {
          smartAssistant: {
            enabled: false,
            authStatus: "idle",
            actions: [],
          },
        } as any;
      },
      async getBotState() {
        return {
          tenantCapabilities: {
            profile: "feishu_bot_tenant",
            actions: [
              { actionId: "calendar.agenda", domain: "calendar" },
              { actionId: "calendar.find_slot", domain: "calendar" },
              { actionId: "calendar.create_event", domain: "calendar" },
              { actionId: "tasks.create", domain: "tasks" },
              { actionId: "tasks.complete", domain: "tasks" },
            ],
            blockedActionIds: ["docs.search"],
          },
        } as any;
      },
      async executeSmartAssistantAction(input) {
        executions.push({ ...input });
        return {
          workspaceId: input.workspaceId,
          actionId: input.actionId,
          domain: "calendar",
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
      sessionMetadata: {
        source: {
          kind: "feishu_bot",
          tenantKey: "tenant-1",
          chatId: "oc_1",
          conversationKey: "tenant-1:oc_1:root",
        },
        conversationSettings: {
          capabilityPreferences: {
            "feishu.smartAssistant": true,
          },
        },
        feishuBotPolicy: {
          allowedDomains: ["docs", "calendar", "tasks", "meetings"],
        },
      },
    });

    expect(contribution).toBeDefined();
    const listed = await contribution!.toolSources[0]!.listTools();
    expect((listed.tools[0] as any).inputSchema.properties.actionId.enum).toEqual([
      "calendar.agenda",
      "calendar.find_slot",
      "calendar.create_event",
      "tasks.create",
      "tasks.complete",
    ]);

    await contribution!.toolHandlers[0]!.execute({
      call: {
        input: {
          actionId: "create_event",
          title: "AI 落地讨论",
          startAt: "2026-05-26T09:00:00+08:00",
          endAt: "2026-05-26T10:00:00+08:00",
        },
      },
      context: {
        run: {
          metadata: {
            feishuBotActor: {
              chatId: "oc_1",
              chatType: "p2p",
              messageId: "om_legacy",
              senderId: "ou_user_legacy",
              senderIdType: "open_id",
              senderOpenId: "ou_user_legacy",
            },
          },
        },
        session: { metadata: {} },
      },
    } as any);

    expect(executions).toEqual([
      expect.objectContaining({
        actionId: "calendar.create_event",
        executionProfile: "feishu_bot_tenant",
        userId: "ou_user_legacy",
        userIdType: "open_id",
      }),
    ]);
  });

  test("rejects mutating bot actions when websocket sender identity is missing", async () => {
    const provider = new DesktopFeishuConversationCapabilityProvider({
      async getState() {
        return {
          smartAssistant: {
            enabled: true,
            authStatus: "authorized",
            actions: [{
              actionId: "calendar.create_event",
              domain: "calendar",
            }],
          },
        } as any;
      },
      async getBotState() {
        return {
          tenantCapabilities: {
            profile: "feishu_bot_tenant",
            actions: [{ actionId: "calendar.create_event", domain: "calendar" }],
            blockedActionIds: [],
          },
        } as any;
      },
      async executeSmartAssistantAction() {
        throw new Error("should not execute without actor identity");
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

    await expect(contribution!.toolHandlers[0]!.execute({
      call: {
        input: {
          actionId: "calendar.create_event",
          title: "AI 落地讨论",
          startAt: "2026-05-26T09:00:00+08:00",
          endAt: "2026-05-26T10:00:00+08:00",
        },
      },
      context: { run: { metadata: {} }, session: { metadata: {} } },
    } as any)).rejects.toEqual(expect.objectContaining({
      code: "invalid_argument",
      message: "This Feishu bot action requires the sender identity, but the current websocket event did not provide a usable user id.",
    }));
  });
});
