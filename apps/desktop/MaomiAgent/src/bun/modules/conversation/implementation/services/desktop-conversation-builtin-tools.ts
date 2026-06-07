import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { MessageRecordWithParts, ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopGitQueryPort, DesktopGitReviewScope } from "../../../git";
import type {
  DesktopResolvedShellKind,
  DesktopTerminalShellKind,
  DesktopTerminalsCommandPort,
  DesktopTerminalsQueryPort,
} from "../../../terminals";
import { DesktopShellProfileService } from "../../../terminals";
import type { DesktopConversationTaskBridgePort } from "../../../tasks";
import type {
  DesktopWorkspaceCommandPort,
  DesktopWorkspaceItem,
  DesktopWorkspaceQueryPort,
} from "../../../workspace";
import {
  normalizeDesktopTerminalPromptShell,
  renderDesktopTerminalCreateSessionDescription,
  renderDesktopTerminalExecuteDescription,
  validateDesktopTerminalCommandForShell,
} from "./desktop-terminal-shell-prompt";

type DesktopConversationBuiltinToolBundleOptions = {
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get" | "getFileContent">;
  workspaceCommand?: Pick<DesktopWorkspaceCommandPort, "writeTextFile">;
  gitQuery: Pick<DesktopGitQueryPort, "getGitChanges" | "getGitReviewDetail">;
  terminalQuery: Pick<DesktopTerminalsQueryPort, "getDetail">;
  terminalCommand: Pick<DesktopTerminalsCommandPort, "create" | "execute" | "close">;
  taskBridge: Pick<DesktopConversationTaskBridgePort, "patchManagedConversationRootTask">;
};

export type DesktopConversationBuiltinToolBundle = {
  toolSources: ToolSource[];
  toolHandlers: RegisteredToolHandler[];
};

const BUILTIN_TOOL_SOURCE = {
  sourceId: "builtin.desktop.conversation",
  signature: "desktop-conversation-builtin-v4",
  metadata: {
    toolSourceKind: "builtin",
  },
} as const;

const TOOL_RESULT_ITEM_LIMIT = 200;
const TOOL_TEXT_OUTPUT_MAX_CHARS = 64_000;

const WORKSPACE_READ_FILE_DESCRIPTOR: ToolDescriptor = {
  name: "workspace_read_file",
  description: "Read a text file from the current workspace. Binary files return metadata only.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      path: { type: "string" },
    },
    required: ["path"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "file_read",
    operationLabel: "Read workspace file",
    planModeAccess: "read",
  },
};

const WORKSPACE_WRITE_FILE_DESCRIPTOR: ToolDescriptor = {
  name: "workspace_write_file",
  description: "Write or update any text file in the current workspace.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "file_write",
    operationLabel: "Write workspace file",
  },
};

const WORKSPACE_WRITE_DOCUMENT_DESCRIPTOR: ToolDescriptor = {
  name: "workspace_write_document",
  description: "Write or update a documentation file under docs/ or a root README*.md file in the current workspace.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "file_write",
    operationLabel: "Write workspace document",
    planModeAccess: "document_write",
    planModeOnly: true,
  },
};

const GIT_LIST_CHANGES_DESCRIPTOR: ToolDescriptor = {
  name: "git_list_changes",
  description: "Inspect the current git branch and changed files for the active workspace.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
    },
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "workspace_access",
    operationLabel: "Inspect git changes",
    planModeAccess: "read",
  },
};

const GIT_REVIEW_FILE_DESCRIPTOR: ToolDescriptor = {
  name: "git_review_file",
  description: "Read the git diff for one changed file in the active workspace.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      path: { type: "string" },
      scope: {
        type: "string",
        enum: ["changed", "staged"],
      },
      baseRef: { type: "string" },
      headRef: { type: "string" },
    },
    required: ["path"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "file_read",
    operationLabel: "Review git file diff",
    planModeAccess: "read",
  },
};

const MANAGED_TASK_DESCRIPTOR: ToolDescriptor = {
  name: "maomi_managed_task",
  description: "Update the current managed root task specification or lifecycle state for the active managed conversation.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "confirm_managed_task",
          "update_completion_contract",
          "update_verification_plan",
          "update_notification_plan",
          "update_wrap_up_commands",
          "complete_managed_task",
        ],
      },
      objective: { type: "string" },
      expectedOutcome: { type: "string" },
      verificationPath: { type: "string" },
      summary: { type: "string" },
      progress: { type: "number" },
      acceptanceCriteria: {
        type: "array",
        items: { type: "string" },
      },
      wrapUpCommands: {
        type: "array",
        items: { type: "string" },
      },
      verificationPlan: {
        type: "object",
        additionalProperties: true,
      },
      notificationPlan: {
        type: "object",
        additionalProperties: true,
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "tool_execution",
    operationLabel: "Update managed task",
    planModeAccess: "task_write",
  },
};

const TERMINAL_CREATE_SESSION_DESCRIPTOR: ToolDescriptor = {
  name: "terminal_create_session",
  description: "Create a terminal session that can be reused for command execution and output inspection.",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      cwd: { type: "string" },
      title: { type: "string" },
      shellKind: {
        type: "string",
        enum: ["powershell", "cmd", "bash", "sh"],
      },
    },
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "tool_execution",
    operationLabel: "Create terminal session",
    planModeAccess: "readonly_command",
  },
};

const TERMINAL_EXECUTE_DESCRIPTOR: ToolDescriptor = {
  name: "terminal_execute",
  description: "Execute one command in an existing terminal session. Always put the literal command text in `command`.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string" },
      command: { type: "string" },
    },
    required: ["sessionId", "command"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "tool_execution",
    operationLabel: "Execute terminal command",
    planModeAccess: "readonly_command",
  },
};

