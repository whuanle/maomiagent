import type { MessageRecordWithParts, RunRecord, SessionRecord, ToolDescriptor } from "../../core"
import type { ToolSourceDescriptor } from "./dynamic-tool-runtime"

export type ToolVisibilityInput = {
  session: SessionRecord
  run: RunRecord
  visibleMessages: readonly MessageRecordWithParts[]
  tool: ToolDescriptor
  source: ToolSourceDescriptor
}

export interface ToolVisibilityPolicy {
  isVisible(input: ToolVisibilityInput): Promise<boolean>
}

type DefaultToolVisibilityPolicyOptions = {
  hiddenToolNames?: readonly string[]
  hiddenSourceIds?: readonly string[]
}

function readBooleanMetadata(value: { metadata?: Record<string, unknown> }, key: string): boolean | undefined {
  const metadataValue = value.metadata?.[key]
  return typeof metadataValue === "boolean" ? metadataValue : undefined
}

function readTrimmedStringMetadata(value: { metadata?: Record<string, unknown> }, key: string): string | undefined {
  const metadataValue = value.metadata?.[key]
  return typeof metadataValue === "string" && metadataValue.trim()
    ? metadataValue.trim()
    : undefined
}

export class DefaultToolVisibilityPolicy implements ToolVisibilityPolicy {
  private readonly hiddenToolNames: ReadonlySet<string>
  private readonly hiddenSourceIds: ReadonlySet<string>

  constructor(options: DefaultToolVisibilityPolicyOptions = {}) {
    this.hiddenToolNames = new Set(options.hiddenToolNames ?? [])
    this.hiddenSourceIds = new Set(options.hiddenSourceIds ?? [])
  }

  async isVisible(input: ToolVisibilityInput): Promise<boolean> {
    if (this.hiddenToolNames.has(input.tool.name)) {
      return false
    }

    if (this.hiddenSourceIds.has(input.source.sourceId)) {
      return false
    }

    if (readBooleanMetadata(input.source, "hidden") === true) {
      return false
    }

    if (readBooleanMetadata(input.source, "disabled") === true) {
      return false
    }

    const requiredSourceId = readTrimmedStringMetadata(input.tool, "requiredSourceId")
    if (requiredSourceId && requiredSourceId !== input.source.sourceId) {
      return false
    }

    if (readBooleanMetadata(input.tool, "hidden") === true) {
      return false
    }

    if (readBooleanMetadata(input.tool, "disabled") === true) {
      return false
    }

    return true
  }
}
