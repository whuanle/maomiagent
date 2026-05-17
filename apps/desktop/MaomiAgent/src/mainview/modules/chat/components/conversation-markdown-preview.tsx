import hljs from "highlight.js";
import {
  codeBlockPlugin,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type CodeBlockEditorDescriptor,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useMemo, type ReactNode } from "react";

import {
  normalizeConversationCodeBlockText,
  parseConversationCodeBlockInfoString,
  resolveConversationCodeBlockLanguageLabel,
  resolveConversationCodeBlockPreviewMode,
} from "../../../lib/conversation-code-block-preview";

type Props = {
  markdown: string;
  className?: string;
  renderEmbeddedCodeBlock?: (input: ConversationMarkdownEmbeddedCodeBlockInput) => ReactNode | undefined;
};

export type ConversationMarkdownEmbeddedCodeBlockInput = {
  code: string;
  infoString?: string;
  language?: string;
  meta?: string;
  previewMode: "markdown" | "diagram" | "chart" | "source";
};

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

function buildConversationMarkdownPreviewInfoString(language: string, meta: string) {
  const parts = [language.trim(), meta.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function resolveConversationMarkdownPreviewHighlightLanguage(infoLanguage: string) {
  if (!infoLanguage) {
    return undefined;
  }

  return HIGHLIGHT_LANGUAGE_ALIASES[infoLanguage] ?? infoLanguage;
}

function renderHighlightedConversationMarkdownPreviewCode(input: {
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

function ConversationMarkdownPreviewStaticCodeBlock(props: {
  code: string;
  infoString?: string;
}) {
  const normalizedCode = normalizeConversationCodeBlockText(props.code);
  const parsedInfo = parseConversationCodeBlockInfoString(props.infoString);
  const languageLabel = resolveConversationCodeBlockLanguageLabel(parsedInfo.fenceLanguage)
    ?? (parsedInfo.fenceLanguage || undefined);
  const highlightLanguage = useMemo(
    () => resolveConversationMarkdownPreviewHighlightLanguage(parsedInfo.fenceLanguage),
    [parsedInfo.fenceLanguage],
  );
  const highlightedHtml = useMemo(
    () => renderHighlightedConversationMarkdownPreviewCode({
      code: normalizedCode,
      language: highlightLanguage,
    }),
    [highlightLanguage, normalizedCode],
  );

  return (
    <section
      className="conversation-markdown-preview-code-block"
      data-language={parsedInfo.fenceLanguage || undefined}
    >
      {languageLabel ? (
        <div className="conversation-markdown-preview-code-block-head">
          <span className="conversation-markdown-preview-code-block-language">{languageLabel}</span>
        </div>
      ) : null}
      <pre className="conversation-markdown-preview-code-block-pre">
        {highlightLanguage && highlightedHtml ? (
          <code
            className={`conversation-markdown-preview-code-block-code chat-message-code-block-fallback-code hljs language-${highlightLanguage}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <code className="conversation-markdown-preview-code-block-code chat-message-code-block-fallback-code">
            {normalizedCode}
          </code>
        )}
      </pre>
    </section>
  );
}

export function ConversationMarkdownPreview(props: Props) {
  const codeBlockDescriptor = useMemo<CodeBlockEditorDescriptor>(
    () => ({
      match: () => true,
      priority: 100,
      Editor: (editorProps) => {
        const infoString = buildConversationMarkdownPreviewInfoString(editorProps.language, editorProps.meta);
        const parsedInfo = parseConversationCodeBlockInfoString(infoString);
        const previewMode = resolveConversationCodeBlockPreviewMode({
          previewKind: parsedInfo.previewKind,
          fenceLanguage: parsedInfo.fenceLanguage,
        });
        const embeddedPreview = props.renderEmbeddedCodeBlock?.({
          code: editorProps.code,
          infoString,
          language: editorProps.language,
          meta: editorProps.meta,
          previewMode,
        });

        if (embeddedPreview !== undefined) {
          return <>{embeddedPreview}</>;
        }

        return (
          <ConversationMarkdownPreviewStaticCodeBlock
            code={editorProps.code}
            infoString={infoString}
          />
        );
      },
    }),
    [props.renderEmbeddedCodeBlock],
  );
  const plugins = useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
      quotePlugin(),
      listsPlugin(),
      linkPlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      codeBlockPlugin({
        defaultCodeBlockLanguage: "text",
        codeBlockEditorDescriptors: [codeBlockDescriptor],
      }),
    ],
    [codeBlockDescriptor],
  );

  return (
    <MDXEditor
      key={props.markdown}
      markdown={props.markdown}
      readOnly
      trim={false}
      spellCheck={false}
      className={`conversation-markdown-preview ${props.className ?? ""}`.trim()}
      contentEditableClassName="conversation-markdown-preview-content"
      plugins={plugins}
    />
  );
}

export default ConversationMarkdownPreview;