const TERMINAL_READ_OUTPUT_DESCRIPTOR: ToolDescriptor = {
  name: "terminal_read_output",
  description: "Read the most recent output from a terminal session.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string" },
      limit: { type: "number" },
    },
    required: ["sessionId"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "file_read",
    operationLabel: "Read terminal output",
    planModeAccess: "read",
  },
};

const TERMINAL_CLOSE_SESSION_DESCRIPTOR: ToolDescriptor = {
  name: "terminal_close_session",
  description: "Close an existing terminal session.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: { type: "string" },
    },
    required: ["sessionId"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "builtin",
    operationKind: "tool_execution",
    operationLabel: "Close terminal session",
    planModeAccess: "readonly_command",
  },
};

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= TOOL_TEXT_OUTPUT_MAX_CHARS) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: `${text.slice(0, TOOL_TEXT_OUTPUT_MAX_CHARS - 3)}...`,
    truncated: true,
  };
}

function normalizeWorkspaceLookupValue(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
}

function readWorkspacePathLeaf(value: string): string | undefined {
  const normalized = normalizeWorkspaceLookupValue(value);
  if (!normalized) {
    return undefined;
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1);
}

function matchWorkspaceAlias(
  item: Pick<DesktopWorkspaceItem, "workspaceId" | "name" | "directoryPath">,
  candidate: string,
): boolean {
  const normalizedCandidate = normalizeWorkspaceLookupValue(candidate);
  if (!normalizedCandidate) {
    return false;
  }

  const directMatches = [
    item.workspaceId,
    item.name,
    item.directoryPath,
  ]
    .map((value) => normalizeWorkspaceLookupValue(value))
    .filter(Boolean);

  if (directMatches.includes(normalizedCandidate)) {
    return true;
  }

  const leaf = readWorkspacePathLeaf(item.directoryPath);
  return leaf === normalizedCandidate;
}

async function tryGetWorkspace(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "get">,
  workspaceId: string | undefined,
): Promise<DesktopWorkspaceItem | null> {
  if (!workspaceId) {
    return null;
  }

  try {
    return await workspaceQuery.get(workspaceId);
  } catch {
    return null;
  }
}

async function tryFindWorkspaceByAlias(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list">,
  candidate: string | undefined,
): Promise<DesktopWorkspaceItem | null> {
  if (!candidate) {
    return null;
  }

  try {
    const list = await workspaceQuery.list();
    const match = list.items.find((item) => matchWorkspaceAlias(item, candidate));
    return match ?? null;
  } catch {
    return null;
  }
}

function readSessionWorkspaceId(sessionMetadata: unknown): string | undefined {
  return isRecord(sessionMetadata)
    ? normalizeOptionalText(sessionMetadata.workspaceId)
    : undefined;
}

function normalizeUnresolvedWorkspaceId(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value);
  if (!normalized || normalized.toLowerCase() === "default") {
    return undefined;
  }

  return normalized;
}

async function resolveWorkspaceId(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  input: Record<string, unknown>,
  sessionMetadata: unknown,
): Promise<string | undefined> {
  const explicitWorkspaceId = normalizeOptionalText(input.workspaceId);
  const sessionWorkspaceId = readSessionWorkspaceId(sessionMetadata);

  const explicitWorkspace = await tryGetWorkspace(workspaceQuery, explicitWorkspaceId)
    ?? await tryFindWorkspaceByAlias(workspaceQuery, explicitWorkspaceId);
  if (explicitWorkspace) {
    return explicitWorkspace.workspaceId;
  }

  const sessionWorkspace = await tryGetWorkspace(workspaceQuery, sessionWorkspaceId)
    ?? await tryFindWorkspaceByAlias(workspaceQuery, sessionWorkspaceId);
  if (sessionWorkspace) {
    return sessionWorkspace.workspaceId;
  }

  return normalizeUnresolvedWorkspaceId(explicitWorkspaceId)
    ?? normalizeUnresolvedWorkspaceId(sessionWorkspaceId);
}

function asToolFailure(code: string, message: string, metadata?: Record<string, unknown>) {
  return {
    kind: "failed" as const,
    error: {
      code,
      message,
      retryable: false,
      ...(metadata ? { metadata } : {}),
    },
  };
}

function normalizeReviewScope(value: unknown): DesktopGitReviewScope | undefined {
  return value === "changed" || value === "staged"
    ? value
    : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item));

  return items.length > 0 ? items : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function normalizeTerminalShellKind(value: unknown): DesktopTerminalShellKind | undefined {
  return value === "powershell" || value === "cmd" || value === "bash" || value === "sh"
    ? value
    : undefined;
}

function normalizeResolvedTerminalShellKind(value: unknown): DesktopResolvedShellKind | undefined {
  return value === "pwsh" || value === "powershell" || value === "cmd" || value === "bash" || value === "sh"
    ? value
    : undefined;
}

function readRootTaskId(metadata: unknown): string | undefined {
  return isRecord(metadata)
    ? normalizeOptionalText(metadata.linkedRootTaskId) ?? normalizeOptionalText(metadata.rootTaskId)
    : undefined;
}

