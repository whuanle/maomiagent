import hljs from "highlight.js";

const HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string | undefined> = {
  bash: "bash",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  csharp: "csharp",
  css: "css",
  csv: undefined,
  diff: "diff",
  excalidraw: "json",
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
};

export function resolveConversationCodeHighlightLanguage(infoLanguage: string) {
  if (!infoLanguage) {
    return undefined;
  }

  if (Object.hasOwn(HIGHLIGHT_LANGUAGE_ALIASES, infoLanguage)) {
    return HIGHLIGHT_LANGUAGE_ALIASES[infoLanguage];
  }

  return infoLanguage;
}

export function renderConversationCodeHighlight(input: {
  code: string;
  language?: string;
}) {
  if (!input.language || !input.code) {
    return null;
  }

  if (!hljs.getLanguage(input.language)) {
    return null;
  }

  try {
    return hljs.highlight(input.code, {
      language: input.language,
      ignoreIllegals: true,
    }).value;
  } catch {
    return null;
  }
}