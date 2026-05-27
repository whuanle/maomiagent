import * as lark from "@larksuiteoapi/node-sdk";

import type { FeishuUserIdType } from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStorePort } from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  DesktopFeishuOpenApiClient,
  DesktopFeishuTenantAccessToken,
} from "./desktop-feishu-openapi-client";

type BotTenantUserIdType = Extract<FeishuUserIdType, "open_id" | "union_id">;

type GatewayDeps = {
  store: Pick<DesktopFeishuStorePort, "read">;
  openApiClient: Pick<DesktopFeishuOpenApiClient, "getTenantAccessToken">;
  createClient?: (input: { appId: string; appSecret: string }) => lark.Client;
  withTenantToken?: typeof lark.withTenantToken;
  now?: () => Date;
};

function toUnixSeconds(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ISO time: ${value}`);
  }

  return String(Math.trunc(timestamp / 1000));
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function extractMissingScopes(payload: Record<string, unknown> | undefined) {
  const scopes = new Set<string>();
  const permissionViolations = Array.isArray(payload?.permission_violations)
    ? payload.permission_violations
    : [];
  for (const item of permissionViolations) {
    const violation = asRecord(item);
    const candidates = [
      violation?.scope,
      violation?.required_scope,
      violation?.permission,
    ];
    for (const candidate of candidates) {
      const scope = trimText(candidate);
      if (scope) {
        scopes.add(scope);
      }
    }
    const nestedScopes = Array.isArray(violation?.scopes) ? violation.scopes : [];
    for (const nested of nestedScopes) {
      const scope = trimText(nested);
      if (scope) {
        scopes.add(scope);
      }
    }
  }

  const message = trimText(payload?.msg) ?? trimText(payload?.message);
  const match = message?.match(/\[([^\]]+)\]/);
  if (match?.[1]) {
    for (const item of match[1].split(",")) {
      const scope = trimText(item);
      if (scope) {
        scopes.add(scope);
      }
    }
  }

  return [...scopes];
}

function normalizeFeishuTenantSdkError(error: unknown) {
  const response = asRecord(asRecord(error)?.response);
  const payload = asRecord(response?.data);
  const code = typeof payload?.code === "number" ? payload.code : undefined;
  if (code === 99991672) {
    const scopes = extractMissingScopes(payload);
    const scopeHint = scopes.length > 0
      ? `：${scopes.join(", ")}`
      : "";
    return new Error(`当前飞书机器人应用缺少所需的应用身份权限${scopeHint}。请先在飞书开放平台为该应用开通对应 tenant 权限后再重试。`);
  }

  const message = trimText(payload?.msg) ?? trimText(payload?.message);
  if (message) {
    return new Error(`飞书 OpenAPI 调用失败：${message}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("飞书 OpenAPI 调用失败。");
}

export class DesktopFeishuBotTenantSdkGateway {
  private readonly createClientImpl;
  private readonly withTenantTokenImpl;
  private readonly now;
  private cachedToken?: { value: string; expiresAtMs: number };
  private readonly clients = new Map<string, lark.Client>();

  constructor(private readonly deps: GatewayDeps) {
    this.createClientImpl = deps.createClient
      ?? ((input) => new lark.Client({ appId: input.appId, appSecret: input.appSecret }));
    this.withTenantTokenImpl = deps.withTenantToken ?? lark.withTenantToken;
    this.now = deps.now ?? (() => new Date());
  }

  private async readBotCredentials() {
    const snapshot = await this.deps.store.read();
    const appId = snapshot.bot.appId?.trim() ?? "";
    const appSecret = snapshot.bot.appSecret?.trim() ?? "";

    if (!appId || !appSecret) {
      throw new Error("飞书机器人应用凭证未配置完整。");
    }

    return { appId, appSecret };
  }

  private async readTenantToken(): Promise<DesktopFeishuTenantAccessToken> {
    const credentials = await this.readBotCredentials();
    return this.deps.openApiClient.getTenantAccessToken(credentials);
  }

  private async getTenantToken() {
    if (this.cachedToken && this.cachedToken.expiresAtMs - this.now().getTime() > 5 * 60 * 1000) {
      return this.cachedToken.value;
    }

    const token = await this.readTenantToken();
    this.cachedToken = {
      value: token.tenantAccessToken,
      expiresAtMs: Date.parse(token.expiresAt),
    };
    return this.cachedToken.value;
  }

  private async getClient() {
    const credentials = await this.readBotCredentials();
    const cacheKey = `${credentials.appId}\u0000${credentials.appSecret}`;
    const cached = this.clients.get(cacheKey);
    if (cached) {
      return cached;
    }

    const client = this.createClientImpl(credentials);
    this.clients.set(cacheKey, client);
    return client;
  }

  private async withTenantClient<T>(
    run: (input: {
      client: lark.Client;
      requestOptions: ReturnType<typeof lark.withTenantToken>;
    }) => Promise<T>,
  ): Promise<T> {
    try {
      const [client, tenantToken] = await Promise.all([
        this.getClient(),
        this.getTenantToken(),
      ]);

      return await run({
        client,
        requestOptions: this.withTenantTokenImpl(tenantToken),
      });
    } catch (error) {
      throw normalizeFeishuTenantSdkError(error);
    }
  }

  async getPrimaryCalendar(input: {
    userId: string;
    userIdType: BotTenantUserIdType;
  }) {
    return this.withTenantClient(async ({ client, requestOptions }) => {
      const response = await client.calendar.v4.calendar.primarys({
        data: {
          user_ids: [input.userId],
        },
        params: {
          user_id_type: input.userIdType,
        },
      }, requestOptions);

      const matched = (response.data?.calendars ?? [])
        .find((item) => item.user_id === input.userId);
      const calendarId = matched?.calendar?.calendar_id ?? "";

      if (!calendarId) {
        throw new Error("无法定位发送者的主日历。");
      }

      return {
        calendarId,
        userId: input.userId,
      };
    });
  }

