import { memo, useEffect, useMemo, useRef } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import { ConversationMessageCodeBlock } from "./conversation-message-code-block";
import {
  parseConversationMessageBlocks,
  parseConversationMessageBlocksDetailed,
} from "./message-content-model";
import type { ConversationMessageBlock } from "./message-content-types";
import type { ConversationMessageCodePreviewPayload } from "./message-content-shared";
import {
  renderConversationInlineLines,
  renderConversationInlineText,
} from "./message-content-inline-render";

type Props = {
  content: string;
  appendedSyntheticCodeFence?: boolean;
  language: LanguageCode;
  onPreviewCodeBlock?: (
    payload: ConversationMessageCodePreviewPayload,
  ) => void | Promise<void>;
};

export type ConversationMessageStreamingLiteBlockEntry = {
  key: string;
  block: ConversationMessageBlock;
  startOffset: number;
  endOffset: number;
};

export type ConversationMessageStreamingLiteRenderModel = {
  content: string;
  appendedSyntheticCodeFence: boolean;
  entries: ConversationMessageStreamingLiteBlockEntry[];
};

type StreamingLiteBlockViewProps = {
  block: ReturnType<typeof parseConversationMessageBlocks>[number];
  language: LanguageCode;
  onPreviewCodeBlock?: (
    payload: ConversationMessageCodePreviewPayload,
  ) => void | Promise<void>;
};

const SYNTHETIC_CODE_FENCE_SUFFIX = "\n```";

function buildConversationMessageStreamingLiteEntries(
  content: string,
  baseOffset = 0,
): ConversationMessageStreamingLiteBlockEntry[] {
  return parseConversationMessageBlocksDetailed(content).map((entry, index) => ({
    key: `${entry.block.kind}:${baseOffset + entry.startOffset}:${baseOffset + entry.endOffset}:${index}`,
    block: entry.block,
    startOffset: baseOffset + entry.startOffset,
    endOffset: baseOffset + entry.endOffset,
  }));
}

export function buildConversationMessageStreamingLiteRenderModel(input: {
  content: string;
  appendedSyntheticCodeFence?: boolean;
  previous?: ConversationMessageStreamingLiteRenderModel | null;
}): ConversationMessageStreamingLiteRenderModel {
  const previous = input.previous;
  const appendedSyntheticCodeFence = input.appendedSyntheticCodeFence === true;
  const canReuseAfterSyntheticFence = Boolean(
    previous
    && previous.appendedSyntheticCodeFence
    && previous.entries.length > 1
    && previous.entries[previous.entries.length - 1]?.block.kind === "code"
    && previous.content.endsWith(SYNTHETIC_CODE_FENCE_SUFFIX)
    && input.content.startsWith(previous.content.slice(0, -SYNTHETIC_CODE_FENCE_SUFFIX.length)),
  );

  if (
    previous
    && input.content.startsWith(previous.content)
    && previous.entries.length > 1
  ) {
    const stableCount = previous.entries.length - 1;
    const reparseStartOffset = previous.entries[stableCount]?.startOffset ?? 0;
    return {
      content: input.content,
      appendedSyntheticCodeFence,
      entries: [
        ...previous.entries.slice(0, stableCount),
        ...buildConversationMessageStreamingLiteEntries(
          input.content.slice(reparseStartOffset),
          reparseStartOffset,
        ),
      ],
    };
  }

  if (previous && canReuseAfterSyntheticFence) {
    const stableCount = previous.entries.length - 1;
    const reparseStartOffset = previous.entries[stableCount]?.startOffset ?? 0;
    return {
      content: input.content,
      appendedSyntheticCodeFence,
      entries: [
        ...previous.entries.slice(0, stableCount),
        ...buildConversationMessageStreamingLiteEntries(
          input.content.slice(reparseStartOffset),
          reparseStartOffset,
        ),
      ],
    };
  }

  return {
    content: input.content,
    appendedSyntheticCodeFence,
    entries: buildConversationMessageStreamingLiteEntries(input.content),
  };
}

