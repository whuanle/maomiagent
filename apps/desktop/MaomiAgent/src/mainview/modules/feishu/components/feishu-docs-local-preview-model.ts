import { FEISHU_DOCS_TAG_SPECS, normalizeFeishuDocsTagName } from "./feishu-docs-tag-spec"

export type FeishuDocsPreviewNode =
  | {
    kind: "markdown"
    key: string
    markdown: string
  }
  | {
    kind: "native_block"
    key: string
    name: string
    raw: string
    attributes: Record<string, string>
    children: FeishuDocsPreviewNode[]
  }

type FeishuDocsParsedTag = {
  name: string
  attributes: Record<string, string>
  selfClosing: boolean
}

const FEISHU_DOCS_PREVIEW_TAGS = new Set([
  ...FEISHU_DOCS_TAG_SPECS
    .filter((item) => item.kind === "flow")
    .map((item) => item.name),
  "ai-template",
  "isv",
  "lark-table",
  "lark-tbody",
  "lark-thead",
  "lark-th",
  "lark-tr",
  "lark-td",
  "quote-container",
  "undefined",
])

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n")
}

function shouldTreatAsNativeBlockTag(name: string): boolean {
  return FEISHU_DOCS_PREVIEW_TAGS.has(name)
}

function parseTagAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attributePattern = /([A-Za-z_:][\w:.-]*)(?:=(?:"([^"]*)"|'([^']*)'|{([^}]*)}|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = attributePattern.exec(source)) !== null) {
    const name = match[1]?.trim()
    if (!name) {
      continue
    }
    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "true"
    attributes[name] = value.trim()
  }
  return attributes
}

function parseTagStartLine(line: string): FeishuDocsParsedTag | null {
  const trimmed = line.trim()
  const match = /^<([A-Za-z][\w-]*)([\s\S]*?)(\/?)>$/.exec(trimmed)
  if (!match) {
    return null
  }
  const name = normalizeFeishuDocsTagName(match[1] ?? "")
  if (!shouldTreatAsNativeBlockTag(name)) {
    return null
  }
  return {
    name,
    attributes: parseTagAttributes(match[2] ?? ""),
    selfClosing: match[3] === "/",
  }
}

function isTagCloseLine(line: string, tagName: string): boolean {
  const match = /^<\/([A-Za-z][\w-]*)\s*>$/.exec(line.trim())
  if (!match) {
    return false
  }
  return normalizeFeishuDocsTagName(match[1] ?? "") === tagName
}

export function parseFeishuDocsLocalPreview(markdown: string): FeishuDocsPreviewNode[] {
  const normalizedMarkdown = normalizeMarkdown(markdown)
  if (!normalizedMarkdown.trim()) {
    return []
  }

  const lines = normalizedMarkdown.split("\n")
  const nodes: FeishuDocsPreviewNode[] = []
  const markdownBuffer: string[] = []
  let markdownNodeIndex = 0
  let nativeBlockIndex = 0
  let activeFence: string | null = null

  const flushMarkdownBuffer = () => {
    const markdownChunk = markdownBuffer.join("\n").trim()
    markdownBuffer.length = 0
    if (!markdownChunk) {
      return
    }
    nodes.push({
      kind: "markdown",
      key: `markdown:${markdownNodeIndex}`,
      markdown: markdownChunk,
    })
    markdownNodeIndex += 1
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const trimmed = line.trim()
    const fenceMatch = /^(```+|~~~+)/.exec(trimmed)
    if (fenceMatch) {
      const nextFence = fenceMatch[1]
      if (activeFence === nextFence) {
        activeFence = null
      } else if (activeFence === null) {
        activeFence = nextFence
      }
      markdownBuffer.push(line)
      continue
    }

    if (activeFence) {
      markdownBuffer.push(line)
      continue
    }

    const tagStart = parseTagStartLine(line)
    if (!tagStart) {
      markdownBuffer.push(line)
      continue
    }

    flushMarkdownBuffer()

    if (tagStart.selfClosing) {
      nodes.push({
        kind: "native_block",
        key: `native:${nativeBlockIndex}`,
        name: tagStart.name,
        raw: line.trim(),
        attributes: tagStart.attributes,
        children: [],
      })
      nativeBlockIndex += 1
      continue
    }

    const bodyLines: string[] = []
    let foundCloseTag = false
    let nestedFence: string | null = null
    let depth = 1

    for (let scanIndex = index + 1; scanIndex < lines.length; scanIndex += 1) {
      const bodyLine = lines[scanIndex] ?? ""
      const bodyTrimmed = bodyLine.trim()
      const bodyFenceMatch = /^(```+|~~~+)/.exec(bodyTrimmed)
      if (bodyFenceMatch) {
        const bodyFence = bodyFenceMatch[1]
        if (nestedFence === bodyFence) {
          nestedFence = null
        } else if (nestedFence === null) {
          nestedFence = bodyFence
        }
        bodyLines.push(bodyLine)
        continue
      }

      if (!nestedFence) {
        if (isTagCloseLine(bodyLine, tagStart.name)) {
          depth -= 1
          if (depth === 0) {
            foundCloseTag = true
            index = scanIndex
            break
          }
        }

        const nestedTagStart = parseTagStartLine(bodyLine)
        if (nestedTagStart?.name === tagStart.name && !nestedTagStart.selfClosing) {
          depth += 1
        }
      }

      bodyLines.push(bodyLine)
    }

    if (!foundCloseTag) {
      markdownBuffer.push(line)
      markdownBuffer.push(...bodyLines)
      continue
    }

    const bodyMarkdown = bodyLines.join("\n").trim()
    const raw = [
      line.trim(),
      bodyMarkdown,
      `</${tagStart.name}>`,
    ].filter(Boolean).join("\n")

    nodes.push({
      kind: "native_block",
      key: `native:${nativeBlockIndex}`,
      name: tagStart.name,
      raw,
      attributes: tagStart.attributes,
      children: parseFeishuDocsLocalPreview(bodyMarkdown),
    })
    nativeBlockIndex += 1
  }

  flushMarkdownBuffer()
  return nodes
}