  async listAgenda(input: {
    userId: string;
    userIdType: BotTenantUserIdType;
    startAt: string;
    endAt: string;
  }) {
    const primary = await this.getPrimaryCalendar({
      userId: input.userId,
      userIdType: input.userIdType,
    });

    return this.withTenantClient(async ({ client, requestOptions }) => {
      const response = await client.calendar.v4.calendarEvent.list({
        path: {
          calendar_id: primary.calendarId,
        },
        params: {
          user_id_type: input.userIdType,
          start_time: toUnixSeconds(input.startAt),
          end_time: toUnixSeconds(input.endAt),
        },
      }, requestOptions);

      return (response.data?.items ?? []).map((item) => ({
        eventId: item.event_id,
        summary: item.summary ?? "",
        startAt: item.start_time?.timestamp ?? "",
        endAt: item.end_time?.timestamp ?? "",
        joinUrl: item.vchat?.meeting_url,
      }));
    });
  }

  async findFreeBusy(input: {
    attendeeIds: string[];
    userIdType: BotTenantUserIdType;
    startAt: string;
    endAt: string;
  }) {
    return this.withTenantClient(async ({ client, requestOptions }) => {
      const response = await client.calendar.v4.freebusy.batch({
        data: {
          user_ids: input.attendeeIds,
          time_min: toUnixSeconds(input.startAt),
          time_max: toUnixSeconds(input.endAt),
        },
        params: {
          user_id_type: input.userIdType,
        },
      }, requestOptions);

      return response.data?.freebusy_lists ?? [];
    });
  }

  async createCalendarEvent(input: {
    userId: string;
    userIdType: BotTenantUserIdType;
    title: string;
    text?: string;
    startAt: string;
    endAt: string;
    timezone?: string;
    attendeeIds: string[];
    createMeeting: boolean;
  }) {
    const primary = await this.getPrimaryCalendar({
      userId: input.userId,
      userIdType: input.userIdType,
    });

    return this.withTenantClient(async ({ client, requestOptions }) => {
      const created = await client.calendar.v4.calendarEvent.create({
        path: {
          calendar_id: primary.calendarId,
        },
        params: {
          user_id_type: input.userIdType,
          idempotency_key: crypto.randomUUID(),
        },
        data: {
          summary: input.title,
          description: input.text,
          start_time: {
            timestamp: toUnixSeconds(input.startAt),
            timezone: input.timezone ?? "Asia/Shanghai",
          },
          end_time: {
            timestamp: toUnixSeconds(input.endAt),
            timezone: input.timezone ?? "Asia/Shanghai",
          },
          ...(input.createMeeting
            ? {
                vchat: {
                  vc_type: "vc" as const,
                  icon_type: "vc" as const,
                },
              }
            : {}),
        },
      }, requestOptions);

      const eventId = created.data?.event?.event_id ?? "";
      if (!eventId) {
        throw new Error("飞书日历创建成功响应缺少 event_id。");
      }

      const attendeeIds = [...new Set(input.attendeeIds)].filter(Boolean);
      let addedAttendeeIds: string[] = [];
      let failedAttendeeIds: string[] = [];
      if (attendeeIds.length > 0) {
        try {
          const attendees = await client.calendar.v4.calendarEventAttendee.create({
            path: {
              calendar_id: primary.calendarId,
              event_id: eventId,
            },
            params: {
              user_id_type: input.userIdType,
            },
            data: {
              attendees: attendeeIds.map((item) => ({
                type: "user" as const,
                user_id: item,
              })),
            },
          }, requestOptions);
          addedAttendeeIds = (attendees.data?.attendees ?? [])
            .map((item) => item.user_id ?? "")
            .filter(Boolean);
          failedAttendeeIds = attendeeIds.filter((item) => !addedAttendeeIds.includes(item));
        } catch {
          failedAttendeeIds = attendeeIds;
        }
      }

      return {
        eventId,
        calendarId: primary.calendarId,
        joinUrl: created.data?.event?.vchat?.meeting_url,
        addedAttendeeIds,
        failedAttendeeIds,
      };
    });
  }

  async createTask(input: {
    title: string;
    text?: string;
    dueAt?: string;
    userId?: string;
    userIdType?: BotTenantUserIdType;
  }) {
    return this.withTenantClient(async ({ client, requestOptions }) => {
      const response = await client.task.v1.task.create({
        params: {
          user_id_type: input.userIdType,
        },
        data: {
          summary: input.title,
          description: input.text,
          ...(input.dueAt
            ? {
                due: {
                  time: input.dueAt,
                  timezone: "Asia/Shanghai",
                  is_all_day: false,
                },
              }
            : {}),
          origin: {
            platform_i18n_name: "MaomiAgent Feishu Bot",
            href: {
              url: "maomiagent://desktop/feishu-bot",
              title: "MaomiAgent Feishu Bot",
            },
          },
          ...(input.userId
            ? {
                collaborator_ids: [input.userId],
              }
            : {}),
        },
      }, requestOptions);

      const task = response.data?.task;
      return {
        taskId: task?.id ?? "",
        title: task?.summary ?? input.title,
        url: task?.origin?.href?.url,
      };
    });
  }

  async completeTask(input: {
    taskId: string;
  }) {
    return this.withTenantClient(async ({ client, requestOptions }) => {
      await client.task.v1.task.complete({
        path: {
          task_id: input.taskId,
        },
      }, requestOptions);

      return {
        taskId: input.taskId,
        completed: true,
      };
    });
  }
}
