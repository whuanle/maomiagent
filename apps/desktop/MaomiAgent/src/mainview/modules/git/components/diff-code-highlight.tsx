import { memo, useMemo } from "react";
import hljs from "highlight.js";

const BASENAME_LANGUAGE_ALIASES: Record<string, string | undefined> = {
  dockerfile: "dockerfile",
};

const EXTENSION_LANGUAGE_ALIASES: Record<string, string | undefined> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  cxx: "cpp",
  dockerfile: "dockerfile",
  go: "go",
  h: "cpp",
  hpp: "cpp",
  htm: "xml",
  html: "xml",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  ps1: "powershell",
  psm1: "powershell",
  py: "python",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  toml: "yaml",
  ts: "typescript",
  tsx: "typescript",
  txt: undefined,
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

function resolveDiffHighlightLanguage(path: string) {
  const normalizedPath = path.trim().replaceAll("\\", "/");
  const basename = normalizedPath.split("/").pop()?.toLowerCase() ?? "";
  if (!basename) {
    return undefined;
  }

  const basenameLanguage = BASENAME_LANGUAGE_ALIASES[basename];
  if (basenameLanguage !== undefined) {
    return basenameLanguage;
  }

  const extension = basename.includes(".")
    ? basename.split(".").pop()?.trim().toLowerCase() ?? ""
    : "";

  if (!extension) {
    return undefined;
  }

  return EXTENSION_LANGUAGE_ALIASES[extension] ?? extension;
}

function renderHighlightedCode(input: {
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

type Props = {
  path: string;
  code: string;
  className?: string;
  enabled?: boolean;
};

export const DiffCodeHighlight = memo(function DiffCodeHighlight(props: Props) {
  const highlightEnabled = props.enabled !== false;
  const language = useMemo(
    () => (highlightEnabled ? resolveDiffHighlightLanguage(props.path) : undefined),
    [highlightEnabled, props.path],
  );
  const highlightedHtml = useMemo(
    () => renderHighlightedCode({
      code: props.code,
      language,
    }),
    [language, props.code],
  );
  const className = props.className
    ? `git-page-diff-code ${props.className}`
    : "git-page-diff-code";

  if (!highlightEnabled || !highlightedHtml) {
    return (
      <span className={className}>
        {props.code.length > 0 ? props.code : "\u00A0"}
      </span>
    );
  }

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
});
