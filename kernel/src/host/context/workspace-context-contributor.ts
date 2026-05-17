import type { KernelMetadata } from "../../core"
import type { ContextContribution, ContextContributor, ContextContributorInput } from "./context-contributor-registry"
import {
  DefaultWorkspaceBindingResolver,
  DefaultWorkspacePolicy,
  formatWorkspaceBindingContent,
  type WorkspaceBinding,
  type WorkspaceBindingResolver,
  type WorkspacePolicy,
  type WorkspacePolicyDecision,
} from "../workspace"

export type WorkspaceContextResolveInput = ContextContributorInput & {
  binding?: WorkspaceBinding
  decision?: WorkspacePolicyDecision
}

type WorkspaceContextContributorOptions = {
  blockId?: string
  priority?: number
  metadata?: KernelMetadata
  content?: string
  bindingResolver?: WorkspaceBindingResolver
  workspacePolicy?: WorkspacePolicy
  resolveContent?: (input: WorkspaceContextResolveInput) => Promise<string | undefined> | string | undefined
}

async function resolveWorkspaceContent(
  input: ContextContributorInput,
  options: WorkspaceContextContributorOptions,
): Promise<string | undefined> {
  const bindingResolver = options.bindingResolver ?? new DefaultWorkspaceBindingResolver()
  const workspacePolicy = options.workspacePolicy ?? new DefaultWorkspacePolicy()
  const binding = await bindingResolver.resolve({
    session: input.session,
    run: input.run,
  })
  const decision = await workspacePolicy.evaluate({
    ...input,
    binding,
  })
  const content = options.resolveContent
    ? await options.resolveContent({
        ...input,
        binding,
        decision,
      })
    : options.content
      ?? (
        decision.allowContextContribution && decision.binding
          ? formatWorkspaceBindingContent({
              binding: decision.binding,
              visibility: decision.visibility === "none" ? "summary" : decision.visibility,
            })
          : undefined
      )
  const normalized = content?.trim()

  return normalized ? normalized : undefined
}

export class WorkspaceContextContributor implements ContextContributor {
  constructor(private readonly options: WorkspaceContextContributorOptions) {}

  async contribute(input: ContextContributorInput): Promise<ContextContribution> {
    const content = await resolveWorkspaceContent(input, this.options)
    if (!content) {
      return {}
    }

    return {
      contextBlocks: [
        {
          id: this.options.blockId ?? "workspace.primary",
          kind: "workspace",
          content,
          priority: this.options.priority ?? 50,
          metadata: this.options.metadata ? { ...this.options.metadata } : undefined,
        },
      ],
    }
  }
}