function buildCompletionContract(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const objective = normalizeOptionalText(input.objective);
  const expectedOutcome = normalizeOptionalText(input.expectedOutcome);
  const verificationPath = normalizeOptionalText(input.verificationPath);
  const summary = normalizeOptionalText(input.summary);
  const acceptanceCriteria = normalizeStringArray(input.acceptanceCriteria);

  if (!objective && !expectedOutcome && !verificationPath && !summary && !acceptanceCriteria) {
    return undefined;
  }

  return {
    ...(objective ? { objective } : {}),
    ...(expectedOutcome ? { expectedOutcome } : {}),
    ...(verificationPath ? { verificationPath } : {}),
    ...(summary ? { summary } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
  };
}

function createStaticToolSource(descriptors: ToolDescriptor[]): ToolSource {
  const shellProfiles = new DesktopShellProfileService();

  return {
    async listTools(input) {
      const preferredShell = (() => {
        try {
          const profile = shellProfiles.resolvePreferredShell();
          return normalizeDesktopTerminalPromptShell({
            resolvedShellKind: profile.resolvedKind,
            shellDisplayName: profile.displayName,
          });
        } catch {
          return normalizeDesktopTerminalPromptShell({ shellKind: "sh" });
        }
      })();
      const activeShell = resolveRecentTerminalPromptShell(input.visibleMessages ?? []) ?? preferredShell;

      return {
        source: BUILTIN_TOOL_SOURCE,
        tools: descriptors.map((descriptor) => {
          if (descriptor.name === "terminal_create_session") {
            return {
              ...descriptor,
              description: renderDesktopTerminalCreateSessionDescription(preferredShell),
            };
          }

          if (descriptor.name === "terminal_execute") {
            return {
              ...descriptor,
              description: renderDesktopTerminalExecuteDescription(activeShell),
            };
          }

          return descriptor;
        }),
      };
    },
  };
}

function createWorkspaceReadFileHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get" | "getFileContent">,
): RegisteredToolHandler {
  return {
    descriptor: WORKSPACE_READ_FILE_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
      const path = normalizeOptionalText(input.path);

      if (!workspaceId) {
        return asToolFailure("workspace_id_required", "workspaceId is required for workspace_read_file.");
      }

      if (!path) {
        return asToolFailure("workspace_path_required", "path is required for workspace_read_file.");
      }

      try {
        const file = await workspaceQuery.getFileContent(workspaceId, path);
        if (file.binary) {
          return {
            workspaceId: file.workspaceId,
            rootPath: file.rootPath,
            path: file.path,
            absolutePath: file.absolutePath,
            binary: true,
            truncated: false,
            ...(file.mimeType ? { mimeType: file.mimeType } : {}),
            previewAvailable: Boolean(file.previewBase64),
            note: "Binary file content omitted from tool output.",
          };
        }

        const content = truncateText(file.content);

        return {
          workspaceId: file.workspaceId,
          rootPath: file.rootPath,
          path: file.path,
          absolutePath: file.absolutePath,
          binary: false,
          truncated: file.truncated || content.truncated,
          ...(file.mimeType ? { mimeType: file.mimeType } : {}),
          content: content.text,
        };
      } catch (error) {
        return asToolFailure(
          "workspace_read_failed",
          error instanceof Error ? error.message : "Failed to read workspace file.",
          { workspaceId, path },
        );
      }
    },
  };
}

const DOCUMENT_WRITE_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const ROOT_README_RE = /^README(?:[._-][^/\\]+)?\.md$/i;

function normalizeWorkspaceWritablePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isValidWorkspaceWritablePath(path: string): boolean {
  const normalized = normalizeWorkspaceWritablePath(path);
  return Boolean(normalized) && !normalized.endsWith("/");
}

function isAllowedWorkspaceDocumentPath(path: string): boolean {
  const normalized = normalizeWorkspaceWritablePath(path);
  if (!normalized || normalized.endsWith("/")) {
    return false;
  }

  if (!normalized.includes("/")) {
    return ROOT_README_RE.test(normalized);
  }

  if (!normalized.toLowerCase().startsWith("docs/")) {
    return false;
  }

  const extension = normalized.includes(".")
    ? normalized.slice(normalized.lastIndexOf(".")).toLowerCase()
    : "";
  return DOCUMENT_WRITE_EXTENSIONS.has(extension);
}

function createWorkspaceWriteFileHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  workspaceCommand: Pick<DesktopWorkspaceCommandPort, "writeTextFile">,
): RegisteredToolHandler {
  return {
    descriptor: WORKSPACE_WRITE_FILE_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
      const path = normalizeOptionalText(input.path);
      const content = typeof input.content === "string" ? input.content : undefined;

      if (!workspaceId) {
        return asToolFailure("workspace_id_required", "workspaceId is required for workspace_write_file.");
      }

      if (!path) {
        return asToolFailure("workspace_path_required", "path is required for workspace_write_file.", {
          workspaceId,
        });
      }

      if (content === undefined) {
        return asToolFailure("workspace_content_required", "content is required for workspace_write_file.", {
          workspaceId,
          path,
        });
      }

      const normalizedPath = normalizeWorkspaceWritablePath(path);
      if (!isValidWorkspaceWritablePath(normalizedPath)) {
        return asToolFailure(
          "workspace_write_path_invalid",
          "workspace_write_file requires a valid workspace-relative file path.",
          {
            workspaceId,
            path: normalizedPath,
          },
        );
      }

      try {
        const file = await workspaceCommand.writeTextFile(workspaceId, normalizedPath, content);

        return {
          workspaceId: file.workspaceId,
          rootPath: file.rootPath,
          path: file.path,
          absolutePath: file.absolutePath,
          binary: file.binary,
          truncated: file.truncated,
          ...(file.mimeType ? { mimeType: file.mimeType } : {}),
          content: file.content,
        };
      } catch (error) {
        return asToolFailure(
          "workspace_write_file_failed",
          error instanceof Error ? error.message : "Failed to write workspace file.",
          {
            workspaceId,
            path: normalizedPath,
          },
        );
      }
    },
  };
}

function createWorkspaceWriteDocumentHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  workspaceCommand: Pick<DesktopWorkspaceCommandPort, "writeTextFile">,
): RegisteredToolHandler {
  return {
    descriptor: WORKSPACE_WRITE_DOCUMENT_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
      const path = normalizeOptionalText(input.path);
      const content = typeof input.content === "string" ? input.content : undefined;

      if (!workspaceId) {
        return asToolFailure("workspace_id_required", "workspaceId is required for workspace_write_document.");
      }

      if (!path) {
        return asToolFailure("workspace_path_required", "path is required for workspace_write_document.", {
          workspaceId,
        });
      }

      if (content === undefined) {
        return asToolFailure("workspace_content_required", "content is required for workspace_write_document.", {
          workspaceId,
          path,
        });
      }

      const normalizedPath = normalizeWorkspaceWritablePath(path);
      if (!isAllowedWorkspaceDocumentPath(normalizedPath)) {
        return asToolFailure(
          "workspace_document_path_forbidden",
          "workspace_write_document only allows docs/** and root README*.md targets.",
          {
            workspaceId,
            path: normalizedPath,
          },
        );
      }

      try {
        const file = await workspaceCommand.writeTextFile(workspaceId, normalizedPath, content);

        return {
          workspaceId: file.workspaceId,
          rootPath: file.rootPath,
          path: file.path,
          absolutePath: file.absolutePath,
          binary: file.binary,
          truncated: file.truncated,
          ...(file.mimeType ? { mimeType: file.mimeType } : {}),
          content: file.content,
        };
      } catch (error) {
        return asToolFailure(
          "workspace_write_document_failed",
          error instanceof Error ? error.message : "Failed to write workspace document.",
          {
            workspaceId,
            path: normalizedPath,
          },
        );
      }
    },
  };
}

function createGitListChangesHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  gitQuery: Pick<DesktopGitQueryPort, "getGitChanges">,
): RegisteredToolHandler {
  return {
    descriptor: GIT_LIST_CHANGES_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
      if (!workspaceId) {
        return asToolFailure("workspace_id_required", "workspaceId is required for git_list_changes.");
      }

      try {
        const changes = await gitQuery.getGitChanges(workspaceId);
        const items = changes.items.slice(0, TOOL_RESULT_ITEM_LIMIT).map((item) => ({
          path: item.path,
          ...(item.previousPath ? { previousPath: item.previousPath } : {}),
          status: item.status,
          additions: item.additions,
          deletions: item.deletions,
        }));

        return {
          workspaceId: changes.workspaceId,
          rootPath: changes.rootPath,
          isGitRepo: changes.isGitRepo,
          clean: changes.clean,
          ...(changes.branch ? { branch: changes.branch } : {}),
          ...(changes.upstream ? { upstream: changes.upstream } : {}),
          detached: changes.detached,
          ahead: changes.ahead,
          behind: changes.behind,
          summary: changes.summary,
          stagedSummary: changes.stagedSummary,
          unstagedSummary: changes.unstagedSummary,
          total: changes.items.length,
          truncated: changes.items.length > TOOL_RESULT_ITEM_LIMIT,
          items,
        };
      } catch (error) {
        return asToolFailure(
          "git_changes_failed",
          error instanceof Error ? error.message : "Failed to inspect git changes.",
          { workspaceId },
        );
      }
    },
  };
}

function createGitReviewFileHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  gitQuery: Pick<DesktopGitQueryPort, "getGitReviewDetail">,
): RegisteredToolHandler {
  return {
    descriptor: GIT_REVIEW_FILE_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
      const path = normalizeOptionalText(input.path);
      if (!workspaceId) {
        return asToolFailure("workspace_id_required", "workspaceId is required for git_review_file.");
      }

      if (!path) {
        return asToolFailure("workspace_path_required", "path is required for git_review_file.");
      }

      try {
        const detail = await gitQuery.getGitReviewDetail(workspaceId, {
          path,
          ...(normalizeReviewScope(input.scope) ? { scope: normalizeReviewScope(input.scope) } : {}),
          ...(normalizeOptionalText(input.baseRef) ? { baseRef: normalizeOptionalText(input.baseRef) } : {}),
          ...(normalizeOptionalText(input.headRef) ? { headRef: normalizeOptionalText(input.headRef) } : {}),
        });

        if (!detail.item) {
          return {
            workspaceId: detail.workspaceId,
            rootPath: detail.rootPath,
            isGitRepo: detail.isGitRepo,
            path: detail.path,
            ...(detail.scope ? { scope: detail.scope } : {}),
            ...(detail.baseRef ? { baseRef: detail.baseRef } : {}),
            ...(detail.headRef ? { headRef: detail.headRef } : {}),
            found: false,
            note: "No diff is available for the requested path.",
          };
        }

        const patch = truncateText(detail.item.patch);

        return {
          workspaceId: detail.workspaceId,
          rootPath: detail.rootPath,
          isGitRepo: detail.isGitRepo,
          path: detail.path,
          ...(detail.scope ? { scope: detail.scope } : {}),
          ...(detail.baseRef ? { baseRef: detail.baseRef } : {}),
          ...(detail.headRef ? { headRef: detail.headRef } : {}),
          found: true,
          item: {
            path: detail.item.path,
            ...(detail.item.previousPath ? { previousPath: detail.item.previousPath } : {}),
            status: detail.item.status,
            additions: detail.item.additions,
            deletions: detail.item.deletions,
            patch: patch.text,
            truncated: patch.truncated,
          },
        };
      } catch (error) {
        return asToolFailure(
          "git_review_failed",
          error instanceof Error ? error.message : "Failed to review git file diff.",
          { workspaceId, path },
        );
      }
    },
  };
}

function createTerminalCreateSessionHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  terminalCommand: Pick<DesktopTerminalsCommandPort, "create">,
): RegisteredToolHandler {
  return {
    descriptor: TERMINAL_CREATE_SESSION_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);

      try {
        const session = await terminalCommand.create({
          ...(workspaceId ? { workspaceId } : {}),
          ...(normalizeOptionalText(input.cwd) ? { cwd: normalizeOptionalText(input.cwd) } : {}),
          ...(normalizeOptionalText(input.title) ? { title: normalizeOptionalText(input.title) } : {}),
          ...(normalizeTerminalShellKind(input.shellKind) ? { shellKind: normalizeTerminalShellKind(input.shellKind) } : {}),
        });

        return {
          sessionId: session.sessionId,
          title: session.title,
          shellKind: session.shellKind,
          ...(session.requestedShellKind ? { requestedShellKind: session.requestedShellKind } : {}),
          ...(session.resolvedShellKind ? { resolvedShellKind: session.resolvedShellKind } : {}),
          ...(session.shellDisplayName ? { shellDisplayName: session.shellDisplayName } : {}),
          cwd: session.cwd,
          status: session.status,
          ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
        };
      } catch (error) {
        return asToolFailure(
          "terminal_create_failed",
          error instanceof Error ? error.message : "Failed to create terminal session.",
          {
            ...(workspaceId ? { workspaceId } : {}),
            ...(normalizeOptionalText(input.cwd) ? { cwd: normalizeOptionalText(input.cwd) } : {}),
          },
        );
      }
    },
  };
}

function tryParseToolOutputRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readRecentToolResultOutput(message: MessageRecordWithParts): {
  toolName: string;
  output: Record<string, unknown>;
} | undefined {
  const toolPart = message.parts.find((part): part is Extract<typeof message.parts[number], { type: "tool_result_ref" }> =>
    part.type === "tool_result_ref");
  if (!toolPart || !toolPart.toolName.toLowerCase().startsWith("terminal_")) {
    return undefined;
  }

  const textPart = message.parts.find((part): part is Extract<typeof message.parts[number], { type: "text" }> =>
    part.type === "text");
  if (!textPart) {
    return undefined;
  }

  const output = tryParseToolOutputRecord(textPart.text);
  if (!output) {
    return undefined;
  }

  return {
    toolName: toolPart.toolName,
    output,
  };
}

function readTerminalSessionIdFromOutput(output: Record<string, unknown>): string | undefined {
  const sessionId = normalizeOptionalText(output.sessionId);
  if (sessionId) {
    return sessionId;
  }

  const session = isRecord(output.session) ? output.session : undefined;
  return normalizeOptionalText(session?.sessionId);
}

function readTerminalShellFromOutput(output: Record<string, unknown>): {
  resolvedShellKind?: DesktopResolvedShellKind;
  shellKind?: DesktopTerminalShellKind;
  shellDisplayName?: string;
} | undefined {
  const resolvedShellKind = normalizeResolvedTerminalShellKind(output.resolvedShellKind);
  const shellKind = normalizeTerminalShellKind(output.shellKind);
  const shellDisplayName = normalizeOptionalText(output.shellDisplayName);

  if (resolvedShellKind || shellKind || shellDisplayName) {
    return {
      ...(resolvedShellKind ? { resolvedShellKind } : {}),
      ...(shellKind ? { shellKind } : {}),
      ...(shellDisplayName ? { shellDisplayName } : {}),
    };
  }

  const session = isRecord(output.session) ? output.session : undefined;
  if (!session) {
    return undefined;
  }

  const sessionResolvedShellKind = normalizeResolvedTerminalShellKind(session.resolvedShellKind);
  const sessionShellKind = normalizeTerminalShellKind(session.shellKind);
  const sessionShellDisplayName = normalizeOptionalText(session.shellDisplayName);
  if (!sessionResolvedShellKind && !sessionShellKind && !sessionShellDisplayName) {
    return undefined;
  }

  return {
    ...(sessionResolvedShellKind ? { resolvedShellKind: sessionResolvedShellKind } : {}),
    ...(sessionShellKind ? { shellKind: sessionShellKind } : {}),
    ...(sessionShellDisplayName ? { shellDisplayName: sessionShellDisplayName } : {}),
  };
}

function resolveRecentTerminalPromptShell(
  recentMessages: readonly MessageRecordWithParts[],
): ReturnType<typeof normalizeDesktopTerminalPromptShell> | undefined {
  const closedSessionIds = new Set<string>();

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    if (!message) {
      continue;
    }

    const result = readRecentToolResultOutput(message);
    if (!result) {
      continue;
    }

    const sessionId = readTerminalSessionIdFromOutput(result.output);
    if (!sessionId) {
      continue;
    }

    if (result.toolName === "terminal_close_session") {
      closedSessionIds.add(sessionId);
      continue;
    }

    if (closedSessionIds.has(sessionId)) {
      continue;
    }

    const shell = readTerminalShellFromOutput(result.output);
    if (!shell) {
      continue;
    }

    return normalizeDesktopTerminalPromptShell(shell);
  }

  return undefined;
}

function resolveRecentTerminalPromptShellForSessionId(
  recentMessages: readonly MessageRecordWithParts[],
  targetSessionId: string,
): ReturnType<typeof normalizeDesktopTerminalPromptShell> | undefined {
  const closedSessionIds = new Set<string>();

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    if (!message) {
      continue;
    }

    const result = readRecentToolResultOutput(message);
    if (!result) {
      continue;
    }

    const sessionId = readTerminalSessionIdFromOutput(result.output);
    if (!sessionId) {
      continue;
    }

    if (result.toolName === "terminal_close_session") {
      closedSessionIds.add(sessionId);
      continue;
    }

    if (sessionId !== targetSessionId || closedSessionIds.has(sessionId)) {
      continue;
    }

    const shell = readTerminalShellFromOutput(result.output);
    if (!shell) {
      continue;
    }

    return normalizeDesktopTerminalPromptShell(shell);
  }

  return undefined;
}

