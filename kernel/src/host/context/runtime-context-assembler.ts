import type { OutputMode, TurnInputContext } from "../../core"
import type { ContextContributorInput } from "./context-contributor-registry"
import type { ContextContributorRegistry } from "./context-contributor-registry"

export type RuntimeContextAssemblyInput = ContextContributorInput

export type RuntimeContextPolicies = Partial<TurnInputContext["policies"]>

export type RuntimeContextAssembly = Pick<
  TurnInputContext,
  "systemBlocks" | "contextBlocks" | "outputMode" | "policies"
>

export interface RuntimeContextAssemblerPort {
  assemble(input: RuntimeContextAssemblyInput): Promise<RuntimeContextAssembly>
}

export type RuntimeContextAssemblerOptions = {
  contextContributorRegistry: Pick<ContextContributorRegistry, "collect">
  outputMode?:
    | OutputMode
    | ((input: RuntimeContextAssemblyInput) => Promise<OutputMode> | OutputMode)
  policies?:
    | RuntimeContextPolicies
    | ((input: RuntimeContextAssemblyInput) => Promise<RuntimeContextPolicies> | RuntimeContextPolicies)
}

const DEFAULT_OUTPUT_MODE: OutputMode = {
  kind: "text",
}

const DEFAULT_POLICIES: TurnInputContext["policies"] = {
  allowCompaction: true,
  retryOnModelError: false,
}

async function resolveOutputMode(
  input: RuntimeContextAssemblyInput,
  outputMode?: RuntimeContextAssemblerOptions["outputMode"],
): Promise<OutputMode> {
  if (!outputMode) {
    return {
      ...DEFAULT_OUTPUT_MODE,
    }
  }

  const resolved = typeof outputMode === "function"
    ? await outputMode(input)
    : outputMode

  return resolved.kind === "json_schema"
    ? {
        kind: "json_schema",
        schema: { ...resolved.schema },
      }
    : {
        kind: "text",
      }
}

async function resolvePolicies(
  input: RuntimeContextAssemblyInput,
  policies?: RuntimeContextAssemblerOptions["policies"],
): Promise<TurnInputContext["policies"]> {
  const resolved = policies
    ? typeof policies === "function"
      ? await policies(input)
      : policies
    : undefined

  return {
    ...DEFAULT_POLICIES,
    ...resolved,
  }
}

export class RuntimeContextAssembler implements RuntimeContextAssemblerPort {
  constructor(private readonly options: RuntimeContextAssemblerOptions) {}

  async assemble(input: RuntimeContextAssemblyInput): Promise<RuntimeContextAssembly> {
    const contributedContext = await this.options.contextContributorRegistry.collect(input)

    return {
      systemBlocks: contributedContext.systemBlocks,
      contextBlocks: contributedContext.contextBlocks,
      outputMode: await resolveOutputMode(input, this.options.outputMode),
      policies: await resolvePolicies(input, this.options.policies),
    }
  }
}
