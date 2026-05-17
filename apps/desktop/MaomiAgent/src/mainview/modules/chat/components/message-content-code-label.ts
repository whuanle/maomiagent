import type { LanguageCode } from "../../../config/titlebar";

const MARKDOWN_FENCE_LANGUAGES = new Set(["markdown", "md", "mdx"]);

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  csv: "CSV",
  excalidraw: "Excalidraw",
  go: "Go",
  golang: "Go",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  md: "Markdown",
  mdx: "MDX",
  mermaid: "Mermaid",
  plantuml: "PlantUML",
  plaintext: "Plain Text",
  puml: "PlantUML",
  python: "Python",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  text: "Text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

export function resolveConversationMessageCodeBlockLabel(input: {
  infoString?: string;
  language: LanguageCode;
}) {
  const normalized = input.infoString?.trim().toLowerCase() ?? "";
  const fenceLanguage = normalized.split(/\s+/, 1)[0]?.trim() ?? "";

  if (!fenceLanguage) {
    return input.language === "en-US" ? "Code" : "代码";
  }

  if (MARKDOWN_FENCE_LANGUAGES.has(fenceLanguage)) {
    return "Markdown";
  }

  return LANGUAGE_LABELS[fenceLanguage] ?? fenceLanguage;
}