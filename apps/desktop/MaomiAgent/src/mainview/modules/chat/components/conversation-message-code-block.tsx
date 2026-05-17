import { CopyOutlined, EyeOutlined } from "@ant-design/icons";
import { useMemo } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import {
  renderConversationCodeHighlight,
  resolveConversationCodeHighlightLanguage,
} from "./conversation-code-highlight";
import { resolveConversationMessageCodeBlockLabel } from "./message-content-model";
import type { ConversationMessageCodePreviewPayload } from "./message-content-shared";

type Props = {
  code: string;
  infoString?: string;
  language: LanguageCode;
  onPreviewCodeBlock?: (payload: ConversationMessageCodePreviewPayload) => void | Promise<void>;
};


export function ConversationMessageCodeBlock(props: Props) {
  const normalizedCode = useMemo(
    () => props.code.replace(/\r\n/g, "\n").replace(/\n$/, ""),
    [props.code],
  );
  const normalizedLanguage = useMemo(
    () => props.infoString?.trim().toLowerCase().split(/\s+/, 1)[0] ?? "",
    [props.infoString],
  );
  const label = useMemo(() => resolveConversationMessageCodeBlockLabel({
    infoString: props.infoString,
    language: props.language,
  }), [props.infoString, props.language]);
  const displayLabel = normalizedLanguage || label;
  const highlightLanguage = useMemo(
    () => resolveConversationCodeHighlightLanguage(normalizedLanguage),
    [normalizedLanguage],
  );
  const highlightedHtml = useMemo(
    () => renderConversationCodeHighlight({
      code: normalizedCode,
      language: highlightLanguage,
    }),
    [highlightLanguage, normalizedCode],
  );
  const actionItems = useMemo(() => {
    return {
      copyLabel: props.language === "en-US" ? "Copy" : "复制",
      previewLabel: props.language === "en-US" ? "Preview" : "预览",
    };
  }, [props.language]);
  const headerNode = (
    <div className="chat-message-code-block-streaming-lite-header">
      <span className="chat-message-code-block-label">
        {displayLabel}
      </span>
      <div className="chat-message-code-block-header-actions">
        <button
          type="button"
          className="chat-message-code-block-streaming-lite-action"
          aria-label={actionItems.copyLabel}
          title={actionItems.copyLabel}
          onClick={() => {
            void navigator.clipboard.writeText(props.code).catch(() => undefined);
          }}
        >
          <CopyOutlined />
        </button>
        {props.onPreviewCodeBlock ? (
          <button
            type="button"
            className="chat-message-code-block-streaming-lite-action chat-message-code-block-preview-button"
            aria-label={actionItems.previewLabel}
            title={actionItems.previewLabel}
            onClick={() => {
              void props.onPreviewCodeBlock?.({
                code: props.code,
                infoString: props.infoString,
              });
            }}
          >
            <EyeOutlined />
            <span className="chat-message-code-block-action-label">{actionItems.previewLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );

  if (!highlightLanguage || !highlightedHtml) {
    return (
      <section
        className="chat-message-code-block chat-message-code-block-fallback-shell"
        data-language={normalizedLanguage || undefined}
      >
        {headerNode}
        <div className="chat-message-code-block-fallback" role="presentation">
          <pre className="chat-message-code-block-fallback-pre">
            <code className="chat-message-code-block-fallback-code">
              {normalizedCode}
            </code>
          </pre>
        </div>
      </section>
    );
  }

  return (
    <section
      className="chat-message-code-block chat-message-code-block-fallback-shell"
      data-language={normalizedLanguage || undefined}
    >
      {headerNode}
      <div className="chat-message-code-block-fallback" role="presentation">
        <pre className="chat-message-code-block-fallback-pre">
          <code
            className={`chat-message-code-block-fallback-code hljs language-${highlightLanguage}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      </div>
    </section>
  );
}