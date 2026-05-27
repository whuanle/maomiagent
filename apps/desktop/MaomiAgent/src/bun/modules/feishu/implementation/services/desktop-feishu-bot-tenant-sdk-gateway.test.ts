import { describe, expect, test } from "bun:test";

import { DesktopFeishuBotTenantSdkGateway } from "./desktop-feishu-bot-tenant-sdk-gateway";

describe("DesktopFeishuBotTenantSdkGateway", () => {
  test("reads bot credentials only and resolves the sender primary calendar with tenant token options", async () => {
    const calls: Array<{ payload: unknown; options: unknown }> = [];
    const gateway = new DesktopFeishuBotTenantSdkGateway({
      store: {
        read: async () => ({
          bot: {
            appId: "cli_bot_app",
            appSecret: "bot_secret",
          },
        }),
      } as any,
      openApiClient: {
        getTenantAccessToken: async () => ({
          tenantAccessToken: "tenant_token_1",
          expiresAt: "2026-05-26T12:00:00.000Z",
        }),
      } as any,
      createClient: () => ({
        calendar: {
          v4: {
            calendar: {
              primarys: async (payload: unknown, options: unknown) => {
                calls.push({ payload, options });
                return {
                  data: {
                    calendars: [{
                      user_id: "ou_user_1",
                      calendar: { calendar_id: "cal_1" },
                    }],
                  },
                };
              },
            },
          },
        },
      }) as any,
      withTenantToken: (tenantToken: string) => ({ tenantToken } as any),
      now: () => new Date("2026-05-26T10:00:00.000Z"),
    });

    const result = await gateway.getPrimaryCalendar({
      userId: "ou_user_1",
      userIdType: "open_id",
    });

    expect(result).toEqual({
      calendarId: "cal_1",
      userId: "ou_user_1",
    });
    expect(calls[0]).toEqual({
      payload: {
        data: {
          user_ids: ["ou_user_1"],
        },
        params: {
          user_id_type: "open_id",
        },
      },
      options: {
        tenantToken: "tenant_token_1",
      },
    });
  });

  test("surfaces missing tenant scopes with a user-facing permission error", async () => {
    const gateway = new DesktopFeishuBotTenantSdkGateway({
      store: {
        read: async () => ({
          bot: {
            appId: "cli_bot_app",
            appSecret: "bot_secret",
          },
        }),
      } as any,
      openApiClient: {
        getTenantAccessToken: async () => ({
          tenantAccessToken: "tenant_token_1",
          expiresAt: "2026-05-26T12:00:00.000Z",
        }),
      } as any,
      createClient: () => ({
        calendar: {
          v4: {
            calendar: {
              primarys: async () => {
                throw {
                  response: {
                    data: {
                      code: 99991672,
                      msg: "Access denied. One of the following scopes is required: [calendar:calendar:readonly, calendar:calendar:read]",
                      permission_violations: [
                        { scope: "calendar:calendar:readonly" },
                        { required_scope: "calendar:calendar:read" },
                      ],
                    },
                  },
                };
              },
            },
          },
        },
      }) as any,
      withTenantToken: (tenantToken: string) => ({ tenantToken } as any),
    });

    await expect(gateway.getPrimaryCalendar({
      userId: "ou_user_1",
      userIdType: "open_id",
    })).rejects.toThrow("当前飞书机器人应用缺少所需的应用身份权限");
    await expect(gateway.getPrimaryCalendar({
      userId: "ou_user_1",
      userIdType: "open_id",
    })).rejects.toThrow("calendar:calendar:readonly");
  });
});
