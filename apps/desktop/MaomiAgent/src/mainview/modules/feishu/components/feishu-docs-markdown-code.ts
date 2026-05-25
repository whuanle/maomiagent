export function isMarkdownIndentedCodeLine(line: string): boolean {
  return /^ {4}/.test(line) || /^\t/.test(line)
}

function stripMarkdownIndentedCodePrefix(line: string): string {
  if (line.startsWith("\t")) {
    return line.slice(1)
  }
  if (line.startsWith("    ")) {
    return line.slice(4)
  }
  return line
}

export function parseMarkdownIndentedCodeBlock(lines: string[], startIndex: number): {
  block: {
    kind: "code_block"
    code: string
  }
  nextIndex: number
} | null {
  const firstLine = lines[startIndex] ?? ""
  if (!isMarkdownIndentedCodeLine(firstLine)) {
    return null
  }

  const codeLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (!line.trim()) {
      codeLines.push("")
      index += 1
      continue
    }
    if (!isMarkdownIndentedCodeLine(line)) {
      break
    }
    codeLines.push(stripMarkdownIndentedCodePrefix(line))
    index += 1
  }

  while (codeLines.length > 0 && !codeLines[0]?.trim()) {
    codeLines.shift()
  }
  while (codeLines.length > 0 && !codeLines[codeLines.length - 1]?.trim()) {
    codeLines.pop()
  }

  return {
    block: {
      kind: "code_block",
      code: codeLines.join("\n"),
    },
    nextIndex: index,
  }
}