function resolveRecentTerminalSessionId(recentMessages: readonly MessageRecordWithParts[]): string | undefined {
  const closedSessionIds = new Set<string>();

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    if (!message) {
      continue;
    }

    const result = readRecentToolResultOutput(message);
    if (!result) {
      continue;
    }

    const sessionId = readTerminalSessionIdFromOutput(result.output);
    if (!sessionId) {
      continue;
    }

    if (result.toolName === "terminal_close_session") {
      closedSessionIds.add(sessionId);
      continue;
    }

    if (!closedSessionIds.has(sessionId)) {
      return sessionId;
    }
  }

  return undefined;
}

async function resolveTerminalPromptShellFromSessionDetail(
  terminalQuery: Pick<DesktopTerminalsQueryPort, "getDetail">,
  sessionId: string,
): Promise<ReturnType<typeof normalizeDesktopTerminalPromptShell> | undefined> {
  try {
    const detail = await terminalQuery.getDetail({ sessionId, limit: 1 });
    const session = detail?.session;
    if (!session) {
      return undefined;
    }

    const shell = {
      resolvedShellKind: session.resolvedShellKind,
      shellKind: session.shellKind,
      shellDisplayName: session.shellDisplayName,
    };
    const resolvedShellKind = normalizeResolvedTerminalShellKind(shell.resolvedShellKind);
    const shellKind = normalizeTerminalShellKind(shell.shellKind);
    const shellDisplayName = normalizeOptionalText(shell.shellDisplayName);
    if (!resolvedShellKind && !shellKind && !shellDisplayName) {
      return undefined;
    }

    return normalizeDesktopTerminalPromptShell({
      ...(resolvedShellKind ? { resolvedShellKind } : {}),
      ...(shellKind ? { shellKind } : {}),
      ...(shellDisplayName ? { shellDisplayName } : {}),
    });
  } catch {
    return undefined;
  }
}

async function resolveTerminalPromptShellForExecution(input: {
  terminalQuery: Pick<DesktopTerminalsQueryPort, "getDetail">;
  recentMessages: readonly MessageRecordWithParts[];
  sessionId: string;
  fallbackSessionId?: string;
}): Promise<ReturnType<typeof normalizeDesktopTerminalPromptShell> | undefined> {
  return resolveRecentTerminalPromptShellForSessionId(input.recentMessages, input.sessionId)
    ?? await resolveTerminalPromptShellFromSessionDetail(input.terminalQuery, input.sessionId)
    ?? (input.fallbackSessionId && input.fallbackSessionId !== input.sessionId
      ? resolveRecentTerminalPromptShellForSessionId(input.recentMessages, input.fallbackSessionId)
        ?? await resolveTerminalPromptShellFromSessionDetail(input.terminalQuery, input.fallbackSessionId)
      : undefined);
}

function createTerminalExecuteHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  terminalQuery: Pick<DesktopTerminalsQueryPort, "getDetail">,
  terminalCommand: Pick<DesktopTerminalsCommandPort, "create" | "execute">,
): RegisteredToolHandler {
  return {
    descriptor: TERMINAL_EXECUTE_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const requestedSessionId = normalizeOptionalText(input.sessionId);
      const recentSessionId = resolveRecentTerminalSessionId(context.recentMessages);
      const sessionId = requestedSessionId ?? recentSessionId;
      const command = normalizeOptionalText(input.command) ?? normalizeOptionalText(input.text);

      if (!sessionId) {
        return asToolFailure("terminal_session_required", "sessionId is required for terminal_execute.");
      }

      if (!command) {
        return asToolFailure("terminal_command_required", "command is required for terminal_execute.", {
          sessionId,
        });
      }

      const targetShell = await resolveTerminalPromptShellForExecution({
        terminalQuery,
        recentMessages: context.recentMessages,
        sessionId,
        ...(recentSessionId ? { fallbackSessionId: recentSessionId } : {}),
      });
      if (targetShell) {
        const validation = validateDesktopTerminalCommandForShell({
          shell: targetShell,
          command,
        });
        if (validation) {
          return asToolFailure(validation.code, validation.message, {
            sessionId,
            resolvedShellKind: targetShell.resolvedShellKind,
            shellDisplayName: targetShell.shellDisplayName,
            command,
            suggestedPattern: validation.suggestedPattern,
          });
        }
      }

      let session = await terminalCommand.execute(sessionId, {
        text: command,
        appendNewline: true,
      });
      let resolvedSessionId = sessionId;

      if (!session && recentSessionId && recentSessionId !== sessionId) {
        session = await terminalCommand.execute(recentSessionId, {
          text: command,
          appendNewline: true,
        });
        resolvedSessionId = recentSessionId;
      }

      if (!session && requestedSessionId && !recentSessionId) {
        const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
        const createdSession = await terminalCommand.create({
          ...(workspaceId ? { workspaceId } : {}),
          ...(requestedSessionId ? { title: requestedSessionId } : {}),
          ...(normalizeOptionalText(input.cwd) ? { cwd: normalizeOptionalText(input.cwd) } : {}),
          ...(normalizeTerminalShellKind(input.shellKind) ? { shellKind: normalizeTerminalShellKind(input.shellKind) } : {}),
        });
        const createdShell = normalizeDesktopTerminalPromptShell({
          ...(createdSession.resolvedShellKind ? { resolvedShellKind: createdSession.resolvedShellKind } : {}),
          ...(createdSession.shellKind ? { shellKind: createdSession.shellKind } : {}),
          ...(createdSession.shellDisplayName ? { shellDisplayName: createdSession.shellDisplayName } : {}),
        });
        const createdValidation = validateDesktopTerminalCommandForShell({
          shell: createdShell,
          command,
        });
        if (createdValidation) {
          return asToolFailure(createdValidation.code, createdValidation.message, {
            sessionId: createdSession.sessionId,
            requestedSessionId,
            resolvedShellKind: createdShell.resolvedShellKind,
            shellDisplayName: createdShell.shellDisplayName,
            command,
            suggestedPattern: createdValidation.suggestedPattern,
          });
        }

        session = await terminalCommand.execute(createdSession.sessionId, {
          text: command,
          appendNewline: true,
        });
        resolvedSessionId = createdSession.sessionId;
      }

      if (!session) {
        return asToolFailure("terminal_session_not_found", "Terminal session was not found.", {
          sessionId: requestedSessionId ?? sessionId,
          ...(recentSessionId && recentSessionId !== requestedSessionId ? { recentSessionId } : {}),
        });
      }

      return {
        ok: true,
        sessionId: resolvedSessionId,
        status: session.status,
        shellKind: session.shellKind,
        ...(session.resolvedShellKind ? { resolvedShellKind: session.resolvedShellKind } : {}),
        ...(session.shellDisplayName ? { shellDisplayName: session.shellDisplayName } : {}),
        cwd: session.cwd,
      };
    },
  };
}

