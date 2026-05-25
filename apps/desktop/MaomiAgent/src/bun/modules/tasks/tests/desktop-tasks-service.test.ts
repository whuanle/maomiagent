import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopConfigurationService } from "../../configuration";
import { DesktopDatabaseService } from "../../database";
import type { DesktopRuntimeContext } from "../../foundation";
import { RuntimeLogsService } from "../../logs";
import { RuntimeLogsStore } from "../../logs/implementation/stores/runtime-logs-store";
import type { DesktopWorkspaceQueryPort } from "../../workspace";
import type { DesktopScheduledTaskHandler } from "../abstraction/ports/desktop-tasks.ports";
import { DesktopTasksService } from "../implementation/services/desktop-tasks-service";
import { DesktopTasksStore } from "../implementation/stores/desktop-tasks-store";

function createRuntimeContext(tempRoot: string): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      registerHttpRoute() {
        return () => {};
      },
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    window: {
      title: "MaomiAgent Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: join(tempRoot, "logs.sqlite"),
            },
            workspace: {
              path: join(tempRoot, "workspace.sqlite"),
            },
          },
        },
      },
    },
    createWindow() {
      throw new Error("not needed");
    },
    installProcessHandlers: false,
  };
}

function createWorkspaceQueryPort(
  items: Array<{ workspaceId: string; name: string }> = [],
): DesktopWorkspaceQueryPort {
  return {
    async list() {
      return {
        items: items.map((item) => ({
          workspaceId: item.workspaceId,
          name: item.name,
          directoryPath: join("E:/workspace", item.workspaceId),
          isPinned: false,
          tags: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
        meta: {
          total: items.length,
          limit: items.length || 1,
          offset: 0,
          hasMore: false,
        },
      };
    },
    async get(workspaceId) {
      const item = items.find((entry) => entry.workspaceId === workspaceId);
      return item ? {
        workspaceId: item.workspaceId,
        name: item.name,
        directoryPath: join("E:/workspace", item.workspaceId),
        isPinned: false,
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } : null;
    },
    async getFileTree() {
      throw new Error("not implemented in test");
    },
    async getFileContent() {
      throw new Error("not implemented in test");
    },
  };
}

async function createFixture(workspaceNames: Array<{ workspaceId: string; name: string }> = []) {
  const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-tasks-"));
  const database = new DesktopDatabaseService(
    new DesktopConfigurationService(createRuntimeContext(tempRoot)),
  );
  const store = new DesktopTasksStore(database.getConnection("workspace"));
  store.upsertTask({
    taskId: "bootstrap-task",
    workspaceId: "__bootstrap__",
    title: "Bootstrap",
    goal: "Prevent legacy auto import in isolated tests",
    taskType: "execution",
    executionMode: "background",
    runMode: "normal",
    origin: "system",
    priority: "low",
    status: "success",
    progress: 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    runCount: 0,
    steps: [],
  });
  const logs = new RuntimeLogsService(
    new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    console,
  );
  const service = new DesktopTasksService(
    store,
    createWorkspaceQueryPort(workspaceNames),
    logs.createLogger({ source: "desktop", module: "desktop.tasks" }),
  );

  return {
    tempRoot,
    database,
    store,
    logs,
    service,
  };
}

async function createLegacyImportFixture(input: {
  legacyTasks: unknown[];
  legacyWorkspaces: Array<{ workspaceId: string; name: string }>;
}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-tasks-legacy-"));
  const legacyConfigDir = join(tempRoot, "legacy-config");
  await mkdir(legacyConfigDir, { recursive: true });
  await writeFile(join(legacyConfigDir, "tasks-state.json"), JSON.stringify({
    items: input.legacyTasks,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf-8");
  await writeFile(join(legacyConfigDir, "workspaces-state.json"), JSON.stringify({
    items: input.legacyWorkspaces,
  }), "utf-8");

  const previousConfigDir = process.env.MAOMI_CONFIG_DIR;
  process.env.MAOMI_CONFIG_DIR = legacyConfigDir;

  const database = new DesktopDatabaseService(
    new DesktopConfigurationService(createRuntimeContext(tempRoot)),
  );
  const store = new DesktopTasksStore(database.getConnection("workspace"));
  const logs = new RuntimeLogsService(
    new RuntimeLogsStore(database.getConnection("runtimeLogs")),
    console,
  );
  const service = new DesktopTasksService(
    store,
    createWorkspaceQueryPort(input.legacyWorkspaces),
    logs.createLogger({ source: "desktop", module: "desktop.tasks" }),
  );

  return {
    tempRoot,
    database,
    service,
    restoreEnv() {
      if (previousConfigDir === undefined) {
        delete process.env.MAOMI_CONFIG_DIR;
        return;
      }
      process.env.MAOMI_CONFIG_DIR = previousConfigDir;
    },
  };
}

describe("DesktopTasksService", () => {
  test("tracks internal conversation tasks by run lifecycle", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      const running = await fixture.service.ensureConversationTaskRunning({
        workspaceId: "default",
        sessionId: "session-123",
        runId: "run_123",
        title: "Agent task: assistant",
        goal: "Implement streaming delivery",
        agentId: "assistant",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      });

      expect(running).toMatchObject({
        taskId: "conversation-run_123",
        workspaceId: "default",
        linkedSessionId: "session-123",
        taskType: "conversation",
        executionMode: "interactive",
        origin: "chat",
        agentId: "assistant",
        status: "running",
        lastRunId: "run_123",
      });

      const blocked = await fixture.service.markConversationTaskBlocked({
        workspaceId: "default",
        runId: "run_123",
        interactionId: "interaction_1",
        message: "Waiting for interaction",
      });
      expect(blocked?.status).toBe("running");
      expect(blocked?.steps[0]).toMatchObject({
        status: "pending",
        message: "Waiting for interaction",
      });

      const completed = await fixture.service.completeConversationTask({
        workspaceId: "default",
        runId: "run_123",
        summary: "Conversation run completed",
      });
      expect(completed).toMatchObject({
        status: "success",
        runCount: 1,
      });

      const completedDetail = await fixture.service.getDetail({
        workspaceId: "default",
        taskId: "conversation-run_123",
        runLimit: 10,
        runOffset: 0,
      });
      expect(completedDetail?.runs).toHaveLength(1);
      expect(completedDetail?.runs[0]).toMatchObject({
        runId: "run_123",
        status: "success",
        executor: "assistant",
        trigger: "manual",
      });

      await fixture.service.ensureConversationTaskRunning({
        workspaceId: "default",
        sessionId: "session-456",
        runId: "run_456",
        title: "Agent task: assistant",
        goal: "Create task failure",
        agentId: "assistant",
      });
      const failed = await fixture.service.failConversationTask({
        workspaceId: "default",
        runId: "run_456",
        code: "RUN_FAILED",
        message: "Provider failed",
      });
      expect(failed).toMatchObject({
        status: "failed",
        error: {
          code: "RUN_FAILED",
          message: "Provider failed",
        },
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("preserves hosted autopilot metadata for managed conversation tasks", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      const running = await fixture.service.ensureConversationTaskRunning({
        workspaceId: "default",
        sessionId: "session-managed",
        runId: "run_managed",
        title: "Agent task: managed-autopilot",
        goal: "Fix the failing deployment and keep retrying until it passes.",
        agentId: "managed-autopilot",
        executionMode: "background",
        runMode: "hosted_autopilot",
        metadata: {
          managedExecution: true,
          rootTask: true,
        },
      });

      expect(running).toMatchObject({
        taskId: "conversation-run_managed",
        executionMode: "background",
        runMode: "hosted_autopilot",
        agentId: "managed-autopilot",
      });
      expect(running.metadata).toMatchObject({
        managedExecution: true,
        rootTask: true,
      });

      const projected = await fixture.service.listTaskCenter({
        workspaceId: "default",
      });
      const managed = projected.items.find((item) => item.taskId === "conversation-run_managed");
      expect(managed).toMatchObject({
        sourceKind: "managed_execution",
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("syncs managed conversation root tasks with intake stage metadata", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      const running = await fixture.service.syncManagedConversationRootTask({
        workspaceId: "default",
        sessionId: "session-managed",
        rootTaskId: "managed-root-session-managed",
        runId: "run_managed",
        title: "Managed intake",
        goal: "Collect the managed task specification.",
        agentId: "managed-autopilot",
        executionMode: "background",
        runMode: "hosted_autopilot",
        progress: 15,
        metadata: {
          managedExecution: true,
          rootTask: true,
          phase: "intake_active",
          managedExecutionStage: "intake_locked",
          executionAgentId: "managed-autopilot",
        },
      });

      expect(running).toMatchObject({
        taskId: "managed-root-session-managed",
        linkedSessionId: "session-managed",
        executionMode: "background",
        runMode: "hosted_autopilot",
        status: "running",
      });
      expect(running.metadata).toMatchObject({
        rootTask: true,
        rootTaskId: "managed-root-session-managed",
        phase: "intake_active",
        managedExecutionStage: "intake_locked",
      });

      const ready = await fixture.service.syncManagedConversationRootTask({
        workspaceId: "default",
        sessionId: "session-managed",
        rootTaskId: "managed-root-session-managed",
        runId: "run_managed",
        title: "Managed intake",
        goal: "Collect the managed task specification.",
        agentId: "managed-autopilot",
        executionMode: "background",
        runMode: "hosted_autopilot",
        progress: 60,
        message: "Ready to confirm the managed task takeover.",
        metadata: {
          managedExecution: true,
          rootTask: true,
          phase: "awaiting_task_confirmation",
          managedExecutionStage: "ready",
          executionAgentId: "managed-autopilot",
        },
      });

      expect(ready).toMatchObject({
        taskId: "managed-root-session-managed",
        status: "running",
        progress: 60,
      });
      expect(ready.metadata).toMatchObject({
        phase: "awaiting_task_confirmation",
        managedExecutionStage: "ready",
      });

      const projected = await fixture.service.listTaskCenter({
        workspaceId: "default",
        scope: "root",
      });
      expect(projected.items.find((item) => item.taskId === "managed-root-session-managed")).toMatchObject({
        sourceKind: "managed_execution",
        attentionState: "takeover_required",
        rootTaskId: "managed-root-session-managed",
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("patches managed conversation root task specification metadata", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      await fixture.service.syncManagedConversationRootTask({
        workspaceId: "default",
        sessionId: "session-managed",
        rootTaskId: "managed-root-session-managed",
        runId: "run_managed",
        title: "Managed intake",
        goal: "Collect the managed task specification.",
        agentId: "managed-autopilot",
        executionMode: "background",
        runMode: "hosted_autopilot",
        progress: 15,
        metadata: {
          managedExecution: true,
          rootTask: true,
          phase: "intake_active",
          managedExecutionStage: "intake_locked",
        },
      });

      const patched = await fixture.service.patchManagedConversationRootTask({
        workspaceId: "default",
        rootTaskId: "managed-root-session-managed",
        sessionId: "session-managed",
        runId: "run_managed",
        progress: 60,
        message: "Managed task specification confirmed and ready for takeover.",
        metadata: {
          phase: "awaiting_task_confirmation",
          managedExecutionStage: "ready",
          completionContract: {
            objective: "Fix the failing deployment.",
          },
          verificationPlan: {
            mode: "external",
            status: "pending",
            summary: "Wait for CI.",
          },
        },
      });

      expect(patched).toMatchObject({
        taskId: "managed-root-session-managed",
        status: "running",
        progress: 60,
      });
      expect(patched?.metadata).toMatchObject({
        phase: "awaiting_task_confirmation",
        managedExecutionStage: "ready",
        completionContract: {
          objective: "Fix the failing deployment.",
        },
        verificationPlan: {
          mode: "external",
          status: "pending",
          summary: "Wait for CI.",
        },
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("syncs managed definitions into desktop task records", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);
    const nextRunAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const schedule = {
      kind: "interval" as const,
      intervalMinutes: 30,
      nextRunAt,
      enabled: true,
    };
    const handler: DesktopScheduledTaskHandler = {
      handlerId: "test-handler",
      moduleId: "desktop.test",
      displayName: "Test Handler",
      listDefinitions: () => [{
        taskKey: "daily-sync",
        workspaceId: "default",
        title: "Daily Sync",
        goal: "Synchronize the daily dataset",
        schedule,
        priority: "high",
        metadata: { phase: "syncing" },
      }],
      execute: async () => ({
        summary: "Done",
      }),
    };

    try {
      fixture.service.register(handler);
      await fixture.service.syncManagedTasks();

      const list = await fixture.service.list({ workspaceId: "default", limit: 10, offset: 0 });
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        title: "Daily Sync",
        goal: "Synchronize the daily dataset",
        workspaceId: "default",
        taskType: "automation",
        executionMode: "background",
        priority: "high",
        status: "queued",
      });
      expect(list.items[0]?.handler).toMatchObject({
        handlerId: "test-handler",
        moduleId: "desktop.test",
        taskKey: "daily-sync",
      });
      expect(list.items[0]).toMatchObject({
        surface: "internal",
        visibility: "hidden",
        scope: "workspace",
        identityKey: "workspace::test-handler::daily-sync",
      });

      const taskCenter = await fixture.service.listTaskCenter({
        workspaceId: "default",
        surface: "internal",
        visibility: "hidden",
        sourceKind: "automation",
        exposure: "hidden",
        scope: "all",
        schedule: "active",
        limit: 10,
        offset: 0,
      });
      expect(taskCenter.items).toHaveLength(1);
      expect(taskCenter.items[0]).toMatchObject({
        taskId: list.items[0]?.taskId,
        sourceKind: "automation",
        exposure: "hidden",
        attentionState: "scheduled",
        surface: "internal",
        visibility: "hidden",
      });

      const visibleTaskCenter = await fixture.service.listTaskCenter({
        workspaceId: "default",
        limit: 10,
        offset: 0,
      });
      expect(visibleTaskCenter.items).toHaveLength(0);

      const workspaces = await fixture.service.listWorkspaces();
      expect(workspaces.items.find((item) => item.workspaceId === "default")).toMatchObject({
        workspaceId: "default",
        name: "Default Workspace",
        taskCount: 1,
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("skips legacy tasks that do not declare a workspaceId", async () => {
    const fixture = await createLegacyImportFixture({
      legacyTasks: [{
        taskId: "legacy-missing-workspace",
        title: "Missing workspace",
        goal: "Should be ignored during import",
        status: "queued",
      }, {
        taskId: "legacy-valid-workspace",
        workspaceId: "workspace-1",
        title: "Imported task",
        goal: "Should remain available after import",
        status: "queued",
      }],
      legacyWorkspaces: [{
        workspaceId: "workspace-1",
        name: "Workspace One",
      }],
    });

    try {
      const list = await fixture.service.list({
        workspaceId: "workspace-1",
        limit: 10,
        offset: 0,
      });

      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        taskId: "legacy-valid-workspace",
        workspaceId: "workspace-1",
        title: "Imported task",
      });

      const workspaces = await fixture.service.listWorkspaces();
      expect(workspaces.items).toHaveLength(1);
      expect(workspaces.items[0]).toMatchObject({
        workspaceId: "workspace-1",
        name: "Workspace One",
      });
      expect(workspaces.items.some((item) => item.workspaceId === "default")).toBe(false);
    } finally {
      fixture.restoreEnv();
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("pauses, resumes, and auto-runs due scheduled tasks", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);
    const pastDue = new Date(Date.now() - 5 * 60_000).toISOString();
    let executeCount = 0;
    let currentGoal = "Execute an interval task";
    let observedGoal: string | undefined;
    const handler: DesktopScheduledTaskHandler = {
      handlerId: "test-runner",
      moduleId: "desktop.test",
      displayName: "Test Runner",
      listDefinitions: () => [{
        taskKey: "interval-task",
        workspaceId: "default",
        title: "Interval Task",
        goal: currentGoal,
        schedule: {
          kind: "interval",
          intervalMinutes: 15,
          nextRunAt: pastDue,
          enabled: true,
        },
        metadata: { phase: "queued" },
      }],
      execute: async ({ runId, definition }) => {
        executeCount += 1;
        observedGoal = definition?.goal;
        return {
          summary: "Scheduled task completed",
          outputs: [{
            name: "result",
            value: runId,
          }],
          metadata: { phase: "completed" },
        };
      },
    };

    try {
      fixture.service.register(handler);
      await fixture.service.syncManagedTasks();

      const created = (await fixture.service.list({ workspaceId: "default", limit: 10, offset: 0 })).items[0];
      expect(created).toBeDefined();
      if (!created) {
        throw new Error("expected synced task");
      }

      expect((await fixture.service.listDueScheduledTasks()).map((item) => item.taskId)).toContain(created.taskId);

      const paused = await fixture.service.pauseSchedule(created.workspaceId, created.taskId);
      expect(paused?.schedule?.enabled).toBe(false);
      expect(await fixture.service.listDueScheduledTasks()).toHaveLength(0);

      const resumed = await fixture.service.resumeSchedule(created.workspaceId, created.taskId);
      expect(resumed?.schedule?.enabled).toBe(true);

      currentGoal = "Execute an updated interval task";
      fixture.service.register(handler);

      const ran = await fixture.service.runScheduledTask(created.workspaceId, created.taskId);
      expect(ran?.status).toBe("success");
      expect(ran?.runCount).toBe(1);
      expect(executeCount).toBe(1);
      expect(observedGoal).toBe("Execute an updated interval task");
      expect(ran?.schedule?.nextRunAt).not.toBe(pastDue);

      const detail = await fixture.service.getDetail({
        workspaceId: created.workspaceId,
        taskId: created.taskId,
        runLimit: 10,
        runOffset: 0,
      });
      expect(detail?.runs).toHaveLength(1);
      expect(detail?.runs[0]).toMatchObject({
        status: "success",
        trigger: "auto",
        executor: "test-runner",
      });
      expect(detail?.item.outputs?.[0]).toMatchObject({ name: "result" });
      expect(detail?.item.metadata?.phase).toBe("completed");
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("archives non-critical session tasks and retains critical roots", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);
    const archivedAt = "2026-05-01T00:00:00.000Z";
    const purgeAfterAt = "2026-05-08T00:00:00.000Z";

    try {
      await fixture.service.ensureConversationTaskRunning({
        workspaceId: "default",
        sessionId: "session-archive",
        runId: "run_archive",
        title: "Agent task: assistant",
        goal: "Handle a routine request",
        agentId: "assistant",
      });
      await fixture.service.syncManagedConversationRootTask({
        workspaceId: "default",
        sessionId: "session-archive",
        rootTaskId: "managed-root-session-archive",
        runId: "run_archive",
        title: "Managed intake",
        goal: "Collect managed task confirmation",
        agentId: "managed-autopilot",
        executionMode: "background",
        runMode: "hosted_autopilot",
        progress: 65,
        metadata: {
          managedExecution: true,
          rootTask: true,
          phase: "awaiting_task_confirmation",
          managedExecutionStage: "ready",
          executionAgentId: "managed-autopilot",
        },
      });

      await fixture.service.archiveConversationSessionTasks({
        workspaceId: "default",
        sessionId: "session-archive",
        archivedAt,
      });

      const archivedConversationTask = await fixture.service.get("default", "conversation-run_archive");
      expect(archivedConversationTask).toMatchObject({
        taskId: "conversation-run_archive",
        visibility: "hidden",
        hiddenAt: archivedAt,
        purgeAfterAt,
      });

      const rootTask = await fixture.service.get("default", "managed-root-session-archive");
      expect(rootTask?.hiddenAt).toBeUndefined();
      expect(rootTask?.purgeAfterAt).toBeUndefined();

      const visibleTaskCenter = await fixture.service.listTaskCenter({
        workspaceId: "default",
        scope: "root",
        limit: 10,
        offset: 0,
      });
      expect(visibleTaskCenter.items.map((item) => item.taskId)).toContain("managed-root-session-archive");
      expect(visibleTaskCenter.items.map((item) => item.taskId)).not.toContain("conversation-run_archive");
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("purges archived hidden tasks after retention expires", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      fixture.store.upsertTask({
        taskId: "archived-hidden-task",
        workspaceId: "default",
        title: "Archived hidden task",
        goal: "Should be cleaned after retention",
        taskType: "conversation",
        executionMode: "interactive",
        runMode: "normal",
        origin: "chat",
        priority: "normal",
        status: "success",
        progress: 100,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        runCount: 1,
        steps: [],
        visibility: "hidden",
        hiddenAt: "2026-05-01T00:00:00.000Z",
        purgeAfterAt: "2026-05-08T00:00:00.000Z",
      });
      fixture.store.upsertTaskRun({
        runId: "run-archived-hidden-task",
        workspaceId: "default",
        taskId: "archived-hidden-task",
        status: "success",
        mode: "normal",
        executor: "assistant",
        trigger: "manual",
        startedAt: "2026-04-20T00:00:00.000Z",
        finishedAt: "2026-04-20T00:05:00.000Z",
      });

      await fixture.service.runMaintenanceNow("2026-05-09T00:00:00.000Z");

      expect(await fixture.service.get("default", "archived-hidden-task")).toBeNull();
      expect(fixture.store.listTaskRuns("default", "archived-hidden-task")).toHaveLength(0);
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("backfills legacy projection metadata for historical root tasks", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      const workspaceDb = fixture.database.getConnection("workspace");
      const legacyTask = {
        taskId: "legacy-managed-root",
        workspaceId: "default",
        title: "Legacy managed root",
        goal: "Continue the managed conversation",
        taskType: "conversation" as const,
        executionMode: "background" as const,
        runMode: "hosted_autopilot" as const,
        origin: "chat" as const,
        linkedSessionId: "session-legacy",
        agentId: "managed-autopilot",
        priority: "normal" as const,
        status: "failed" as const,
        progress: 0,
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        runCount: 1,
        steps: [],
        error: {
          message: "Legacy failure",
        },
        metadata: {
          rootTask: true,
          managedExecution: true,
          managedExecutionStage: "ready",
        },
      };

      workspaceDb.run(
        `INSERT INTO desktop_tasks (
          workspace_id, task_id, title, goal, status, priority, task_type, execution_mode,
          run_mode, origin, linked_session_id, agent_id, progress, run_count, last_run_id,
          root_task_id, handler_id, handler_module_id, handler_task_key, surface, visibility,
          scope, identity_key, hidden_at, purge_after_at, deferred_compaction, created_at,
          updated_at, started_at, finished_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        legacyTask.workspaceId,
        legacyTask.taskId,
        legacyTask.title,
        legacyTask.goal,
        legacyTask.status,
        legacyTask.priority,
        legacyTask.taskType,
        legacyTask.executionMode,
        legacyTask.runMode,
        legacyTask.origin,
        legacyTask.linkedSessionId,
        legacyTask.agentId,
        legacyTask.progress,
        legacyTask.runCount,
        null,
        legacyTask.taskId,
        null,
        null,
        null,
        "internal",
        "visible",
        "workspace",
        null,
        null,
        null,
        0,
        legacyTask.createdAt,
        legacyTask.updatedAt,
        null,
        null,
        JSON.stringify(legacyTask),
      );

      const before = fixture.store.getTask("default", "legacy-managed-root");
      expect(before).toMatchObject({
        taskId: "legacy-managed-root",
      });
      expect(before?.surface).toBeUndefined();
      expect(before?.visibility).toBeUndefined();
      expect(before?.scope).toBeUndefined();

      const center = await fixture.service.listTaskCenter({
        surface: "critical",
        limit: 20,
        offset: 0,
      });

      expect(center.items.some((item) => item.taskId === "legacy-managed-root")).toBe(true);

      const after = fixture.store.getTask("default", "legacy-managed-root");
      expect(after).toMatchObject({
        taskId: "legacy-managed-root",
        surface: "critical",
        visibility: "visible",
        scope: "workspace",
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("reprojects stale internal-visible legacy roots into critical tasks", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);

    try {
      fixture.store.upsertTask({
        taskId: "stale-visible-root",
        workspaceId: "default",
        title: "Stale visible root",
        goal: "Recover the managed run",
        taskType: "conversation",
        executionMode: "background",
        runMode: "hosted_autopilot",
        origin: "chat",
        linkedSessionId: "session-stale",
        agentId: "managed-autopilot",
        priority: "normal",
        status: "failed",
        progress: 0,
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        runCount: 1,
        steps: [],
        surface: "internal",
        visibility: "visible",
        scope: "workspace",
        error: {
          message: "Needs recovery",
        },
        metadata: {
          rootTask: true,
          managedExecution: true,
          managedExecutionStage: "ready",
        },
      });

      const before = fixture.store.getTask("default", "stale-visible-root");
      expect(before).toMatchObject({
        surface: "internal",
        visibility: "visible",
        scope: "workspace",
      });

      const center = await fixture.service.listTaskCenter({
        surface: "critical",
        limit: 20,
        offset: 0,
      });

      expect(center.items.some((item) => item.taskId === "stale-visible-root")).toBe(true);

      const after = fixture.store.getTask("default", "stale-visible-root");
      expect(after).toMatchObject({
        surface: "critical",
        visibility: "visible",
        scope: "workspace",
      });
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("compacts system scheduled tasks by key into a single visible record", async () => {
    const fixture = await createFixture([{ workspaceId: "default", name: "Default Workspace" }]);
    const schedule = {
      kind: "interval" as const,
      intervalMinutes: 30,
      nextRunAt: "2026-05-19T00:30:00.000Z",
      enabled: true,
    };

    try {
      fixture.store.upsertTask({
        taskId: "legacy-feishu-refresh-1",
        workspaceId: "default",
        title: "Feishu token refresh",
        goal: "Refresh Feishu token",
        taskType: "automation",
        executionMode: "background",
        runMode: "normal",
        origin: "system",
        priority: "high",
        status: "queued",
        progress: 0,
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T00:00:00.000Z",
        runCount: 0,
        steps: [],
        schedule,
        handler: {
          handlerId: "feishu-refresh",
          moduleId: "desktop.feishu",
          taskKey: "refresh-token",
          displayName: "Feishu Refresh",
        },
      });
      fixture.store.upsertTask({
        taskId: "legacy-feishu-refresh-2",
        workspaceId: "workspace-legacy",
        title: "Feishu token refresh duplicate",
        goal: "Refresh Feishu token again",
        taskType: "automation",
        executionMode: "background",
        runMode: "normal",
        origin: "system",
        priority: "high",
        status: "success",
        progress: 100,
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
        runCount: 2,
        steps: [],
        schedule,
        handler: {
          handlerId: "feishu-refresh",
          moduleId: "desktop.feishu",
          taskKey: "refresh-token",
          displayName: "Feishu Refresh",
        },
      });

      fixture.service.register({
        handlerId: "feishu-refresh",
        moduleId: "desktop.feishu",
        displayName: "Feishu Refresh",
        listDefinitions: () => [{
          taskKey: "refresh-token",
          workspaceId: "default",
          scope: "system",
          title: "Feishu token refresh",
          goal: "Refresh the Feishu access token",
          schedule,
          priority: "high",
        }],
        execute: async () => ({
          summary: "refreshed",
        }),
      });

      await fixture.service.syncManagedTasks();

      const compactedTasks = fixture.store.listTasks().filter((item) => item.handler?.taskKey === "refresh-token");
      expect(compactedTasks).toHaveLength(1);
      expect(compactedTasks[0]).toMatchObject({
        workspaceId: "system",
        scope: "system",
        surface: "system",
        visibility: "visible",
        identityKey: "system::feishu-refresh::refresh-token",
        title: "Feishu token refresh",
        goal: "Refresh the Feishu access token",
      });

      const systemCenter = await fixture.service.listTaskCenter({
        surface: "system",
        limit: 10,
        offset: 0,
      });
      expect(systemCenter.items).toHaveLength(1);
      expect(systemCenter.items[0]).toMatchObject({
        workspaceId: "system",
        scope: "system",
        surface: "system",
        identityKey: "system::feishu-refresh::refresh-token",
      });

      const workspaces = await fixture.service.listWorkspaces();
      expect(workspaces.items.some((item) => item.workspaceId === "system")).toBe(false);
    } finally {
      fixture.database.dispose();
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });
});
