import { Segmented, Spin, Typography } from "antd";
import { useMemo, useState } from "react";

import type { DesktopGitReviewItem } from "../../../../shared/desktop-git";
import type { GitPageCopy } from "../i18n";
import { DiffCodeHighlight } from "./diff-code-highlight";
import { WorkspaceDiffChanges } from "./diff-changes";
import { WorkspaceFileIcon } from "./file-icon";
import {
  buildWorkspaceReviewSplitRows,
  buildWorkspaceReviewUnifiedLines,
  resolveWorkspaceReviewStatusClass,
  resolveWorkspaceReviewUnifiedPatch,
  splitWorkspaceReviewDirectory,
  type ReviewDiffStyle,
} from "./review-model";

const { Text } = Typography;
const MAX_REVIEW_SYNTAX_HIGHLIGHT_CHANGED_LINES = 180;
const MAX_REVIEW_SYNTAX_HIGHLIGHT_TOTAL_CHARS = 18_000;

type Props = {
  copy: GitPageCopy;
  item: DesktopGitReviewItem | null;
  loading?: boolean;
  error?: string | null;
  emptyDescription: string;
};

function renderLineNumber(value?: number) {
  return value === undefined ? "" : String(value);
}

export function GitDiffPreview(props: Props) {
  const [style, setStyle] = useState<ReviewDiffStyle>("unified");

  const resolvedPatch = useMemo(() => {
    return props.item ? resolveWorkspaceReviewUnifiedPatch(props.copy, props.item) : "";
  }, [props.copy, props.item]);

  const unifiedLines = useMemo(() => {
    return resolvedPatch ? buildWorkspaceReviewUnifiedLines(resolvedPatch) : [];
  }, [resolvedPatch]);

  const splitRows = useMemo(() => {
    if (!props.item) {
      return [];
    }
    return buildWorkspaceReviewSplitRows({
      patch: resolvedPatch,
      before: props.item.before,
      after: props.item.after,
    });
  }, [props.item, resolvedPatch]);

  const highlightCode = useMemo(() => {
    if (!props.item) {
      return false;
    }

    const changedLines = props.item.additions + props.item.deletions;
    const totalChars = props.item.patch.length + props.item.before.length + props.item.after.length;
    return changedLines <= MAX_REVIEW_SYNTAX_HIGHLIGHT_CHANGED_LINES
      && totalChars <= MAX_REVIEW_SYNTAX_HIGHLIGHT_TOTAL_CHARS;
  }, [props.item]);

  if (props.loading) {
    return (
      <div className="git-page-preview-empty">
        <Spin />
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="git-page-preview-empty">
        <Text type="secondary">{props.error}</Text>
      </div>
    );
  }

  if (!props.item) {
    return (
      <div className="git-page-preview-empty">
        <Text type="secondary">{props.emptyDescription}</Text>
      </div>
    );
  }

  const item = props.item;
  const pathParts = splitWorkspaceReviewDirectory(item.path);
  const statusClassName = resolveWorkspaceReviewStatusClass(item.status);

  return (
    <div className="git-page-preview-shell">
      <div className="git-page-preview-head">
        <div className="git-page-preview-path">
          <WorkspaceFileIcon path={item.path} className="git-page-review-file-icon" />
          <div className="git-page-preview-path-copy">
            <div className="git-page-preview-title-row">
              <Text className="git-page-preview-name">{pathParts.filename}</Text>
              <span className={`git-page-review-status ${statusClassName}`}>
                {props.copy.statusText(item.status)}
              </span>
            </div>
            {pathParts.directory ? (
              <div className="git-page-preview-directory">{pathParts.directory}</div>
            ) : null}
            {item.previousPath ? (
              <div className="git-page-preview-rename">{props.copy.renamedFrom(item.previousPath)}</div>
            ) : null}
          </div>
        </div>
        <div className="git-page-preview-head-actions">
          <WorkspaceDiffChanges changes={item} />
          <Segmented
            size="small"
            value={style}
            onChange={(value) => setStyle(value as ReviewDiffStyle)}
            options={[
              { label: props.copy.unifiedView, value: "unified" },
              { label: props.copy.splitView, value: "split" },
            ]}
          />
        </div>
      </div>
      <div className="git-page-preview-body">
        {style === "split" ? (
          <div className="chat-review-split">
            <div className="chat-review-split-toolbar">
              <span>{props.copy.beforeLabel}</span>
              <span>{props.copy.afterLabel}</span>
            </div>
            <div className="chat-review-split-body">
              {splitRows.map((row) => {
                if (row.kind === "hunk") {
                  return (
                    <div key={row.key} className="chat-review-split-row is-hunk">
                      <div className="chat-review-split-hunk">{row.header}</div>
                    </div>
                  );
                }

                if (row.kind === "meta") {
                  return (
                    <div key={row.key} className="chat-review-split-row is-meta">
                      <div className="chat-review-split-meta">{row.text}</div>
                    </div>
                  );
                }

                return (
                  <div key={row.key} className="chat-review-split-row">
                    <div className={`chat-review-split-cell is-before is-${row.before.tone}`}>
                      <span className="chat-review-split-line-number">{renderLineNumber(row.before.lineNumber)}</span>
                      <span className="chat-review-split-marker">{row.before.marker}</span>
                      <DiffCodeHighlight
                        path={item.path}
                        code={row.before.text || ""}
                        className="chat-review-split-line-text"
                        enabled={highlightCode}
                      />
                    </div>
                    <div className={`chat-review-split-cell is-after is-${row.after.tone}`}>
                      <span className="chat-review-split-line-number">{renderLineNumber(row.after.lineNumber)}</span>
                      <span className="chat-review-split-marker">{row.after.marker}</span>
                      <DiffCodeHighlight
                        path={item.path}
                        code={row.after.text || ""}
                        className="chat-review-split-line-text"
                        enabled={highlightCode}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="chat-review-unified">
            {unifiedLines.map((line) => {
              if (line.tone === "hunk") {
                return null;
              }

              return (
                <div key={line.key} className={`chat-review-unified-line is-${line.tone}`}>
                  <span className={`chat-review-unified-prefix is-${line.tone}`} aria-hidden="true">
                    {line.line[0] ?? " "}
                  </span>
                  {line.tone === "meta" ? (
                    <span className="chat-review-unified-text">{line.line.length > 0 ? line.line : "\u00A0"}</span>
                  ) : (
                    <DiffCodeHighlight
                      path={item.path}
                      code={line.line.length > 0 ? line.line.slice(1) : ""}
                      className="chat-review-unified-text"
                      enabled={highlightCode}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}