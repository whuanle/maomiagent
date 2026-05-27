import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir"

function stripMarkdownFencedCode(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const output: string[] = []
  let activeFence: string | null = null

  for (const line of lines) {
    const fenceMatch = /^(```+|~~~+)/.exec(line.trim())
    if (fenceMatch) {
      const fence = fenceMatch[1]
      if (activeFence === fence) {
        activeFence = null
      } else if (activeFence === null) {
        activeFence = fence
      }
      continue
    }

    if (!activeFence) {
      output.push(line)
    }
  }

  return output.join("\n")
}

export function extractFeishuMediaTokens(markdown: string): string[] {
  const source = stripMarkdownFencedCode(markdown)
  const tokens = new Set<string>()
  const pattern = /<(?:feishu-?)?(?:image|file)\b[^>]*\b(?:token|file-token|file_token)=(?:"([^"]+)"|'([^']+)'|{([^}]+)}|([^\s"'=<>`]+))/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ""
    const normalized = token.trim()
    if (normalized) {
      tokens.add(normalized)
    }
  }

  return [...tokens]
}

export function extractFeishuWhiteboardTokens(markdown: string): string[] {
  const source = stripMarkdownFencedCode(markdown)
  const tokens = new Set<string>()
  const pattern = /<(?:feishu-?)?(?:board|whiteboard|mindnote|diagram)\b[^>]*\b(?:token|whiteboard-token|whiteboard_token|mindnote-token|mindnote_token|diagram-token|diagram_token)=(?:"([^"]+)"|'([^']+)'|{([^}]+)}|([^\s"'=<>`]+))/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ""
    const normalized = token.trim()
    if (normalized) {
      tokens.add(normalized)
    }
  }

  return [...tokens]
}

export function createFeishuDocPreviewIR(input: {
  docId: string
  title: string
  markdown: string
}): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: input.docId,
      title: input.title,
      revisionId: "local-preview",
      rootBlockId: input.docId,
      pulledAt: new Date(0).toISOString(),
      source: { documentIdType: "document_id" },
    },
    blocks: {
      [input.docId]: {
        id: input.docId,
        type: "page",
        parentId: null,
        children: [],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
    },
    assets: {},
    integrity: {
      contentHash: `preview:${input.markdown.length}:${input.markdown}`,
      rawHash: `preview:${input.docId}`,
    },
  }
}