function createTerminalReadOutputHandler(
  terminalQuery: Pick<DesktopTerminalsQueryPort, "getDetail">,
): RegisteredToolHandler {
  return {
    descriptor: TERMINAL_READ_OUTPUT_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const requestedSessionId = normalizeOptionalText(input.sessionId);
      const recentSessionId = resolveRecentTerminalSessionId(context.recentMessages);
      const sessionId = requestedSessionId ?? recentSessionId;

      if (!sessionId) {
        return asToolFailure("terminal_session_required", "sessionId is required for terminal_read_output.");
      }

      let detail = await terminalQuery.getDetail({
        sessionId,
        ...(normalizePositiveInteger(input.limit) ? { limit: normalizePositiveInteger(input.limit) } : {}),
      });
      let resolvedSessionId = sessionId;

      if (!detail && recentSessionId && recentSessionId !== sessionId) {
        detail = await terminalQuery.getDetail({
          sessionId: recentSessionId,
          ...(normalizePositiveInteger(input.limit) ? { limit: normalizePositiveInteger(input.limit) } : {}),
        });
        resolvedSessionId = recentSessionId;
      }

      if (!detail) {
        return asToolFailure("terminal_session_not_found", "Terminal session was not found.", {
          sessionId: requestedSessionId ?? sessionId,
          ...(recentSessionId && recentSessionId !== requestedSessionId ? { recentSessionId } : {}),
        });
      }

      const output = truncateText(detail.output);

      return {
        sessionId: resolvedSessionId,
        session: detail.session,
        revision: detail.revision,
        truncated: detail.truncated || output.truncated,
        output: output.text,
      };
    },
  };
}

function createTerminalCloseSessionHandler(
  terminalCommand: Pick<DesktopTerminalsCommandPort, "close">,
): RegisteredToolHandler {
  return {
    descriptor: TERMINAL_CLOSE_SESSION_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const requestedSessionId = normalizeOptionalText(input.sessionId);
      const recentSessionId = resolveRecentTerminalSessionId(context.recentMessages);
      const sessionId = requestedSessionId ?? recentSessionId;

      if (!sessionId) {
        return asToolFailure("terminal_session_required", "sessionId is required for terminal_close_session.");
      }

      let response = await terminalCommand.close(sessionId);
      let resolvedSessionId = sessionId;

      if (!response.closed && recentSessionId && recentSessionId !== sessionId) {
        response = await terminalCommand.close(recentSessionId);
        resolvedSessionId = recentSessionId;
      }

      return {
        sessionId: response.sessionId || resolvedSessionId,
        closed: response.closed,
      };
    },
  };
}

