import { describe, expect, test } from "bun:test";

import { asMessageId, asMessagePartId, asRunId, asSessionId, asToolCallId, asTurnId } from "#maomiagent/kernel/core";
import type { ToolHandlerContext } from "#maomiagent/kernel/src/adapters";

import { createDesktopConversationBuiltinToolBundle } from "../implementation/services/desktop-conversation-builtin-tools";

function createRecentTerminalResultMessage(input: {
  toolName: string;
  output: Record<string, unknown>;
}) {
  return {
    message: {
      id: asMessageId("message_tool_recent_terminal"),
      sessionId: asSessionId("session_builtin_tools"),
      runId: asRunId("run_builtin_tools"),
      turnId: asTurnId("turn_builtin_tools"),
      role: "tool" as const,
      createdAt: 9,
    },
    parts: [{
      id: asMessagePartId("part_tool_recent_terminal_ref"),
      type: "tool_result_ref" as const,
      toolCallId: asToolCallId("tool_call_recent_terminal"),
      toolName: input.toolName,
    }, {
      id: asMessagePartId("part_tool_recent_terminal_text"),
      type: "text" as const,
      text: JSON.stringify(input.output),
    }],
  };
}

describe("desktop conversation builtin tools", () => {
  test("lists the builtin tool catalog and executes workspace/git query handlers", async () => {
    const managedRootTaskPatches: Array<Record<string, unknown>> = [];
    const terminalInputs: string[] = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return {
            items: [{
              workspaceId: "workspace-1",
              name: "MaomiAgent",
              directoryPath: "E:/workspace/MaomiAgent",
              isPinned: false,
              tags: [],
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }],
            meta: {
              total: 1,
              limit: 20,
              offset: 0,
              hasMore: false,
            },
          };
        },
        async get(workspaceId) {
          return workspaceId === "workspace-1"
            ? {
              workspaceId: "workspace-1",
              name: "MaomiAgent",
              directoryPath: "E:/workspace/MaomiAgent",
              isPinned: false,
              tags: [],
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }
            : null;
        },
        async getFileContent(workspaceId, path) {
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            path,
            absolutePath: `E:/workspace/MaomiAgent/${path}`,
            content: "export const value = 1;",
            binary: false,
            truncated: false,
            mimeType: "application/typescript",
          };
        },
      },
      workspaceCommand: {
        async writeTextFile(workspaceId, path, content) {
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            path,
            absolutePath: `E:/workspace/MaomiAgent/${path}`,
            content,
            binary: false,
            truncated: false,
            mimeType: "text/markdown",
          };
        },
      },
      gitQuery: {
        async getGitChanges(workspaceId) {
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            isGitRepo: true,
            clean: false,
            branch: "main",
            detached: false,
            ahead: 1,
            behind: 0,
            summary: {
              files: 1,
              added: 0,
              modified: 1,
              deleted: 0,
              renamed: 0,
              untracked: 0,
              conflict: 0,
              additions: 10,
              deletions: 2,
            },
            stagedSummary: {
              files: 0,
              added: 0,
              modified: 0,
              deleted: 0,
              renamed: 0,
              untracked: 0,
              conflict: 0,
              additions: 0,
              deletions: 0,
            },
            unstagedSummary: {
              files: 1,
              added: 0,
              modified: 1,
              deleted: 0,
              renamed: 0,
              untracked: 0,
              conflict: 0,
              additions: 10,
              deletions: 2,
            },
            items: [{
              path: "src/index.ts",
              status: "modified",
              additions: 10,
              deletions: 2,
            }],
          };
        },
        async getGitReviewDetail(workspaceId, input) {
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            isGitRepo: true,
            path: input.path,
            scope: input.scope,
            baseRef: input.baseRef,
            headRef: input.headRef,
            item: {
              path: input.path,
              status: "modified",
              additions: 10,
              deletions: 2,
              before: "before",
              after: "after",
              patch: "@@ -1 +1 @@\n-before\n+after",
            },
          };
        },
      },
      terminalQuery: {
        async getDetail(input) {
          return {
            session: {
              sessionId: input.sessionId,
              title: "Workspace shell",
              shellKind: "powershell",
              resolvedShellKind: "pwsh",
              shellDisplayName: "PowerShell 7+",
              status: "running",
              cwd: "E:/workspace/MaomiAgent",
              workspaceId: "workspace-1",
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
            output: terminalInputs.join("\n"),
            revision: terminalInputs.length,
            truncated: false,
          };
        },
      },
      terminalCommand: {
        async create(input) {
          return {
            sessionId: "term_1",
            title: input.title ?? "Workspace shell",
            shellKind: input.shellKind ?? "powershell",
            resolvedShellKind: "pwsh" as const,
            shellDisplayName: "PowerShell 7+",
            status: "running",
            cwd: input.cwd ?? "E:/workspace/MaomiAgent",
            workspaceId: input.workspaceId,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
          };
        },
        async execute(sessionId, input) {
          terminalInputs.push(`${sessionId}:${input.text}`);
          return {
            sessionId,
            title: "Workspace shell",
            shellKind: "powershell",
            resolvedShellKind: "pwsh" as const,
            shellDisplayName: "PowerShell 7+",
            status: "running",
            cwd: "E:/workspace/MaomiAgent",
            workspaceId: "workspace-1",
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
          };
        },
        async close(sessionId) {
          return {
            sessionId,
            closed: true,
          };
        },
      },
      taskBridge: {
        async patchManagedConversationRootTask(input) {
          managedRootTaskPatches.push({ ...input });
          return {
            taskId: input.rootTaskId,
            title: "Managed intake",
            goal: "Collect the managed task specification.",
            workspaceId: input.workspaceId,
            taskType: "conversation",
            executionMode: "background",
            runMode: "hosted_autopilot",
            origin: "chat",
            linkedSessionId: input.sessionId,
            agentId: "managed-autopilot",
            priority: "normal",
            status: input.status ?? "running",
            progress: input.progress ?? 50,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            runCount: 0,
            steps: [],
            metadata: {
              rootTask: true,
              rootTaskId: input.rootTaskId,
              ...(input.metadata ?? {}),
            },
          };
        },
      },
    });

    const catalog = await bundle.toolSources[0]!.listTools({
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
      run: {
        id: asRunId("run_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        status: "streaming",
        startedAt: 2,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: asMessageId("message_user_1"),
        },
      },
      visibleMessages: [],
    });

    expect(Array.isArray(catalog)).toBe(false);
    if (!("source" in catalog)) {
      throw new Error("Expected builtin tool source snapshot");
    }

    expect(catalog.source.sourceId).toBe("builtin.desktop.conversation");
    expect(catalog.tools.map((tool) => tool.name)).toEqual([
      "workspace_read_file",
      "workspace_write_file",
      "workspace_write_document",
      "git_list_changes",
      "git_review_file",
      "terminal_create_session",
      "terminal_execute",
      "terminal_read_output",
      "terminal_close_session",
      "maomi_managed_task",
    ]);
    expect(catalog.tools.find((tool) => tool.name === "terminal_create_session")?.description.length)
      .toBeGreaterThan(20);
    expect(catalog.tools.find((tool) => tool.name === "terminal_execute")?.description.length)
      .toBeGreaterThan(20);

    const workspaceReadHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_read_file");
    const workspaceWriteFileHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_write_file");
    const workspaceWriteDocumentHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_write_document");
    const gitReviewHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "git_review_file");
    const terminalCreateHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_create_session");
    const terminalExecuteHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_execute");
    const terminalReadHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_read_output");
    const terminalCloseHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_close_session");
    const managedTaskHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "maomi_managed_task");

    expect(workspaceReadHandler).toBeTruthy();
    expect(workspaceWriteFileHandler).toBeTruthy();
    expect(workspaceWriteDocumentHandler).toBeTruthy();
    expect(gitReviewHandler).toBeTruthy();
    expect(terminalCreateHandler).toBeTruthy();
    expect(terminalExecuteHandler).toBeTruthy();
    expect(terminalReadHandler).toBeTruthy();
    expect(terminalCloseHandler).toBeTruthy();
    expect(managedTaskHandler).toBeTruthy();

    const context: ToolHandlerContext = {
      descriptor: workspaceReadHandler!.descriptor,
      signal: new AbortController().signal,
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {
          workspaceId: "workspace-1",
          linkedRootTaskId: "managed-root-session_builtin_tools",
          managedExecutionStage: "intake_locked",
        },
      },
      run: {
        id: asRunId("run_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        status: "streaming",
        startedAt: 2,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: asMessageId("message_user_1"),
        },
      },
      turn: {
        id: asTurnId("turn_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        sequence: 1,
        agentId: "desktop.primary",
        executionProfile: {
          id: "desktop.openai.kimi.moonshot-v1-8k" as never,
          modelId: "moonshot-v1-8k",
        },
        status: "streaming",
        startedAt: 3,
      },
      recentMessages: [],
    };

    const workspaceReadResult = await workspaceReadHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_read"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_read_file",
        input: {
          path: "src/index.ts",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context,
    });

    expect(workspaceReadResult).toEqual(expect.objectContaining({
      path: "src/index.ts",
      binary: false,
      content: "export const value = 1;",
    }));

    const workspaceWriteFileResult = await workspaceWriteFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_write_file"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_write_file",
        input: {
          path: ".gitea/workflows/build.yml",
          content: "name: build\n",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceWriteFileHandler!.descriptor,
      },
    });

    expect(workspaceWriteFileResult).toEqual(expect.objectContaining({
      path: ".gitea/workflows/build.yml",
      content: "name: build\n",
    }));

    const workspaceWriteResult = await workspaceWriteDocumentHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_write_document"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_write_document",
        input: {
          path: "docs/release-plan.md",
          content: "# Release Plan\n",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceWriteDocumentHandler!.descriptor,
      },
    });

    expect(workspaceWriteResult).toEqual(expect.objectContaining({
      path: "docs/release-plan.md",
      content: "# Release Plan\n",
    }));

    const forbiddenWorkspaceWriteResult = await workspaceWriteDocumentHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_write_forbidden"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_write_document",
        input: {
          path: "src/index.ts",
          content: "export const hacked = true;\n",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceWriteDocumentHandler!.descriptor,
      },
    });

    expect(forbiddenWorkspaceWriteResult).toEqual(expect.objectContaining({
      kind: "failed",
      error: expect.objectContaining({
        code: "workspace_document_path_forbidden",
      }),
    }));

    const gitReviewResult = await gitReviewHandler!.execute({
      call: {
        id: asToolCallId("tool_call_git_review"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "git_review_file",
        input: {
          path: "src/index.ts",
          scope: "changed",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: gitReviewHandler!.descriptor,
      },
    });

    expect(gitReviewResult).toEqual(expect.objectContaining({
      path: "src/index.ts",
      found: true,
      item: expect.objectContaining({
        path: "src/index.ts",
        patch: "@@ -1 +1 @@\n-before\n+after",
      }),
    }));

    const terminalCreateResult = await terminalCreateHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_create"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_create_session",
        input: {
          title: "Workspace shell",
        },
        status: "executing",
        startedAt: 5,
        updatedAt: 5,
      },
      context: {
        ...context,
        descriptor: terminalCreateHandler!.descriptor,
      },
    });

    expect(terminalCreateResult).toEqual(expect.objectContaining({
      sessionId: "term_1",
      title: "Workspace shell",
      status: "running",
      resolvedShellKind: "pwsh",
      shellDisplayName: "PowerShell 7+",
    }));

    const terminalExecuteResult = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "term_1",
          command: "Get-Location",
        },
        status: "executing",
        startedAt: 6,
        updatedAt: 6,
      },
      context: {
        ...context,
        descriptor: terminalExecuteHandler!.descriptor,
      },
    });

    expect(terminalExecuteResult).toEqual(expect.objectContaining({
      ok: true,
      sessionId: "term_1",
      shellKind: "powershell",
      resolvedShellKind: "pwsh",
      shellDisplayName: "PowerShell 7+",
    }));

    const terminalReadResult = await terminalReadHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_read"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_read_output",
        input: {
          sessionId: "term_1",
        },
        status: "executing",
        startedAt: 7,
        updatedAt: 7,
      },
      context: {
        ...context,
        descriptor: terminalReadHandler!.descriptor,
      },
    });

    expect(terminalReadResult).toEqual(expect.objectContaining({
      output: "term_1:Get-Location",
      revision: 1,
    }));

    const terminalCloseResult = await terminalCloseHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_close"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_close_session",
        input: {
          sessionId: "term_1",
        },
        status: "executing",
        startedAt: 8,
        updatedAt: 8,
      },
      context: {
        ...context,
        descriptor: terminalCloseHandler!.descriptor,
      },
    });

    expect(terminalCloseResult).toEqual({
      sessionId: "term_1",
      closed: true,
    });

    const managedTaskResult = await managedTaskHandler!.execute({
      call: {
        id: asToolCallId("tool_call_managed_task"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "maomi_managed_task",
        input: {
          action: "confirm_managed_task",
          objective: "Fix the failing deployment.",
          expectedOutcome: "Deployment passes consistently.",
          acceptanceCriteria: ["CI passes", "Smoke passes"],
          verificationPlan: {
            mode: "external",
            status: "pending",
            summary: "Wait for CI to pass.",
          },
          notificationPlan: {
            channel: "chat",
            summary: "Notify the operator when deployment is green.",
          },
          wrapUpCommands: ["bun test"],
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: managedTaskHandler!.descriptor,
      },
    });

    expect(managedTaskResult).toEqual(expect.objectContaining({
      ok: true,
      action: "confirm_managed_task",
      rootTaskId: "managed-root-session_builtin_tools",
      managedExecutionStage: "ready",
      phase: "awaiting_task_confirmation",
    }));
    expect(managedRootTaskPatches).toHaveLength(1);
    expect(managedRootTaskPatches[0]).toMatchObject({
      workspaceId: "workspace-1",
      rootTaskId: "managed-root-session_builtin_tools",
      status: "running",
      progress: 60,
    });
    expect((managedRootTaskPatches[0]?.metadata as Record<string, unknown> | undefined)).toMatchObject({
      phase: "awaiting_task_confirmation",
      managedExecutionStage: "ready",
      completionContract: {
        objective: "Fix the failing deployment.",
        expectedOutcome: "Deployment passes consistently.",
        acceptanceCriteria: ["CI passes", "Smoke passes"],
      },
      verificationPlan: {
        mode: "external",
        status: "pending",
        summary: "Wait for CI to pass.",
      },
      notificationPlan: {
        channel: "chat",
        summary: "Notify the operator when deployment is green.",
      },
      wrapUpCommands: ["bun test"],
    });
  });

  test("renders cmd-specific terminal guidance when the active session resolved to cmd", async () => {
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return {
            items: [],
            meta: { total: 0, limit: 20, offset: 0, hasMore: false },
          };
        },
        async get() {
          return null;
        },
        async getFileContent() {
          throw new Error("not used");
        },
      },
      gitQuery: {
        async getGitChanges() {
          throw new Error("not used");
        },
        async getGitReviewDetail() {
          throw new Error("not used");
        },
      },
      terminalQuery: {
        async getDetail() {
          throw new Error("not used");
        },
      },
      terminalCommand: {
        async create() {
          throw new Error("not used");
        },
        async execute() {
          throw new Error("not used");
        },
        async close() {
          throw new Error("not used");
        },
      },
      taskBridge: {
        async patchManagedConversationRootTask() {
          throw new Error("not used");
        },
      },
    });

    const catalog = await bundle.toolSources[0]!.listTools({
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {},
      },
      run: {
        id: asRunId("run_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        status: "streaming",
        startedAt: 2,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: asMessageId("message_user_1"),
        },
      },
      visibleMessages: [createRecentTerminalResultMessage({
        toolName: "terminal_create_session",
        output: {
          sessionId: "term_cmd",
          title: "cmd shell",
          shellKind: "cmd",
          resolvedShellKind: "cmd",
          shellDisplayName: "cmd.exe",
          cwd: "E:/workspace/MaomiAgent",
          status: "running",
        },
      })],
    });

    if (!("source" in catalog)) {
      throw new Error("Expected builtin tool source snapshot");
    }

    const executeTool = catalog.tools.find((tool) => tool.name === "terminal_execute");
    expect(executeTool?.description).toContain("cmd.exe");
    expect(executeTool?.description).not.toContain("Get-ChildItem");
  });

  test("falls back to the session workspace when the tool input carries an invalid workspaceId", async () => {
    const requestedWorkspaceIds: string[] = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return {
            items: [{
              workspaceId: "workspace-1",
              name: "MaomiAgent",
              directoryPath: "E:/workspace/MaomiAgent",
              isPinned: false,
              tags: [],
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }],
            meta: {
              total: 1,
              limit: 20,
              offset: 0,
              hasMore: false,
            },
          };
        },
        async get(workspaceId) {
          return workspaceId === "workspace-1"
            ? {
              workspaceId: "workspace-1",
              name: "MaomiAgent",
              directoryPath: "E:/workspace/MaomiAgent",
              isPinned: false,
              tags: [],
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }
            : null;
        },
        async getFileContent(workspaceId, path) {
          requestedWorkspaceIds.push(workspaceId);
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            path,
            absolutePath: `E:/workspace/MaomiAgent/${path}`,
            content: "# README",
            binary: false,
            truncated: false,
          };
        },
      },
      gitQuery: {
        async getGitChanges() {
          throw new Error("not used");
        },
        async getGitReviewDetail() {
          throw new Error("not used");
        },
      },
      terminalQuery: {
        async getDetail() {
          throw new Error("not used");
        },
      },
      terminalCommand: {
        async create() {
          throw new Error("not used");
        },
        async execute() {
          throw new Error("not used");
        },
        async close() {
          throw new Error("not used");
        },
      },
      taskBridge: {
        async patchManagedConversationRootTask() {
          throw new Error("not used");
        },
      },
    });

    const workspaceReadHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_read_file");
    expect(workspaceReadHandler).toBeTruthy();

    const context: ToolHandlerContext = {
      descriptor: workspaceReadHandler!.descriptor,
      signal: new AbortController().signal,
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
      run: {
        id: asRunId("run_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        status: "streaming",
        startedAt: 2,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: asMessageId("message_user_1"),
        },
      },
      turn: {
        id: asTurnId("turn_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        sequence: 1,
        agentId: "desktop.primary",
        executionProfile: {
          id: "desktop.openai.test" as never,
          modelId: "test-model",
        },
        status: "streaming",
        startedAt: 3,
      },
      recentMessages: [],
    };

    await workspaceReadHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_read_default"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_read_file",
        input: {
          workspaceId: "default",
          path: "README.md",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context,
    });

    await workspaceReadHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_read_path"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_read_file",
        input: {
          workspaceId: "E:/workspace/MaomiAgent",
          path: "README.md",
        },
        status: "executing",
        startedAt: 5,
        updatedAt: 5,
      },
      context,
    });

    expect(requestedWorkspaceIds).toEqual(["workspace-1", "workspace-1"]);
  });

  test("reuses the latest recent terminal session when the provided sessionId is invalid", async () => {
    const executedSessionIds: string[] = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return {
            items: [],
            meta: {
              total: 0,
              limit: 20,
              offset: 0,
              hasMore: false,
            },
          };
        },
        async get() {
          return null;
        },
        async getFileContent() {
          throw new Error("not used");
        },
      },
      gitQuery: {
        async getGitChanges() {
          throw new Error("not used");
        },
        async getGitReviewDetail() {
          throw new Error("not used");
        },
      },
      terminalQuery: {
        async getDetail() {
          throw new Error("not used");
        },
      },
      terminalCommand: {
        async create() {
          throw new Error("not used");
        },
        async execute(sessionId) {
          executedSessionIds.push(sessionId);
          if (sessionId !== "term_1") {
            return null;
          }

          return {
            sessionId,
            title: "Workspace shell",
            shellKind: "powershell",
            status: "running",
            cwd: "E:/workspace/MaomiAgent",
            workspaceId: "workspace-1",
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
          };
        },
        async close() {
          throw new Error("not used");
        },
      },
      taskBridge: {
        async patchManagedConversationRootTask() {
          throw new Error("not used");
        },
      },
    });

    const terminalExecuteHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_execute");
    expect(terminalExecuteHandler).toBeTruthy();

    const context: ToolHandlerContext = {
      descriptor: terminalExecuteHandler!.descriptor,
      signal: new AbortController().signal,
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
      run: {
        id: asRunId("run_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        status: "streaming",
        startedAt: 2,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: asMessageId("message_user_1"),
        },
      },
      turn: {
        id: asTurnId("turn_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        sequence: 1,
        agentId: "desktop.primary",
        executionProfile: {
          id: "desktop.openai.test" as never,
          modelId: "test-model",
        },
        status: "streaming",
        startedAt: 3,
      },
      recentMessages: [createRecentTerminalResultMessage({
        toolName: "terminal_create_session",
        output: {
          sessionId: "term_1",
          title: "Workspace shell",
          shellKind: "powershell",
          cwd: "E:/workspace/MaomiAgent",
          status: "running",
        },
      })],
    };

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_invalid_session"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "install deps",
          command: "npm install",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context,
    });

    expect(executedSessionIds).toEqual(["install deps", "term_1"]);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      sessionId: "term_1",
    }));
  });

  test("auto-creates a terminal session when terminal_execute receives an unknown session label", async () => {
    const executedSessionIds: string[] = [];
    const createdSessions: Array<Record<string, unknown>> = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return {
            items: [{
              workspaceId: "workspace-1",
              name: "MaomiAgent",
              directoryPath: "E:/workspace/MaomiAgent",
              isPinned: false,
              tags: [],
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }],
            meta: {
              total: 1,
              limit: 20,
              offset: 0,
              hasMore: false,
            },
          };
        },
        async get(workspaceId) {
          return workspaceId === "workspace-1"
            ? {
              workspaceId: "workspace-1",
              name: "MaomiAgent",
              directoryPath: "E:/workspace/MaomiAgent",
              isPinned: false,
              tags: [],
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }
            : null;
        },
        async getFileContent() {
          throw new Error("not used");
        },
      },
      gitQuery: {
        async getGitChanges() {
          throw new Error("not used");
        },
        async getGitReviewDetail() {
          throw new Error("not used");
        },
      },
      terminalQuery: {
        async getDetail() {
          throw new Error("not used");
        },
      },
      terminalCommand: {
        async create(input) {
          createdSessions.push({ ...input });
          return {
            sessionId: "term_auto",
            title: input.title ?? "Workspace shell",
            shellKind: input.shellKind ?? "powershell",
            status: "running",
            cwd: input.cwd ?? "E:/workspace/MaomiAgent",
            workspaceId: input.workspaceId,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
          };
        },
        async execute(sessionId) {
          executedSessionIds.push(sessionId);
          if (sessionId !== "term_auto") {
            return null;
          }

          return {
            sessionId,
            title: "blog-setup",
            shellKind: "powershell",
            status: "running",
            cwd: "E:/workspace/MaomiAgent",
            workspaceId: "workspace-1",
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
          };
        },
        async close() {
          throw new Error("not used");
        },
      },
      taskBridge: {
        async patchManagedConversationRootTask() {
          throw new Error("not used");
        },
      },
    });

    const terminalExecuteHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_execute");
    expect(terminalExecuteHandler).toBeTruthy();

    const context: ToolHandlerContext = {
      descriptor: terminalExecuteHandler!.descriptor,
      signal: new AbortController().signal,
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {
          workspaceId: "workspace-1",
        },
      },
      run: {
        id: asRunId("run_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        status: "streaming",
        startedAt: 2,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: asMessageId("message_user_1"),
        },
      },
      turn: {
        id: asTurnId("turn_builtin_tools"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        sequence: 1,
        agentId: "desktop.primary",
        executionProfile: {
          id: "desktop.openai.test" as never,
          modelId: "test-model",
        },
        status: "streaming",
        startedAt: 3,
      },
      recentMessages: [],
    };

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_autocreate"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "blog-setup",
          command: "pwd",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context,
    });

    expect(executedSessionIds).toEqual(["blog-setup", "term_auto"]);
    expect(createdSessions).toEqual([{
      workspaceId: "workspace-1",
      title: "blog-setup",
    }]);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      sessionId: "term_auto",
    }));
  });
});
