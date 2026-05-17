export type ConversationCodeBlockPreviewKind =
  | "markdown-document"
  | "diagram-spec"
  | "chart-spec"
  | "source-code";

export type ConversationCodeBlockPreviewMode =
  | "markdown"
  | "diagram"
  | "chart"
  | "source";

type ParsedConversationCodeBlockInfo = {
  infoString: string;
  fenceLanguage: string;
  previewKind: ConversationCodeBlockPreviewKind;
};

const MARKDOWN_FENCE_LANGUAGES = new Set(["markdown", "md", "mdx"]);
const DIAGRAM_FENCE_LANGUAGES = new Set(["mermaid"]);
const CHART_FENCE_LANGUAGES = new Set([
  "chart",
  "charts",
  "echarts",
  "plotly",
  "vega",
  "vega-lite",
]);

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  chart: "Chart",
  css: "CSS",
  csv: "CSV",
  echarts: "ECharts",
  htm: "HTML",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  md: "Markdown",
  mdx: "MDX",
  mermaid: "Mermaid",
  plaintext: "Plain Text",
  plotly: "Plotly",
  python: "Python",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  text: "Text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  vega: "Vega",
  "vega-lite": "Vega-Lite",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

const MONACO_LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shell",
  css: "css",
  htm: "html",
  html: "html",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  mdx: "markdown",
  mermaid: "markdown",
  plaintext: "plaintext",
  python: "python",
  shell: "shell",
  sh: "shell",
  sql: "sql",
  text: "plaintext",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function normalizeConversationCodeBlockText(code: string): string {
  return code.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

export function parseConversationCodeBlockInfoString(
  infoString?: string,
): ParsedConversationCodeBlockInfo {
  const normalized = typeof infoString === "string" ? infoString.trim() : "";
  const fenceLanguage = normalized.split(/\s+/, 1)[0]?.trim().toLowerCase() ?? "";

  if (MARKDOWN_FENCE_LANGUAGES.has(fenceLanguage)) {
    return {
      infoString: normalized,
      fenceLanguage,
      previewKind: "markdown-document",
    };
  }

  if (DIAGRAM_FENCE_LANGUAGES.has(fenceLanguage)) {
    return {
      infoString: normalized,
      fenceLanguage,
      previewKind: "diagram-spec",
    };
  }

  if (CHART_FENCE_LANGUAGES.has(fenceLanguage)) {
    return {
      infoString: normalized,
      fenceLanguage,
      previewKind: "chart-spec",
    };
  }

  return {
    infoString: normalized,
    fenceLanguage,
    previewKind: "source-code",
  };
}

function resolveCodeFenceMarker(code: string): string {
  const runs = Array.from(code.matchAll(/`+/g), (match) => match[0].length);
  const width = Math.max(3, ...runs.map((count) => count + 1));
  return "`".repeat(width);
}

export function buildConversationCodeBlockPreviewMarkdown(input: {
  code: string;
  infoString?: string;
}): string {
  const normalizedCode = normalizeConversationCodeBlockText(input.code);
  const parsed = parseConversationCodeBlockInfoString(input.infoString);

  if (parsed.previewKind === "markdown-document") {
    return normalizedCode;
  }

  const fence = resolveCodeFenceMarker(normalizedCode);
  const fenceHeader = parsed.infoString ? `${fence}${parsed.infoString}` : fence;
  return `${fenceHeader}\n${normalizedCode}\n${fence}\n`;
}

export function resolveConversationCodeBlockPreviewMode(input: {
  previewKind?: ConversationCodeBlockPreviewKind | null;
  fenceLanguage?: string | null;
}): ConversationCodeBlockPreviewMode {
  const previewKind = input.previewKind ?? "source-code";
  const fenceLanguage = input.fenceLanguage?.trim().toLowerCase() ?? "";

  if (previewKind === "diagram-spec" || DIAGRAM_FENCE_LANGUAGES.has(fenceLanguage)) {
    return "diagram";
  }

  if (previewKind === "chart-spec" || CHART_FENCE_LANGUAGES.has(fenceLanguage)) {
    return "chart";
  }

  if (previewKind === "markdown-document") {
    return "markdown";
  }

  return "source";
}

export function resolveConversationCodeBlockMonacoLanguage(
  fenceLanguage?: string | null,
): string {
  const normalized = fenceLanguage?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "plaintext";
  }
  return MONACO_LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function resolveConversationCodeBlockLanguageLabel(
  fenceLanguage?: string | null,
): string | undefined {
  const normalized = fenceLanguage?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return undefined;
  }

  return LANGUAGE_LABELS[normalized] ?? normalized;
}