function renderStreamingLiteBlock(input: {
  block: ReturnType<typeof parseConversationMessageBlocks>[number];
  language: LanguageCode;
  onPreviewCodeBlock?: (
    payload: ConversationMessageCodePreviewPayload,
  ) => void | Promise<void>;
}) {
  const { block } = input;

  if (block.kind === "heading") {
    return (
      <h4 className={`chat-message-content-heading is-level-${block.level}`}>
        {renderConversationInlineText(block.text)}
      </h4>
    );
  }

  if (block.kind === "blockquote") {
    return (
      <blockquote className="chat-message-content-quote">
        {renderConversationInlineLines(block.lines)}
      </blockquote>
    );
  }

  if (block.kind === "unordered-list") {
    return (
      <ul className="chat-message-content-list is-unordered">
        {block.items.map((item, index) => (
          <li key={`stream-ul-${index}`}>{renderConversationInlineLines(item.split("\n"))}</li>
        ))}
      </ul>
    );
  }

  if (block.kind === "ordered-list") {
    return (
      <ol className="chat-message-content-list is-ordered" start={block.start}>
        {block.items.map((item, index) => (
          <li key={`stream-ol-${index}`}>{renderConversationInlineLines(item.split("\n"))}</li>
        ))}
      </ol>
    );
  }

  if (block.kind === "divider") {
    return <hr className="chat-message-content-divider" />;
  }

  if (block.kind === "table") {
    return (
      <div className="chat-message-content-table-shell">
        <table className="chat-message-content-table">
          <thead>
            <tr>
              {block.headers.map((header, index) => (
                <th
                  key={`stream-th-${index}`}
                  align={block.aligns[index]}
                >
                  {renderConversationInlineLines(header.split("\n"))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`stream-tr-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`stream-td-${rowIndex}-${cellIndex}`}
                    align={block.aligns[cellIndex]}
                  >
                    {renderConversationInlineLines(cell.split("\n"))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.kind === "code") {
    return (
      <ConversationMessageCodeBlock
        code={block.code}
        infoString={block.infoString}
        language={input.language}
        onPreviewCodeBlock={input.onPreviewCodeBlock}
      />
    );
  }

  return (
    <p className="chat-message-content-paragraph">
      {renderConversationInlineLines(block.lines)}
    </p>
  );
}

export function areConversationMessageStreamingLiteBlockViewPropsEqual(
  prev: StreamingLiteBlockViewProps,
  next: StreamingLiteBlockViewProps,
) {
  return prev.block === next.block
    && prev.language === next.language
    && prev.onPreviewCodeBlock === next.onPreviewCodeBlock;
}

function ConversationMessageStreamingLiteBlockViewInner(props: StreamingLiteBlockViewProps) {
  return renderStreamingLiteBlock(props);
}

const ConversationMessageStreamingLiteBlockView = memo(
  ConversationMessageStreamingLiteBlockViewInner,
  areConversationMessageStreamingLiteBlockViewPropsEqual,
);

export function ConversationMessageContentLite(props: Props) {
  const cacheRef = useRef<ConversationMessageStreamingLiteRenderModel | null>(null);
  const renderModel = useMemo(
    () => buildConversationMessageStreamingLiteRenderModel({
      content: props.content,
      appendedSyntheticCodeFence: props.appendedSyntheticCodeFence,
      previous: cacheRef.current,
    }),
    [props.appendedSyntheticCodeFence, props.content],
  );

  useEffect(() => {
    cacheRef.current = renderModel;
  }, [renderModel]);

  if (renderModel.entries.length === 0) {
    return null;
  }

  return (
    <div className="chat-message-content">
      {renderModel.entries.map((entry) => (
        <ConversationMessageStreamingLiteBlockView
          key={entry.key}
          block={entry.block}
          language={props.language}
          onPreviewCodeBlock={props.onPreviewCodeBlock}
        />
      ))}
    </div>
  );
}

export const ConversationMessageStreamingLite = ConversationMessageContentLite;

export default ConversationMessageContentLite;