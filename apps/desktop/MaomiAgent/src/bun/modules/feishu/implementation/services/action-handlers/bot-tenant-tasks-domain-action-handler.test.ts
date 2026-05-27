import { describe, expect, test } from "bun:test";

import { BotTenantTasksDomainActionHandler } from "./bot-tenant-tasks-domain-action-handler";

describe("BotTenantTasksDomainActionHandler", () => {
  test("creates an application-managed task after confirmation", async () => {
    const handler = new BotTenantTasksDomainActionHandler({
      createTask: async () => ({
        taskId: "task_1",
        title: "整理 AI 落地纪要",
        url: "https://feishu.cn/task/task_1",
      }),
      completeTask: async () => {
        throw new Error("not used");
      },
    } as any);

    const result = await handler.execute({
      domain: "tasks",
      availableRuntimeCount: 1,
      input: {
        actionId: "tasks.create",
        executionProfile: "feishu_bot_tenant",
        confirm: true,
        title: "整理 AI 落地纪要",
        text: "明天下午提醒我处理",
        dueAt: "2026-05-27T15:00:00+08:00",
        userId: "ou_user_1",
        userIdType: "open_id",
      },
    });

    expect(result.result).toMatchObject({
      ok: true,
      stage: "accepted",
      task: {
        taskId: "task_1",
        title: "整理 AI 落地纪要",
      },
    });
  });

  test("rejects completion when taskId is missing", async () => {
    const handler = new BotTenantTasksDomainActionHandler({
      createTask: async () => {
        throw new Error("not used");
      },
      completeTask: async () => {
        throw new Error("not used");
      },
    } as any);

    const result = await handler.execute({
      domain: "tasks",
      availableRuntimeCount: 1,
      input: {
        actionId: "tasks.complete",
        executionProfile: "feishu_bot_tenant",
        confirm: true,
      },
    });

    expect(result.result).toMatchObject({
      ok: false,
      stage: "invalid_input",
      message: "taskId is required for task completion.",
    });
  });
});
