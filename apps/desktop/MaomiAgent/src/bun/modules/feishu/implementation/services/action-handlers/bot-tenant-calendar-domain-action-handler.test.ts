import { describe, expect, test } from "bun:test";

import { BotTenantCalendarDomainActionHandler } from "./bot-tenant-calendar-domain-action-handler";

describe("BotTenantCalendarDomainActionHandler", () => {
  test("requires confirmation before creating a calendar event", async () => {
    const handler = new BotTenantCalendarDomainActionHandler({
      listAgenda: async () => [],
      findFreeBusy: async () => [],
      createCalendarEvent: async () => {
        throw new Error("should not execute without confirmation");
      },
    } as any);

    const result = await handler.execute({
      domain: "calendar",
      availableRuntimeCount: 1,
      input: {
        actionId: "calendar.create_event",
        executionProfile: "feishu_bot_tenant",
        title: "AI 落地讨论",
        startAt: "2026-05-26T09:00:00+08:00",
        endAt: "2026-05-26T10:00:00+08:00",
        userId: "ou_user_1",
        userIdType: "open_id",
      },
    });

    expect(result.confirmationRequired).toBe(true);
    expect(result.result).toMatchObject({
      ok: false,
      stage: "confirmation_required",
      actionId: "calendar.create_event",
    });
  });

  test("creates a meeting-style calendar event after confirmation", async () => {
    const calls: unknown[] = [];
    const handler = new BotTenantCalendarDomainActionHandler({
      listAgenda: async () => [],
      findFreeBusy: async () => [],
      createCalendarEvent: async (input) => {
        calls.push(input);
        return {
          eventId: "evt_1",
          calendarId: "cal_1",
          joinUrl: "https://meet.feishu.cn/evt_1",
          addedAttendeeIds: ["ou_user_1", "ou_user_2"],
          failedAttendeeIds: [],
        };
      },
    } as any);

    const result = await handler.execute({
      domain: "calendar",
      availableRuntimeCount: 1,
      input: {
        actionId: "calendar.create_event",
        executionProfile: "feishu_bot_tenant",
        confirm: true,
        title: "AI 落地讨论",
        text: "讨论 tenant-only 机器人链路",
        startAt: "2026-05-26T09:00:00+08:00",
        endAt: "2026-05-26T10:00:00+08:00",
        userId: "ou_user_1",
        userIdType: "open_id",
        attendeeIds: ["ou_user_2"],
        createMeeting: true,
      },
    });

    expect(calls[0]).toMatchObject({
      userId: "ou_user_1",
      userIdType: "open_id",
      attendeeIds: ["ou_user_1", "ou_user_2"],
      createMeeting: true,
    });
    expect(result.result).toMatchObject({
      ok: true,
      stage: "accepted",
      event: {
        eventId: "evt_1",
        calendarId: "cal_1",
        joinUrl: "https://meet.feishu.cn/evt_1",
      },
    });
  });
});
