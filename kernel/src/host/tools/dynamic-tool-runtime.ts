import type {
  KernelMetadata,
  MessageRecordWithParts,
  RunRecord,
  SessionRecord,
  ToolDescriptor,
} from "../../core"
import type { ToolVisibilityPolicy } from "./tool-visibility-policy"
import { DefaultToolVisibilityPolicy } from "./tool-visibility-policy"

export type ToolSourceDescriptor = {
  sourceId: string
  signature?: string
  metadata?: KernelMetadata
}

export type ToolSourceSnapshot = {
  source: ToolSourceDescriptor
  tools: readonly ToolDescriptor[]
}

export type ToolCatalogSnapshot = {
  signature: string
  sources: readonly ToolSourceSnapshot[]
  tools: readonly ToolDescriptor[]
}

export type DynamicToolRuntimeInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
}

export interface ToolSource {
  listTools(input: DynamicToolRuntimeInput): Promise<readonly ToolDescriptor[] | ToolSourceSnapshot>
}

export interface DynamicToolRuntimePort {
  listSourceSnapshots(input: DynamicToolRuntimeInput): Promise<readonly ToolSourceSnapshot[]>
  listCatalog(input: DynamicToolRuntimeInput): Promise<ToolCatalogSnapshot>
  listTools(input: DynamicToolRuntimeInput): Promise<readonly ToolDescriptor[]>
}

export type DynamicToolRuntimeOptions = {
  sources: readonly ToolSource[]
  visibilityPolicy?: ToolVisibilityPolicy
}

function cloneTool(tool: ToolDescriptor): ToolDescriptor {
  return {
    ...tool,
    inputSchema: { ...tool.inputSchema },
    metadata: tool.metadata ? { ...tool.metadata } : undefined,
  }
}

function cloneSource(source: ToolSourceDescriptor): ToolSourceDescriptor {
  return {
    sourceId: source.sourceId,
    ...(source.signature ? { signature: source.signature } : {}),
    ...(source.metadata ? { metadata: { ...source.metadata } } : {}),
  }
}

function cloneSnapshot(snapshot: ToolSourceSnapshot): ToolSourceSnapshot {
  return {
    source: cloneSource(snapshot.source),
    tools: snapshot.tools.map((tool) => cloneTool(tool)),
  }
}

function decorateTool(tool: ToolDescriptor, source: ToolSourceDescriptor): ToolDescriptor {
  return {
    ...cloneTool(tool),
    metadata: {
      ...(tool.metadata ? { ...tool.metadata } : {}),
      toolSourceId: source.sourceId,
      ...(source.signature ? { toolSourceSignature: source.signature } : {}),
    },
  }
}

function isToolSourceSnapshot(value: readonly ToolDescriptor[] | ToolSourceSnapshot): value is ToolSourceSnapshot {
  return !Array.isArray(value)
}

function createFallbackSource(index: number): ToolSourceDescriptor {
  return {
    sourceId: `source_${index + 1}`,
  }
}

export function buildToolCatalogSignature(input: readonly ToolSourceSnapshot[]): string {
  return input
    .map((snapshot) => {
      const names = snapshot.tools
        .map((tool) => tool.name)
        .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
        .join(",")

      return [
        snapshot.source.sourceId,
        snapshot.source.signature ?? "-",
        names,
      ].join("|")
    })
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
    .join("\u0001")
}

export class DynamicToolRuntime implements DynamicToolRuntimePort {
  private readonly visibilityPolicy: ToolVisibilityPolicy

  constructor(private readonly options: DynamicToolRuntimeOptions) {
    this.visibilityPolicy = options.visibilityPolicy ?? new DefaultToolVisibilityPolicy()
  }

  async listSourceSnapshots(input: DynamicToolRuntimeInput): Promise<readonly ToolSourceSnapshot[]> {
    const snapshots: ToolSourceSnapshot[] = []

    for (const [index, source] of this.options.sources.entries()) {
      const listed = await source.listTools(input)
      if (isToolSourceSnapshot(listed)) {
        snapshots.push(cloneSnapshot(listed))
        continue
      }

      snapshots.push({
        source: createFallbackSource(index),
        tools: listed.map((tool) => cloneTool(tool)),
      })
    }

    return snapshots
  }

  async listCatalog(input: DynamicToolRuntimeInput): Promise<ToolCatalogSnapshot> {
    const sources = await this.listSourceSnapshots(input)
    const tools = await this.listTools(input)

    return {
      signature: buildToolCatalogSignature(sources),
      sources,
      tools,
    }
  }

  async listTools(input: DynamicToolRuntimeInput): Promise<readonly ToolDescriptor[]> {
    const tools: ToolDescriptor[] = []
    const knownNames = new Set<string>()
    const sourceSnapshots = await this.listSourceSnapshots(input)

    for (const snapshot of sourceSnapshots) {
      for (const tool of snapshot.tools) {
        if (knownNames.has(tool.name)) {
          continue
        }

        const visible = await this.visibilityPolicy.isVisible({
          ...input,
          tool,
          source: snapshot.source,
        })
        if (!visible) {
          continue
        }

        knownNames.add(tool.name)
        tools.push(decorateTool(tool, snapshot.source))
      }
    }

    return tools
  }
}
