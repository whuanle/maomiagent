export type FeishuDocsEmbeddedNativeBlockSegment =
  | {
    kind: "markdown"
    text: string
  }
  | {
    kind: "native_block"
    name: "undefined"
    attributes: Record<string, string>
  }

const ATTRIBUTE_PATTERN = /([A-Za-z_:][\w:.-]*)(?:=(?:"([^"]*)"|'([^']*)'|{([^}]*)}|([^\s"'=<>`]+)))?/g
const UNDEFINED_BLOCK_PATTERN = /^<(?:feishu-)?undefined\b([\s\S]*?)(?:\/\s*>|>\s*<\/(?:feishu-)?undefined\s*>)$/i
const LEGACY_UNDEFINED_DIVIDER_ATTRIBUTE_NAMES = new Set(["blockid", "block-id", "id"])

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n")
}

function parseTagAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  let match: RegExpExecArray | null

  while ((match = ATTRIBUTE_PATTERN.exec(source)) !== null) {
    const name = match[1]?.trim()
    if (!name) {
      continue
    }

    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "true"
    attributes[name] = value.trim()
  }

  return attributes
}

function parseUndefinedBlockLine(line: string): Extract<FeishuDocsEmbeddedNativeBlockSegment, { kind: "native_block" }> | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const match = UNDEFINED_BLOCK_PATTERN.exec(trimmed)
  if (!match) {
    return null
  }

  return {
    kind: "native_block",
    name: "undefined",
    attributes: parseTagAttributes(match[1] ?? ""),
  }
}

export function splitFeishuDocsEmbeddedNativeBlocks(markdown: string): FeishuDocsEmbeddedNativeBlockSegment[] {
  const lines = normalizeMarkdown(markdown).split("\n")
  const segments: FeishuDocsEmbeddedNativeBlockSegment[] = []
  const markdownLines: string[] = []

  const flushMarkdown = () => {
    const text = markdownLines.join("\n").trim()
    markdownLines.length = 0
    if (!text) {
      return
    }
    segments.push({
      kind: "markdown",
      text,
    })
  }

  for (const line of lines) {
    const nativeBlock = parseUndefinedBlockLine(line)
    if (!nativeBlock) {
      markdownLines.push(line)
      continue
    }

    flushMarkdown()
    segments.push(nativeBlock)
  }

  flushMarkdown()
  return segments
}

export function resolveFeishuDocsPreviewBlockName(input: {
  name: string
  attributes: Record<string, string>
  hasChildren: boolean
}): string {
  if (input.name !== "undefined" || input.hasChildren) {
    return input.name
  }

  const attributeNames = Object.keys(input.attributes)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean)

  if (attributeNames.length === 0) {
    return input.name
  }

  return attributeNames.every((name) => LEGACY_UNDEFINED_DIVIDER_ATTRIBUTE_NAMES.has(name))
    ? "divider"
    : input.name
}