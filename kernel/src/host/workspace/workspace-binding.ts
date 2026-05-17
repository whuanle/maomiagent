import type { KernelMetadata, RunRecord, SessionRecord } from "../../core"

export type WorkspaceBinding = {
  workspaceId?: string
  executionWorkspaceId?: string
  workspaceName?: string
  workspaceRoot?: string
  executionWorkspaceRoot?: string
  worktreeId?: string
  worktreeName?: string
  worktreeRoot?: string
  sandboxMode?: string
  runtimeProfileSignature?: string
  metadata?: KernelMetadata
  source: "session" | "run" | "merged"
}

export type WorkspaceRuntimeIdentity = {
  workspaceId: string
  executionWorkspaceId: string
  workspaceRoot?: string
  executionWorkspaceRoot?: string
  worktreeId?: string
  worktreeRoot?: string
  sandboxMode?: string
  runtimeProfileSignature?: string
}

export type WorkspaceBindingInput = {
  session: SessionRecord
  run: RunRecord
}

export interface WorkspaceBindingResolver {
  resolve(input: WorkspaceBindingInput): Promise<WorkspaceBinding | undefined>
}

type WorkspaceMetadataRecord = {
  workspaceId?: string
  executionWorkspaceId?: string
  workspaceName?: string
  workspaceRoot?: string
  executionWorkspaceRoot?: string
  worktreeId?: string
  worktreeName?: string
  worktreeRoot?: string
  sandboxMode?: string
  runtimeProfileSignature?: string
  metadata?: KernelMetadata
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function readMetadataObject(value: unknown): KernelMetadata | undefined {
  return isRecord(value) ? { ...value } : undefined
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function readExecutionWorkspaceMetadata(metadata: SessionRecord["metadata"] | RunRecord["metadata"]): Pick<
  WorkspaceMetadataRecord,
  "executionWorkspaceId" | "executionWorkspaceRoot"
> {
  const nested = readRecord(metadata?.executionWorkspace)
    ?? readRecord(metadata?.execution_workspace)

  return {
    executionWorkspaceId: readTrimmedString(
      nested?.workspaceId
      ?? nested?.id
      ?? metadata?.executionWorkspaceId
      ?? metadata?.execution_workspace_id,
    ),
    executionWorkspaceRoot: readTrimmedString(
      nested?.workspaceRoot
      ?? nested?.directoryPath
      ?? nested?.workspacePath
      ?? nested?.rootPath
      ?? metadata?.executionWorkspaceRoot
      ?? metadata?.execution_workspace_root
      ?? metadata?.executionWorkspacePath,
    ),
  }
}

function readWorktreeMetadata(metadata: SessionRecord["metadata"] | RunRecord["metadata"]): Pick<
  WorkspaceMetadataRecord,
  "worktreeId" | "worktreeName" | "worktreeRoot" | "runtimeProfileSignature"
> {
  const nested = readRecord(metadata?.worktree)

  return {
    worktreeId: readTrimmedString(
      nested?.worktreeId
      ?? nested?.id
      ?? metadata?.worktreeId
      ?? metadata?.worktree_id,
    ),
    worktreeName: readTrimmedString(
      nested?.worktreeName
      ?? nested?.name
      ?? metadata?.worktreeName
      ?? metadata?.worktree_name,
    ),
    worktreeRoot: readTrimmedString(
      nested?.worktreeRoot
      ?? nested?.directoryPath
      ?? nested?.path
      ?? nested?.rootPath
      ?? metadata?.worktreeRoot
      ?? metadata?.worktree_path,
    ),
    runtimeProfileSignature: readTrimmedString(
      nested?.runtimeProfileSignature
      ?? metadata?.runtimeProfileSignature
      ?? metadata?.runtime_profile_signature,
    ),
  }
}

function readWorkspaceMetadata(metadata: SessionRecord["metadata"] | RunRecord["metadata"]): WorkspaceMetadataRecord {
  const nested = isRecord(metadata?.workspace) ? metadata.workspace : undefined
  const source = nested ?? metadata
  const executionWorkspace = readExecutionWorkspaceMetadata(metadata)
  const worktree = readWorktreeMetadata(metadata)

  return {
    workspaceId: readTrimmedString(source?.workspaceId),
    workspaceName: readTrimmedString(source?.workspaceName ?? source?.name),
    workspaceRoot: readTrimmedString(source?.workspaceRoot ?? source?.directoryPath ?? source?.workspacePath),
    executionWorkspaceId: executionWorkspace.executionWorkspaceId,
    executionWorkspaceRoot: executionWorkspace.executionWorkspaceRoot,
    worktreeId: worktree.worktreeId,
    worktreeName: worktree.worktreeName,
    worktreeRoot: worktree.worktreeRoot,
    sandboxMode: readTrimmedString(source?.sandboxMode ?? source?.sandbox_mode),
    runtimeProfileSignature: worktree.runtimeProfileSignature,
    metadata: nested ? readMetadataObject(nested.metadata) : undefined,
  }
}

function mergeWorkspaceMetadata(
  sessionMetadata: WorkspaceMetadataRecord,
  runMetadata: WorkspaceMetadataRecord,
): WorkspaceMetadataRecord {
  return {
    workspaceId: runMetadata.workspaceId ?? sessionMetadata.workspaceId,
    executionWorkspaceId: runMetadata.executionWorkspaceId ?? sessionMetadata.executionWorkspaceId,
    workspaceName: runMetadata.workspaceName ?? sessionMetadata.workspaceName,
    workspaceRoot: runMetadata.workspaceRoot ?? sessionMetadata.workspaceRoot,
    executionWorkspaceRoot: runMetadata.executionWorkspaceRoot ?? sessionMetadata.executionWorkspaceRoot,
    worktreeId: runMetadata.worktreeId ?? sessionMetadata.worktreeId,
    worktreeName: runMetadata.worktreeName ?? sessionMetadata.worktreeName,
    worktreeRoot: runMetadata.worktreeRoot ?? sessionMetadata.worktreeRoot,
    sandboxMode: runMetadata.sandboxMode ?? sessionMetadata.sandboxMode,
    runtimeProfileSignature: runMetadata.runtimeProfileSignature ?? sessionMetadata.runtimeProfileSignature,
    metadata: runMetadata.metadata ?? sessionMetadata.metadata,
  }
}

function hasWorkspaceBindingValue(binding: WorkspaceMetadataRecord): boolean {
  return !!(
    binding.workspaceId
    || binding.executionWorkspaceId
    || binding.workspaceName
    || binding.workspaceRoot
    || binding.executionWorkspaceRoot
    || binding.worktreeId
    || binding.worktreeName
    || binding.worktreeRoot
    || binding.sandboxMode
    || binding.runtimeProfileSignature
  )
}

export function resolveWorkspaceRuntimeIdentity(
  binding: WorkspaceBinding | undefined,
): WorkspaceRuntimeIdentity | undefined {
  const workspaceId = binding?.workspaceId?.trim()
    || binding?.executionWorkspaceId?.trim()
    || binding?.worktreeId?.trim()
    || binding?.worktreeRoot?.trim()
  const executionWorkspaceId = binding?.executionWorkspaceId?.trim()
    || workspaceId

  if (!workspaceId || !executionWorkspaceId) {
    return undefined
  }

  return {
    workspaceId,
    executionWorkspaceId,
    ...(binding?.workspaceRoot ? { workspaceRoot: binding.workspaceRoot } : {}),
    ...(binding?.executionWorkspaceRoot
      ? { executionWorkspaceRoot: binding.executionWorkspaceRoot }
      : binding?.workspaceRoot
        ? { executionWorkspaceRoot: binding.workspaceRoot }
        : {}),
    ...(binding?.worktreeId ? { worktreeId: binding.worktreeId } : {}),
    ...(binding?.worktreeRoot ? { worktreeRoot: binding.worktreeRoot } : {}),
    ...(binding?.sandboxMode ? { sandboxMode: binding.sandboxMode } : {}),
    ...(binding?.runtimeProfileSignature
      ? { runtimeProfileSignature: binding.runtimeProfileSignature }
      : {}),
  }
}

export function formatWorkspaceRuntimeIdentityKey(input: WorkspaceRuntimeIdentity): string {
  return [
    input.executionWorkspaceId,
    input.executionWorkspaceRoot ?? "-",
    input.worktreeId ?? "-",
    input.worktreeRoot ?? "-",
    input.sandboxMode ?? "-",
    input.runtimeProfileSignature ?? "-",
  ].join("\u0000")
}

export function formatWorkspaceBindingContent(input: {
  binding: WorkspaceBinding
  visibility: "summary" | "full"
}): string {
  const identity = input.binding.workspaceName
    ?? input.binding.executionWorkspaceId
    ?? input.binding.workspaceId
    ?? input.binding.worktreeName
    ?? input.binding.worktreeId
    ?? input.binding.workspaceRoot
    ?? input.binding.executionWorkspaceRoot
    ?? input.binding.worktreeRoot
  if (!identity) {
    return ""
  }

  if (input.visibility === "summary") {
    return `Workspace: ${identity}`
  }

  const lines: string[] = []
  if (input.binding.workspaceName) {
    lines.push(`Workspace name: ${input.binding.workspaceName}`)
  }
  if (input.binding.workspaceId) {
    lines.push(`Workspace id: ${input.binding.workspaceId}`)
  }
  if (input.binding.workspaceRoot) {
    lines.push(`Workspace root: ${input.binding.workspaceRoot}`)
  }
  if (input.binding.executionWorkspaceId && input.binding.executionWorkspaceId !== input.binding.workspaceId) {
    lines.push(`Execution workspace id: ${input.binding.executionWorkspaceId}`)
  }
  if (input.binding.executionWorkspaceRoot && input.binding.executionWorkspaceRoot !== input.binding.workspaceRoot) {
    lines.push(`Execution workspace root: ${input.binding.executionWorkspaceRoot}`)
  }
  if (input.binding.worktreeName) {
    lines.push(`Worktree name: ${input.binding.worktreeName}`)
  }
  if (input.binding.worktreeId) {
    lines.push(`Worktree id: ${input.binding.worktreeId}`)
  }
  if (input.binding.worktreeRoot) {
    lines.push(`Worktree root: ${input.binding.worktreeRoot}`)
  }
  if (input.binding.sandboxMode) {
    lines.push(`Workspace sandbox: ${input.binding.sandboxMode}`)
  }
  if (input.binding.runtimeProfileSignature) {
    lines.push(`Runtime profile: ${input.binding.runtimeProfileSignature}`)
  }

  return lines.join("\n")
}

export class DefaultWorkspaceBindingResolver implements WorkspaceBindingResolver {
  async resolve(input: WorkspaceBindingInput): Promise<WorkspaceBinding | undefined> {
    const sessionMetadata = readWorkspaceMetadata(input.session.metadata)
    const runMetadata = readWorkspaceMetadata(input.run.metadata)
    const merged = mergeWorkspaceMetadata(sessionMetadata, runMetadata)

    if (!hasWorkspaceBindingValue(merged)) {
      return undefined
    }

    const source =
      hasWorkspaceBindingValue(runMetadata) && hasWorkspaceBindingValue(sessionMetadata)
        ? "merged"
        : hasWorkspaceBindingValue(runMetadata)
          ? "run"
          : "session"

    return {
      ...(merged.workspaceId ? { workspaceId: merged.workspaceId } : {}),
      ...(merged.executionWorkspaceId
        ? { executionWorkspaceId: merged.executionWorkspaceId }
        : {}),
      ...(merged.workspaceName ? { workspaceName: merged.workspaceName } : {}),
      ...(merged.workspaceRoot ? { workspaceRoot: merged.workspaceRoot } : {}),
      ...(merged.executionWorkspaceRoot
        ? { executionWorkspaceRoot: merged.executionWorkspaceRoot }
        : {}),
      ...(merged.worktreeId ? { worktreeId: merged.worktreeId } : {}),
      ...(merged.worktreeName ? { worktreeName: merged.worktreeName } : {}),
      ...(merged.worktreeRoot ? { worktreeRoot: merged.worktreeRoot } : {}),
      ...(merged.sandboxMode ? { sandboxMode: merged.sandboxMode } : {}),
      ...(merged.runtimeProfileSignature
        ? { runtimeProfileSignature: merged.runtimeProfileSignature }
        : {}),
      ...(merged.metadata ? { metadata: { ...merged.metadata } } : {}),
      source,
    }
  }
}
