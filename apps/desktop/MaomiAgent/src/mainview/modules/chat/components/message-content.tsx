import { useMemo, type ReactNode } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import {
  ConversationMarkdownPreview,
  type ConversationMarkdownEmbeddedCodeBlockInput,
} from "./conversation-markdown-preview";
import { ConversationMessageCodeBlock } from "./conversation-message-code-block";
import {
  resolveConversationMessageContentRenderPlan,
} from "./message-content-render-mode";
import {
  hasConversationMessageUnfencedCodeBlock,
} from "./message-content-model";
import type {
  ConversationMessageCodePreviewPayload,
} from "./message-content-shared";
import { ConversationMessageContentLite } from "./message-content-streaming-lite";

export type {
  ConversationMessageCodePreviewPayload,
} from "./message-content-shared";

type Props = {
  content: string;
  language: LanguageCode;
  onPreviewCodeBlock?: (payload: ConversationMessageCodePreviewPayload) => void | Promise<void>;
  renderCodeBlock?: (payload: ConversationMessageCodePreviewPayload) => ReactNode | undefined;
  forceFullRender?: boolean;
};

function renderConversationMarkdownCodeBlock(input: {
  code: string;
  infoString?: string;
  language: LanguageCode;
  onPreviewCodeBlock?: (payload: ConversationMessageCodePreviewPayload) => void | Promise<void>;
  renderCodeBlock?: (payload: ConversationMessageCodePreviewPayload) => ReactNode | undefined;
}) {
  const payload = {
    code: input.code,
    infoString: input.infoString,
  };
  const customCodeBlock = input.renderCodeBlock?.(payload);
  if (customCodeBlock !== undefined) {
    return customCodeBlock;
  }

  return (
    <ConversationMessageCodeBlock
      code={input.code}
      infoString={input.infoString}
      language={input.language}
      onPreviewCodeBlock={input.onPreviewCodeBlock}
    />
  );
}

export function ConversationMessageContent(props: Props) {
  const renderPlan = useMemo(
    () => {
      const basePlan = resolveConversationMessageContentRenderPlan(props.content);
      if (!props.forceFullRender) {
        return basePlan;
      }

      return {
        ...basePlan,
        mode: "full" as const,
        reason: undefined,
      };
    },
    [props.content, props.forceFullRender],
  );
  const shouldFallbackToLite = useMemo(
    () => {
      if (renderPlan.mode === "lite") {
        return true;
      }

      return hasConversationMessageUnfencedCodeBlock(props.content);
    },
    [props.content, renderPlan.mode],
  );
  const renderEmbeddedCodeBlock = useMemo(
    () => (input: ConversationMarkdownEmbeddedCodeBlockInput) => renderConversationMarkdownCodeBlock({
      code: input.code,
      infoString: input.infoString,
      language: props.language,
      onPreviewCodeBlock: props.onPreviewCodeBlock,
      renderCodeBlock: props.renderCodeBlock,
    }),
    [props.language, props.onPreviewCodeBlock, props.renderCodeBlock],
  );

  if (!props.content.trim()) {
    return null;
  }

  if (shouldFallbackToLite) {
    return (
      <ConversationMessageContentLite
        content={props.content}
        language={props.language}
        onPreviewCodeBlock={props.onPreviewCodeBlock}
      />
    );
  }

  return (
    <div className="chat-message-content">
      <ConversationMarkdownPreview
        markdown={props.content}
        className="chat-message-markdown"
        renderEmbeddedCodeBlock={renderEmbeddedCodeBlock}
      />
    </div>
  );
}

export default ConversationMessageContent;