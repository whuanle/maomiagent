import { describe, expect, test } from "bun:test";

import { asMessageId, asMessagePartId, asRunId, asSessionId, asToolCallId, asTurnId } from "#maomiagent/kernel/core";
import { validateToolInputSchema, type ToolHandlerContext } from "#maomiagent/kernel/src/adapters";

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
    const fileContents = new Map<string, string>([
      ["src/index.ts", "export const value = 1;"],
    ]);
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
            content: fileContents.get(path) ?? "",
            binary: false,
            truncated: false,
            mimeType: path.endsWith(".ts") ? "application/typescript" : "text/markdown",
          };
        },
        async getFileTree(workspaceId, path) {
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            path: path ?? "",
            nodes: [{
              name: "src",
              path: "src",
              type: "directory" as const,
            }, {
              name: "package.json",
              path: "package.json",
              type: "file" as const,
              extension: ".json",
            }],
          };
        },
        async readTextFile(workspaceId, path) {
          return {
            workspaceId,
            rootPath: "E:/workspace/MaomiAgent",
            path,
            absolutePath: `E:/workspace/MaomiAgent/${path}`,
            content: fileContents.get(path) ?? "",
            binary: false,
            truncated: false,
            mimeType: path.endsWith(".ts") ? "application/typescript" : "text/markdown",
          };
        },
      },
      workspaceCommand: {
        async writeTextFile(workspaceId, path, content) {
          fileContents.set(path, content);
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
      "workspace_list_directory",
      "workspace_read_file",
      "workspace_write_file",
      "workspace_edit_file",
      "workspace_apply_patch",
      "workspace_write_document",
      "git_list_changes",
      "git_review_file",
      "terminal_execute",
    ]);
    expect(catalog.tools.find((tool) => tool.name === "terminal_execute")?.description.length)
      .toBeGreaterThan(20);

    const managedCatalog = await bundle.toolSources[0]!.listTools({
      session: {
        id: asSessionId("session_builtin_tools"),
        title: "Builtin tools",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        metadata: {
          workspaceId: "workspace-1",
          linkedRootTaskId: "managed-root-session_builtin_tools",
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

    if (!Array.isArray(managedCatalog) && "source" in managedCatalog) {
      expect(managedCatalog.tools.map((tool) => tool.name)).toContain("maomi_managed_task");
    } else {
      throw new Error("Expected managed builtin tool source snapshot");
    }

    const workspaceListDirectoryHandler = bundle.toolHandlers.find((handler) =>
      handler.descriptor.name === "workspace_list_directory");
    const workspaceReadHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_read_file");
    const workspaceWriteFileHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_write_file");
    const workspaceEditFileHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_edit_file");
    const workspaceApplyPatchHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_apply_patch");
    const workspaceWriteDocumentHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "workspace_write_document");
    const gitReviewHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "git_review_file");
    const terminalCreateHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_create_session");
    const terminalExecuteHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_execute");
    const terminalReadHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_read_output");
    const terminalCloseHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "terminal_close_session");
    const managedTaskHandler = bundle.toolHandlers.find((handler) => handler.descriptor.name === "maomi_managed_task");

    expect(workspaceListDirectoryHandler).toBeTruthy();
    expect(workspaceReadHandler).toBeTruthy();
    expect(workspaceWriteFileHandler).toBeTruthy();
    expect(workspaceEditFileHandler).toBeTruthy();
    expect(workspaceApplyPatchHandler).toBeTruthy();
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

    const workspaceListResult = await workspaceListDirectoryHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_list_directory"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_list_directory",
        input: {},
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceListDirectoryHandler!.descriptor,
      },
    });

    expect(workspaceListResult).toEqual(expect.objectContaining({
      workspaceId: "workspace-1",
      path: "",
      totalEntries: 2,
      directoryCount: 1,
      fileCount: 1,
    }));

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
      numberedContent: "1: export const value = 1;",
    }));

    fileContents.set("docs/long.md", ["line 1", "line 2", "line 3", "line 4"].join("\n"));
    const workspaceReadWindowResult = await workspaceReadHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_read_window"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_read_file",
        input: {
          path: "docs/long.md",
          offset: 2,
          limit: 2,
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context,
    });

    expect(workspaceReadWindowResult).toEqual(expect.objectContaining({
      path: "docs/long.md",
      content: "line 2\nline 3",
      numberedContent: "2: line 2\n3: line 3",
      lineOffset: 2,
      lineLimit: 2,
      totalLines: 4,
      nextOffset: 4,
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

    const aliasWriteInput = {
      filePath: "docs/alias.md",
      text: "alias body\n",
    };
    expect(validateToolInputSchema({
      toolName: "workspace_write_file",
      schema: workspaceWriteFileHandler!.descriptor.inputSchema,
      value: aliasWriteInput,
    })).toEqual({ ok: true });

    const workspaceWriteFileAliasResult = await workspaceWriteFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_write_file_alias"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_write_file",
        input: aliasWriteInput,
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceWriteFileHandler!.descriptor,
      },
    });

    expect(workspaceWriteFileAliasResult).toEqual(expect.objectContaining({
      path: "docs/alias.md",
      content: "alias body\n",
    }));

    const feishuDraftWriteResult = await workspaceWriteFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_write_feishu_draft"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_write_file",
        input: {
          path: ".maomi/feishu-docs/drafts/demo.draft.md",
          content: "##第一部分\n-条目一\n1.条目二\n>引用\n```md\n##保持原样\n-保持原样\n```",
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

    expect(feishuDraftWriteResult).toEqual(expect.objectContaining({
      path: ".maomi/feishu-docs/drafts/demo.draft.md",
      content: "## 第一部分\n- 条目一\n1. 条目二\n> 引用\n```md\n##保持原样\n-保持原样\n```",
    }));

    const normalizedHeadingWriteResult = await workspaceWriteFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_write_feishu_heading_safe"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_write_file",
        input: {
          path: ".maomi/feishu-docs/drafts/heading-safe.draft.md",
          content: "## 第一部分\n- 条目一",
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

    expect(normalizedHeadingWriteResult).toEqual(expect.objectContaining({
      path: ".maomi/feishu-docs/drafts/heading-safe.draft.md",
      content: "## 第一部分\n- 条目一",
    }));

    const workspaceEditResult = await workspaceEditFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_edit_file"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_edit_file",
        input: {
          path: ".maomi/feishu-docs/drafts/demo.draft.md",
          oldText: "## 第一部分\n- 条目一",
          newText: "## 第一部分\n- 条目一\n- 条目三",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceEditFileHandler!.descriptor,
      },
    });

    expect(workspaceEditResult).toEqual(expect.objectContaining({
      path: ".maomi/feishu-docs/drafts/demo.draft.md",
      replacementsApplied: 1,
      content: "## 第一部分\n- 条目一\n- 条目三\n1. 条目二\n> 引用\n```md\n##保持原样\n-保持原样\n```",
    }));

    fileContents.set("src/drift.ts", "if (ready) {\n    run();\n}\n");
    const workspaceEditIndentResult = await workspaceEditFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_edit_file_indent"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_edit_file",
        input: {
          path: "src/drift.ts",
          oldText: "if (ready) {\n  run();\n}",
          newText: "if (ready) {\n  runFast();\n}",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceEditFileHandler!.descriptor,
      },
    });

    expect(workspaceEditIndentResult).toEqual(expect.objectContaining({
      path: "src/drift.ts",
      replacementsApplied: 1,
      content: "if (ready) {\n  runFast();\n}\n",
    }));

    fileContents.set("docs/missing.md", "alpha\nbeta\n");
    const workspaceEditMissingResult = await workspaceEditFileHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_edit_file_missing"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_edit_file",
        input: {
          path: "docs/missing.md",
          oldText: "missing",
          newText: "replacement",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceEditFileHandler!.descriptor,
      },
    });

    expect(workspaceEditMissingResult).toEqual(expect.objectContaining({
      kind: "failed",
      error: expect.objectContaining({
        code: "workspace_edit_match_not_found",
        metadata: expect.objectContaining({
          path: "docs/missing.md",
          recommendedRecovery: "reread_then_apply_patch",
          attemptedStrategies: expect.arrayContaining(["exact", "context_aware"]),
        }),
      }),
    }));

    const workspaceApplyPatchResult = await workspaceApplyPatchHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_apply_patch"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_apply_patch",
        input: {
          patchText: [
            "*** Begin Patch",
            "*** Update File: .maomi/feishu-docs/drafts/demo.draft.md",
            "@@",
            " ## 第一部分",
            " - 条目一",
            " - 条目三",
            " 1. 条目二",
            "+2. 条目四",
            " > 引用",
            "*** End Patch",
          ].join("\n"),
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceApplyPatchHandler!.descriptor,
      },
    });

    expect(workspaceApplyPatchResult).toEqual(expect.objectContaining({
      workspaceId: "workspace-1",
      patch: expect.stringContaining("*** Update File: .maomi/feishu-docs/drafts/demo.draft.md"),
      content: "## 第一部分\n- 条目一\n- 条目三\n1. 条目二\n2. 条目四\n> 引用\n```md\n##保持原样\n-保持原样\n```\n",
    }));

    fileContents.set("docs/drift.md", ["alpha", "beta   ", "gamma"].join("\n"));
    const workspaceApplyPatchTrimEndResult = await workspaceApplyPatchHandler!.execute({
      call: {
        id: asToolCallId("tool_call_workspace_apply_patch_trim_end"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_apply_patch",
        input: {
          path: "docs/drift.md",
          patchText: [
            "*** Begin Patch",
            "*** Update File: docs/drift.md",
            "@@",
            " alpha",
            "-beta",
            "+BETA",
            " gamma",
            "*** End Patch",
          ].join("\n"),
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        ...context,
        descriptor: workspaceApplyPatchHandler!.descriptor,
      },
    });

    expect(workspaceApplyPatchTrimEndResult).toEqual(expect.objectContaining({
      workspaceId: "workspace-1",
      patch: expect.stringContaining("*** Update File: docs/drift.md"),
      content: "alpha\nBETA\ngamma\n",
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
      command: "Get-Location",
      shellKind: "powershell",
      resolvedShellKind: "pwsh",
      shellDisplayName: "PowerShell 7+",
      stdout: "term_1:Get-Location",
      output: "term_1:Get-Location",
      revision: 1,
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
          return null;
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
    expect(executeTool?.description).toContain("double quotes");
    expect(executeTool?.description).toContain("`call` before `.cmd` or `.bat`");
    expect(executeTool?.description).toContain("returned output");
    expect(executeTool?.description).not.toContain("Get-ChildItem");
  });

  test("blocks PowerShell commands when the active session resolved to cmd", async () => {
    const executedCommands: string[] = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return { items: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } };
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
          return null;
        },
      },
      terminalCommand: {
        async create() {
          throw new Error("not used");
        },
        async execute(sessionId, input) {
          executedCommands.push(`${sessionId}:${input.text}`);
          return {
            sessionId,
            title: "cmd shell",
            shellKind: "cmd" as const,
            resolvedShellKind: "cmd" as const,
            shellDisplayName: "cmd.exe",
            status: "running" as const,
            cwd: "E:/workspace/MaomiAgent",
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

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_cmd_mismatch"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "term_cmd",
          command: "Get-ChildItem -Force",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        descriptor: terminalExecuteHandler!.descriptor,
        signal: new AbortController().signal,
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
            sessionId: "term_cmd",
            title: "cmd shell",
            shellKind: "cmd",
            resolvedShellKind: "cmd",
            shellDisplayName: "cmd.exe",
            cwd: "E:/workspace/MaomiAgent",
            status: "running",
          },
        })],
      },
    });

    expect(executedCommands).toEqual([]);
    expect(result).toEqual(expect.objectContaining({
      kind: "failed",
      error: expect.objectContaining({
        code: "terminal_shell_command_mismatch",
      }),
    }));
  });

  test("blocks cmd batch syntax when the active session resolved to Windows PowerShell", async () => {
    const executedCommands: string[] = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return { items: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } };
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
          return null;
        },
      },
      terminalCommand: {
        async create() {
          throw new Error("not used");
        },
        async execute(sessionId, input) {
          executedCommands.push(`${sessionId}:${input.text}`);
          return {
            sessionId,
            title: "Windows PowerShell shell",
            shellKind: "powershell" as const,
            resolvedShellKind: "powershell" as const,
            shellDisplayName: "Windows PowerShell",
            status: "running" as const,
            cwd: "E:/workspace/MaomiAgent",
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

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_powershell_mismatch"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "term_ps",
          command: "if exist package.json type package.json",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        descriptor: terminalExecuteHandler!.descriptor,
        signal: new AbortController().signal,
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
            sessionId: "term_ps",
            title: "Windows PowerShell shell",
            shellKind: "powershell",
            resolvedShellKind: "powershell",
            shellDisplayName: "Windows PowerShell",
            cwd: "E:/workspace/MaomiAgent",
            status: "running",
          },
        })],
      },
    });

    expect(executedCommands).toEqual([]);
    expect(result).toEqual(expect.objectContaining({
      kind: "failed",
      error: expect.objectContaining({
        code: "terminal_shell_command_mismatch",
      }),
    }));
  });

  test("loads shell metadata from terminal detail when recent messages do not include the session", async () => {
    const executedCommands: string[] = [];
    const bundle = createDesktopConversationBuiltinToolBundle({
      workspaceQuery: {
        async list() {
          return { items: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } };
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
        async getDetail(input) {
          if (input.sessionId !== "term_cmd_detail") {
            return null;
          }

          return {
            session: {
              sessionId: input.sessionId,
              title: "cmd shell",
              shellKind: "cmd",
              resolvedShellKind: "cmd",
              shellDisplayName: "cmd.exe",
              status: "running",
              cwd: "E:/workspace/MaomiAgent",
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
            output: "",
            revision: 1,
            truncated: false,
          };
        },
      },
      terminalCommand: {
        async create() {
          throw new Error("not used");
        },
        async execute(sessionId, input) {
          executedCommands.push(`${sessionId}:${input.text}`);
          return {
            sessionId,
            title: "cmd shell",
            shellKind: "cmd" as const,
            resolvedShellKind: "cmd" as const,
            shellDisplayName: "cmd.exe",
            status: "running" as const,
            cwd: "E:/workspace/MaomiAgent",
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

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_cmd_detail_mismatch"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "term_cmd_detail",
          command: "Get-ChildItem -Force",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
        descriptor: terminalExecuteHandler!.descriptor,
        signal: new AbortController().signal,
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
      },
    });

    expect(executedCommands).toEqual([]);
    expect(result).toEqual(expect.objectContaining({
      kind: "failed",
      error: expect.objectContaining({
        code: "terminal_shell_command_mismatch",
      }),
    }));
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
          return null;
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
          return null;
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
          return null;
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

  test("auto-creates a terminal session when terminal_execute is called without a sessionId", async () => {
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
        async getDetail(input) {
          if (input.sessionId !== "term_auto_implicit") {
            return null;
          }

          return {
            session: {
              sessionId: input.sessionId,
              title: "Workspace shell",
              shellKind: "powershell",
              status: "running",
              cwd: "E:/workspace/MaomiAgent",
              workspaceId: "workspace-1",
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
            output: "term_auto_implicit:pwd",
            revision: 1,
            truncated: false,
          };
        },
      },
      terminalCommand: {
        async create(input) {
          createdSessions.push({ ...input });
          return {
            sessionId: "term_auto_implicit",
            title: "Workspace shell",
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
          return sessionId === "term_auto_implicit"
            ? {
              sessionId,
              title: "Workspace shell",
              shellKind: "powershell",
              status: "running",
              cwd: "E:/workspace/MaomiAgent",
              workspaceId: "workspace-1",
              createdAt: "2026-05-04T00:00:00.000Z",
              updatedAt: "2026-05-04T00:00:00.000Z",
            }
            : null;
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

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_no_session"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          command: "pwd",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
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
      },
    });

    expect(createdSessions).toEqual([{
      workspaceId: "workspace-1",
    }]);
    expect(executedSessionIds).toEqual(["term_auto_implicit"]);
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      sessionId: "term_auto_implicit",
      command: "pwd",
      stdout: "term_auto_implicit:pwd",
      output: "term_auto_implicit:pwd",
      revision: 1,
    }));
  });

  test("validates commands against the resolved shell of an auto-created session before execution", async () => {
    const executedSessionIds: string[] = [];
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
          return null;
        },
      },
      terminalCommand: {
        async create(input) {
          return {
            sessionId: "term_auto_cmd",
            title: input.title ?? "Workspace shell",
            shellKind: "cmd" as const,
            resolvedShellKind: "cmd" as const,
            shellDisplayName: "cmd.exe",
            status: "running" as const,
            cwd: input.cwd ?? "E:/workspace/MaomiAgent",
            workspaceId: input.workspaceId,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
          };
        },
        async execute(sessionId) {
          executedSessionIds.push(sessionId);
          return null;
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

    const result = await terminalExecuteHandler!.execute({
      call: {
        id: asToolCallId("tool_call_terminal_execute_autocreate_mismatch"),
        sessionId: asSessionId("session_builtin_tools"),
        runId: asRunId("run_builtin_tools"),
        turnId: asTurnId("turn_builtin_tools"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "terminal_execute",
        input: {
          sessionId: "blog-setup",
          command: "Get-ChildItem -Force",
        },
        status: "executing",
        startedAt: 4,
        updatedAt: 4,
      },
      context: {
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
      },
    });

    expect(executedSessionIds).toEqual(["blog-setup"]);
    expect(result).toEqual(expect.objectContaining({
      kind: "failed",
      error: expect.objectContaining({
        code: "terminal_shell_command_mismatch",
      }),
    }));
  });
});
