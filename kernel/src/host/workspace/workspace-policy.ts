import type { MessageRecordWithParts, RunRecord, SessionRecord } from "../../core"
import type { WorkspaceBinding } from "./workspace-binding"

export type WorkspaceContextVisibility = "none" | "summary" | "full"

export type WorkspacePolicyInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
  binding?: WorkspaceBinding
}

export type WorkspacePolicyDecision = {
  binding?: WorkspaceBinding
  visibility: WorkspaceContextVisibility
  allowContextContribution: boolean
}

export interface WorkspacePolicy {
  evaluate(input: WorkspacePolicyInput): Promise<WorkspacePolicyDecision>
}

type DefaultWorkspacePolicyOptions = {
  defaultVisibility?:
    | WorkspaceContextVisibility
    | ((input: WorkspacePolicyInput) => Promise<WorkspaceContextVisibility> | WorkspaceContextVisibility)
  allowedSandboxModes?: readonly string[]
  requireWorkspaceRoot?: boolean
}

function hasBindingIdentity(binding: WorkspaceBinding | undefined): boolean {
  return !!(
    binding?.workspaceId
    || binding?.workspaceName
    || binding?.workspaceRoot
  )
}

async function resolveVisibility(
  input: WorkspacePolicyInput,
  visibility: DefaultWorkspacePolicyOptions["defaultVisibility"],
): Promise<WorkspaceContextVisibility> {
  if (!visibility) {
    return "full"
  }

  return typeof visibility === "function"
    ? await visibility(input)
    : visibility
}

function sandboxModeAllowed(
  binding: WorkspaceBinding | undefined,
  allowedSandboxModes: readonly string[] | undefined,
): boolean {
  if (!allowedSandboxModes || allowedSandboxModes.length === 0 || !binding?.sandboxMode) {
    return true
  }

  return allowedSandboxModes.includes(binding.sandboxMode)
}

export class DefaultWorkspacePolicy implements WorkspacePolicy {
  constructor(private readonly options: DefaultWorkspacePolicyOptions = {}) {}

  async evaluate(input: WorkspacePolicyInput): Promise<WorkspacePolicyDecision> {
    const visibility = await resolveVisibility(input, this.options.defaultVisibility)

    if (!input.binding || !hasBindingIdentity(input.binding)) {
      return {
        visibility: "none",
        allowContextContribution: false,
      }
    }

    if (visibility === "none") {
      return {
        binding: input.binding,
        visibility,
        allowContextContribution: false,
      }
    }

    if (!sandboxModeAllowed(input.binding, this.options.allowedSandboxModes)) {
      return {
        binding: input.binding,
        visibility: "none",
        allowContextContribution: false,
      }
    }

    if (this.options.requireWorkspaceRoot && !input.binding.workspaceRoot) {
      return {
        binding: input.binding,
        visibility: "none",
        allowContextContribution: false,
      }
    }

    return {
      binding: input.binding,
      visibility,
      allowContextContribution: true,
    }
  }
}
