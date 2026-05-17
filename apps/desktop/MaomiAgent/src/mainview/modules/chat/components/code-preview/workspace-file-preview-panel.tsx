import {
  CodeOutlined,
  CopyOutlined,
  EyeOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import DOMPurify from "dompurify";
import { App, Button, Empty, Tag, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DesktopWorkspaceFileContentResult } from "../../../../../shared/desktop-workspace";
import {
  normalizeConversationCodeBlockText,
  parseConversationCodeBlockInfoString,
  resolveConversationCodeBlockMonacoLanguage,
  resolveConversationCodeBlockPreviewMode,
} from "../../../../lib/conversation-code-block-preview";
import { openDesktopPathInFileManager } from "../../../../lib/desktop-window";
import { useConversationWorkspaceSettings } from "../conversation-workspace-settings-storage";
import { resolveWorkspaceFileContainingDirectory } from "../workspace-file-location";
import { ConversationCodePreviewPanel } from "./conversation-code-preview-panel";
import { PreviewPanelSourceEditor, PreviewPanelToolbar } from "./preview-panel-shared";

type Props = {
  result: DesktopWorkspaceFileContentResult;
};

const TRUNCATED_PREVIEW_SEPARATOR = "\n\n[...]\n\n";
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);
const MERMAID_EXTENSIONS = new Set(["mmd", "mermaid"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const MERMAID_BLOCK_MARKERS = [
  "graph ",
  "flowchart ",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "mindmap",
  "timeline",
  "gitGraph",
  "pie ",
  "quadrantChart",
  "requirement",
  "xychart-beta",
  "block-beta",
  "sankey-beta",
  "packet-beta",
  "architecture-beta",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
];

function resolveWorkspaceFileExtension(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const basename = normalized.split("/").pop() ?? normalized;
  if (!basename.includes(".")) {
    return "";
  }
  return basename.split(".").pop()?.toLowerCase() ?? "";
}

function looksLikeMermaidSource(content: string) {
  const normalized = content.trimStart();
  if (!normalized) {
    return false;
  }

  return MERMAID_BLOCK_MARKERS.some((marker) => normalized.startsWith(marker));
}

function looksLikeHtmlSource(content: string) {
  const normalized = content.trimStart().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith("<!doctype html")
    || normalized.startsWith("<html")
    || normalized.includes("<body")
    || normalized.includes("<head");
}

function looksLikeSvgSource(content: string) {
  const normalized = content.trimStart().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith("<svg")
    || (normalized.startsWith("<?xml") && normalized.includes("<svg"));
}

function resolveWorkspaceFileInfoString(path: string, content: string, mimeType?: string) {
  const extension = resolveWorkspaceFileExtension(path);
  if (MARKDOWN_EXTENSIONS.has(extension) || mimeType?.startsWith("text/markdown")) {
    return "markdown";
  }
  if (MERMAID_EXTENSIONS.has(extension) || looksLikeMermaidSource(content)) {
    return "mermaid";
  }
  if (HTML_EXTENSIONS.has(extension) || mimeType?.startsWith("text/html") || looksLikeHtmlSource(content)) {
    return "html";
  }
  if (mimeType?.includes("json")) {
    return "json";
  }
  return extension || "text";
}

function resolveFileName(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").pop() || normalized;
}

function resolveActionErrorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "未知错误";
}

function resolveWorkspaceFileImagePreviewUrl(result: DesktopWorkspaceFileContentResult) {
  const mimeType = result.mimeType?.trim().toLowerCase();
  const extension = resolveWorkspaceFileExtension(result.path);
  const isSvg = mimeType === "image/svg+xml" || extension === "svg" || looksLikeSvgSource(result.content);

  if (isSvg) {
    if (!result.content.trim() || result.truncated) {
      return "";
    }

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.content)}`;
  }

  if (!mimeType?.startsWith("image/") || !result.previewBase64) {
    return "";
  }

  return `data:${mimeType};base64,${result.previewBase64}`;
}

function resolveWorkspaceFileHtmlPreviewMarkup(result: DesktopWorkspaceFileContentResult) {
  const mimeType = result.mimeType?.trim().toLowerCase();
  const extension = resolveWorkspaceFileExtension(result.path);
  const shouldPreview = !result.binary
    && !result.truncated
    && (HTML_EXTENSIONS.has(extension)
      || mimeType?.startsWith("text/html")
      || looksLikeHtmlSource(result.content));

  if (!shouldPreview || !result.content.trim()) {
    return "";
  }

  return DOMPurify.sanitize(result.content, {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true },
  });
}

function resolveWorkspaceFileDisplayContent(result: DesktopWorkspaceFileContentResult) {
  if (!result.truncated) {
    return result.content;
  }

  const head = result.previewHeadContent?.trimEnd();
  const tail = result.previewTailContent?.trimStart();
  if (!head || !tail) {
    return result.content;
  }

  return `${head}${TRUNCATED_PREVIEW_SEPARATOR}${tail}`;
}

type WorkspaceFileSourcePreviewProps = {
  path: string;
  content: string;
  monacoLanguage: string;
};

type WorkspaceFileHtmlPreviewProps = {
  fileName: string;
  content: string;
};

type WorkspaceFilePreviewToolbarProps = {
  displayPath: string;
  canToggleSource: boolean;
  showingSource: boolean;
  onToggleSource: () => void;
  onOpenFileLocation: () => void;
  onCopyFullPath: () => void;
};

function WorkspaceFilePreviewToolbar(props: WorkspaceFilePreviewToolbarProps) {
  const sourceToggleLabel = props.showingSource ? "切回预览" : "查看源码";

  return (
    <PreviewPanelToolbar
      displayPath={props.displayPath}
      actions={(
        <>
        {props.canToggleSource ? (
          <Tooltip title={sourceToggleLabel}>
            <Button
              type="text"
              size="small"
              className={`workspace-file-preview-panel-action${props.showingSource ? " is-active" : ""}`}
              icon={props.showingSource ? <EyeOutlined /> : <CodeOutlined />}
              aria-label={sourceToggleLabel}
              onClick={props.onToggleSource}
            />
          </Tooltip>
        ) : null}
        <Tooltip title="打开所在目录">
          <Button
            type="text"
            size="small"
            className="workspace-file-preview-panel-action"
            icon={<FolderOpenOutlined />}
            aria-label="打开所在目录"
            onClick={props.onOpenFileLocation}
          />
        </Tooltip>
        <Tooltip title="复制完整路径">
          <Button
            type="text"
            size="small"
            className="workspace-file-preview-panel-action"
            icon={<CopyOutlined />}
            aria-label="复制完整路径"
            onClick={props.onCopyFullPath}
          />
        </Tooltip>
        </>
      )}
    />
  );
}

function WorkspaceFileHtmlPreview(props: WorkspaceFileHtmlPreviewProps) {
  return (
    <div className="workspace-file-rich-preview-stage is-html">
      <iframe
        title={`${props.fileName} 预览`}
        className="workspace-file-rich-preview-iframe"
        sandbox=""
        srcDoc={props.content}
      />
    </div>
  );
}

export function WorkspaceFilePreviewPanel(props: Props) {
  const { message } = App.useApp();
  const { settings: workspaceSettings } = useConversationWorkspaceSettings(props.result.workspaceId);
  const fileName = resolveFileName(props.result.path);
  const [showSource, setShowSource] = useState(false);
  const mimeType = props.result.mimeType?.trim().toLowerCase();
  const displayMimeType = mimeType || "unknown";
  const displayContent = useMemo(
    () => resolveWorkspaceFileDisplayContent(props.result),
    [props.result],
  );
  const imagePreviewUrl = useMemo(
    () => resolveWorkspaceFileImagePreviewUrl(props.result),
    [props.result],
  );
  const htmlPreviewMarkup = useMemo(
    () => resolveWorkspaceFileHtmlPreviewMarkup(props.result),
    [props.result],
  );
  const isImageFile = Boolean(imagePreviewUrl || (props.result.binary && mimeType?.startsWith("image/")));
  const infoString = useMemo(
    () => resolveWorkspaceFileInfoString(props.result.path, props.result.content, props.result.mimeType),
    [props.result.content, props.result.mimeType, props.result.path],
  );
  const parsedInfo = useMemo(
    () => parseConversationCodeBlockInfoString(infoString),
    [infoString],
  );
  const previewMode = useMemo(
    () => resolveConversationCodeBlockPreviewMode({
      previewKind: parsedInfo.previewKind,
      fenceLanguage: parsedInfo.fenceLanguage,
    }),
    [parsedInfo.fenceLanguage, parsedInfo.previewKind],
  );
  const effectivePreviewMode = props.result.truncated ? "source" : previewMode;
  const normalizedContent = useMemo(
    () => normalizeConversationCodeBlockText(displayContent),
    [displayContent],
  );
  const monacoLanguage = useMemo(
    () => resolveConversationCodeBlockMonacoLanguage(parsedInfo.fenceLanguage),
    [parsedInfo.fenceLanguage],
  );
  const parentDirectoryPath = useMemo(
    () => resolveWorkspaceFileContainingDirectory({
      absolutePath: props.result.absolutePath,
      fallbackPath: props.result.rootPath,
    }),
    [props.result.absolutePath, props.result.rootPath],
  );
  const supportsRenderedPreview = !props.result.binary
    && !props.result.truncated
    && !isImageFile
    && (Boolean(htmlPreviewMarkup) || previewMode !== "source");
  const showingSource = !supportsRenderedPreview || props.result.truncated || showSource;

  useEffect(() => {
    setShowSource(workspaceSettings.defaultFilePreviewMode === "source");
  }, [props.result.absolutePath, workspaceSettings.defaultFilePreviewMode]);

  const handleToggleSource = useCallback(() => {
    if (!supportsRenderedPreview) {
      return;
    }
    setShowSource((current) => !current);
  }, [supportsRenderedPreview]);

  const handleCopyFullPath = useCallback(async () => {
    const writeText = globalThis.navigator?.clipboard?.writeText;
    if (typeof writeText !== "function") {
      message.error("当前环境不支持复制路径");
      return;
    }

    try {
      await writeText.call(globalThis.navigator.clipboard, props.result.absolutePath);
      message.success("已复制完整路径");
    } catch (error) {
      message.error(`复制路径失败：${resolveActionErrorText(error)}`);
    }
  }, [message, props.result.absolutePath]);

  const handleOpenFileLocation = useCallback(async () => {
    if (!parentDirectoryPath.trim()) {
      message.error("无法解析文件所在目录");
      return;
    }

    try {
      await openDesktopPathInFileManager(parentDirectoryPath);
    } catch (error) {
      message.error(`打开所在目录失败：${resolveActionErrorText(error)}`);
    }
  }, [message, parentDirectoryPath]);

  if (isImageFile) {
    return (
      <div className="workspace-file-rich-preview">
        <WorkspaceFilePreviewToolbar
          displayPath={props.result.path}
          canToggleSource={false}
          showingSource={false}
          onToggleSource={handleToggleSource}
          onOpenFileLocation={handleOpenFileLocation}
          onCopyFullPath={handleCopyFullPath}
        />
        <div className="workspace-file-rich-preview-head">
          <div className="workspace-file-rich-preview-summary">
            <div className="workspace-file-rich-preview-title">{fileName}</div>
            <div className="workspace-file-rich-preview-subtitle">{props.result.path}</div>
          </div>
          <div className="workspace-file-rich-preview-meta">
            <Tag className="workspace-file-rich-preview-tag">
              {mimeType === "image/svg+xml" ? "SVG" : "图片"}
            </Tag>
            <Tag className="workspace-file-rich-preview-tag is-soft">{displayMimeType}</Tag>
          </div>
        </div>
        {imagePreviewUrl ? (
          <div className="workspace-file-rich-preview-stage is-image">
            <img
              className="workspace-file-rich-preview-image"
              src={imagePreviewUrl}
              alt={fileName}
            />
          </div>
        ) : (
          <div className="conversation-code-preview-surface-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前图片暂不支持预览" />
          </div>
        )}
      </div>
    );
  }

  if (props.result.binary) {
    return (
      <div className="workspace-file-preview-panel">
        <WorkspaceFilePreviewToolbar
          displayPath={props.result.path}
          canToggleSource={false}
          showingSource={true}
          onToggleSource={handleToggleSource}
          onOpenFileLocation={handleOpenFileLocation}
          onCopyFullPath={handleCopyFullPath}
        />
        <div className="conversation-code-preview-surface-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前文件暂不支持预览" />
        </div>
      </div>
    );
  }

  if (htmlPreviewMarkup && !showingSource) {
    return (
      <div className="workspace-file-rich-preview">
        <WorkspaceFilePreviewToolbar
          displayPath={props.result.path}
          canToggleSource={supportsRenderedPreview}
          showingSource={false}
          onToggleSource={handleToggleSource}
          onOpenFileLocation={handleOpenFileLocation}
          onCopyFullPath={handleCopyFullPath}
        />
        <div className="workspace-file-rich-preview-head">
          <div className="workspace-file-rich-preview-summary">
            <div className="workspace-file-rich-preview-title">{fileName}</div>
            <div className="workspace-file-rich-preview-subtitle">{props.result.path}</div>
          </div>
          <div className="workspace-file-rich-preview-meta">
            <Tag className="workspace-file-rich-preview-tag">HTML</Tag>
            <Tag className="workspace-file-rich-preview-tag is-soft">{displayMimeType}</Tag>
          </div>
        </div>
        <WorkspaceFileHtmlPreview fileName={fileName} content={htmlPreviewMarkup} />
      </div>
    );
  }

  return (
    <div className="workspace-file-preview-panel" data-preview-view={showingSource ? "source" : "preview"}>
      <WorkspaceFilePreviewToolbar
        displayPath={props.result.path}
        canToggleSource={supportsRenderedPreview}
        showingSource={showingSource}
        onToggleSource={handleToggleSource}
        onOpenFileLocation={handleOpenFileLocation}
        onCopyFullPath={handleCopyFullPath}
      />
      {showingSource ? (
        <PreviewPanelSourceEditor
          path={props.result.path}
          content={normalizedContent}
          monacoLanguage={monacoLanguage}
          emptyDescription="文件为空"
        />
      ) : (
        <ConversationCodePreviewPanel
          hideHead
          plain
          code={displayContent}
          infoString={infoString}
        />
      )}
    </div>
  );
}
