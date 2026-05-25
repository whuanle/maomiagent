import hljs from "highlight.js"

const FEISHU_DOCS_HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string | undefined> = {
  bash: "bash",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  csharp: "csharp",
  css: "css",
  csv: undefined,
  diff: "diff",
  go: "go",
  golang: "go",
  graphql: undefined,
  html: "xml",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  markdown: "markdown",
  md: "markdown",
  mdx: "markdown",
  mermaid: undefined,
  php: "php",
  powershell: "powershell",
  py: "python",
  python: "python",
  rs: "rust",
  ruby: "ruby",
  rust: "rust",
  scala: "scala",
  shell: "bash",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  text: undefined,
  toml: undefined,
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
}

export function resolveFeishuDocsHighlightLanguage(language?: string): string | undefined {
  const normalized = language?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (Object.prototype.hasOwnProperty.call(FEISHU_DOCS_HIGHLIGHT_LANGUAGE_ALIASES, normalized)) {
    return FEISHU_DOCS_HIGHLIGHT_LANGUAGE_ALIASES[normalized]
  }
  return normalized
}

export function renderHighlightedFeishuDocsCode(input: {
  code: string
  language?: string
}): {
  html: string | null
  language?: string
} {
  const code = input.code
  if (!code) {
    return { html: null }
  }

  const explicitLanguage = resolveFeishuDocsHighlightLanguage(input.language)
  if (explicitLanguage && hljs.getLanguage(explicitLanguage)) {
    try {
      return {
        html: hljs.highlight(code, {
          language: explicitLanguage,
          ignoreIllegals: true,
        }).value,
        language: explicitLanguage,
      }
    } catch {
      return { html: null, language: explicitLanguage }
    }
  }

  try {
    const autoDetected = hljs.highlightAuto(code)
    return {
      html: autoDetected.value || null,
      language: autoDetected.language,
    }
  } catch {
    return { html: null }
  }
}