function createManagedTaskHandler(
  workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list" | "get">,
  taskBridge: Pick<DesktopConversationTaskBridgePort, "patchManagedConversationRootTask">,
): RegisteredToolHandler {
  return {
    descriptor: MANAGED_TASK_DESCRIPTOR,
    async execute({ call, context }) {
      const input = isRecord(call.input) ? call.input : {};
      const action = normalizeOptionalText(input.action);
      const workspaceId = await resolveWorkspaceId(workspaceQuery, input, context.session.metadata);
      const rootTaskId = readRootTaskId(context.session.metadata);

      if (!workspaceId) {
        return asToolFailure("workspace_id_required", "workspaceId is required for maomi_managed_task.");
      }

      if (!rootTaskId) {
        return asToolFailure(
          "managed_root_task_required",
          "The current session is not linked to a managed root task.",
          { workspaceId },
        );
      }

      if (!action) {
        return asToolFailure("managed_task_action_required", "action is required for maomi_managed_task.", {
          workspaceId,
          rootTaskId,
        });
      }

      const completionContract = buildCompletionContract(input);
      const verificationPlan = isRecord(input.verificationPlan)
        ? { ...input.verificationPlan }
        : undefined;
      const notificationPlan = isRecord(input.notificationPlan)
        ? { ...input.notificationPlan }
        : undefined;
      const wrapUpCommands = normalizeStringArray(input.wrapUpCommands);

      let patch:
        | {
          status?: "running" | "success";
          progress?: number;
          message: string;
          metadata: Record<string, unknown>;
        }
        | undefined;

      if (action === "confirm_managed_task") {
        patch = {
          status: "running",
          progress: typeof input.progress === "number" ? input.progress : 60,
          message: normalizeOptionalText(input.summary) ?? "Managed task specification confirmed and ready for takeover.",
          metadata: {
            managedExecution: true,
            rootTask: true,
            phase: "awaiting_task_confirmation",
            managedExecutionStage: "ready",
            confirmedAt: new Date().toISOString(),
            blockedReason: undefined,
            waitingForInteraction: undefined,
            blockedInteractionId: undefined,
            ...(completionContract ? { completionContract } : {}),
            ...(verificationPlan ? { verificationPlan } : {}),
            ...(notificationPlan ? { notificationPlan } : {}),
            ...(wrapUpCommands ? { wrapUpCommands } : {}),
          },
        };
      } else if (action === "update_completion_contract") {
        if (!completionContract) {
          return asToolFailure(
            "completion_contract_required",
            "Provide objective, expectedOutcome, acceptanceCriteria, verificationPath, or summary.",
            { workspaceId, rootTaskId },
          );
        }
        patch = {
          status: "running",
          progress: typeof input.progress === "number" ? input.progress : 50,
          message: normalizeOptionalText(input.summary) ?? "Managed task completion contract updated.",
          metadata: {
            managedExecution: true,
            rootTask: true,
            completionContract,
          },
        };
      } else if (action === "update_verification_plan") {
        if (!verificationPlan) {
          return asToolFailure(
            "verification_plan_required",
            "verificationPlan must be an object for update_verification_plan.",
            { workspaceId, rootTaskId },
          );
        }
        patch = {
          status: "running",
          progress: typeof input.progress === "number" ? input.progress : 50,
          message: normalizeOptionalText(input.summary) ?? "Managed task verification plan updated.",
          metadata: {
            managedExecution: true,
            rootTask: true,
            verificationPlan,
          },
        };
      } else if (action === "update_notification_plan") {
        if (!notificationPlan) {
          return asToolFailure(
            "notification_plan_required",
            "notificationPlan must be an object for update_notification_plan.",
            { workspaceId, rootTaskId },
          );
        }
        patch = {
          status: "running",
          progress: typeof input.progress === "number" ? input.progress : 50,
          message: normalizeOptionalText(input.summary) ?? "Managed task notification plan updated.",
          metadata: {
            managedExecution: true,
            rootTask: true,
            notificationPlan,
          },
        };
      } else if (action === "update_wrap_up_commands") {
        if (!wrapUpCommands) {
          return asToolFailure(
            "wrap_up_commands_required",
            "wrapUpCommands must contain at least one command for update_wrap_up_commands.",
            { workspaceId, rootTaskId },
          );
        }
        patch = {
          status: "running",
          progress: typeof input.progress === "number" ? input.progress : 55,
          message: normalizeOptionalText(input.summary) ?? "Managed task wrap-up commands updated.",
          metadata: {
            managedExecution: true,
            rootTask: true,
            wrapUpCommands,
          },
        };
      } else if (action === "complete_managed_task") {
        patch = {
          status: "success",
          progress: 100,
          message: normalizeOptionalText(input.summary) ?? "Managed task completed.",
          metadata: {
            managedExecution: true,
            rootTask: true,
            phase: "completed",
            managedExecutionStopReason: "completed",
            ...(wrapUpCommands ? { wrapUpCommands } : {}),
          },
        };
      } else {
        return asToolFailure("managed_task_action_invalid", `Unsupported action: ${action}`, {
          workspaceId,
          rootTaskId,
        });
      }

      const updated = await taskBridge.patchManagedConversationRootTask({
        workspaceId,
        rootTaskId,
        sessionId: context.session.id,
        runId: context.run.id,
        status: patch.status,
        progress: patch.progress,
        message: patch.message,
        metadata: patch.metadata,
      });

      if (!updated) {
        return asToolFailure(
          "managed_root_task_not_found",
          "Managed root task could not be updated because it no longer exists.",
          { workspaceId, rootTaskId },
        );
      }

      const metadata = isRecord(updated.metadata) ? updated.metadata : undefined;

      return {
        ok: true,
        action,
        workspaceId,
        rootTaskId,
        taskStatus: updated.status,
        managedExecutionStage: normalizeOptionalText(metadata?.managedExecutionStage),
        phase: normalizeOptionalText(metadata?.phase),
      };
    },
  };
}

export function createDesktopConversationBuiltinToolBundle(
  options: DesktopConversationBuiltinToolBundleOptions,
): DesktopConversationBuiltinToolBundle {
  const toolHandlers = [
    createWorkspaceReadFileHandler(options.workspaceQuery),
    ...(options.workspaceCommand
      ? [
          createWorkspaceWriteFileHandler(options.workspaceQuery, options.workspaceCommand),
          createWorkspaceWriteDocumentHandler(options.workspaceQuery, options.workspaceCommand),
        ]
      : []),
    createGitListChangesHandler(options.workspaceQuery, options.gitQuery),
    createGitReviewFileHandler(options.workspaceQuery, options.gitQuery),
    createTerminalCreateSessionHandler(options.workspaceQuery, options.terminalCommand),
    createTerminalExecuteHandler(options.workspaceQuery, options.terminalQuery, options.terminalCommand),
    createTerminalReadOutputHandler(options.terminalQuery),
    createTerminalCloseSessionHandler(options.terminalCommand),
    createManagedTaskHandler(options.workspaceQuery, options.taskBridge),
  ];

  return {
    toolHandlers,
    toolSources: [createStaticToolSource(toolHandlers.map((handler) => handler.descriptor))],
  };
}
