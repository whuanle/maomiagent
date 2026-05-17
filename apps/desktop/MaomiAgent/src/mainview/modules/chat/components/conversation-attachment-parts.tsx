import type { MouseEvent, ReactElement } from "react";

import type { ConversationMessageAttachmentPart } from "#maomiagent/kernel/src/host/application";

import { WorkspaceFileIcon } from "./workspace-file-icon";
import { resolveDesktopConversationAttachmentPreviewUrl } from "./conversation-attachment-preview";

type Props = {
  attachments: ConversationMessageAttachmentPart[];
  workspaceId?: string;
  onOpenWorkspaceFilePreview?: (path: string) => void;
};

function formatAttachmentSize(sizeBytes?: number) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return undefined;
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function resolveAttachmentDisplayName(attachment: ConversationMessageAttachmentPart) {
  return attachment.fileName?.trim()
    || attachment.name?.trim()
    || attachment.path?.trim().replaceAll("\\", "/").split("/").filter(Boolean).at(-1)
    || attachment.attachmentId;
}

function resolveAttachmentMetaLabel(attachment: ConversationMessageAttachmentPart) {
  const parts = [
    attachment.mimeType?.trim() || attachment.kind?.trim(),
    formatAttachmentSize(attachment.sizeBytes),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function renderAction(input: {
  attachment: ConversationMessageAttachmentPart;
  className: string;
  href?: string;
  title: string;
  onOpenWorkspaceFilePreview?: (path: string) => void;
  children: ReactElement;
}) {
  const normalizedPath = input.attachment.path?.trim();
  if (normalizedPath && input.onOpenWorkspaceFilePreview) {
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      input.onOpenWorkspaceFilePreview?.(normalizedPath);
    };

    return (
      <button
        key={input.attachment.partId || input.attachment.attachmentId}
        type="button"
        className={input.className}
        title={input.title}
        onClick={handleClick}
      >
        {input.children}
      </button>
    );
  }

  return (
    <a
      key={input.attachment.partId || input.attachment.attachmentId}
      className={input.className}
      href={input.href ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={input.title}
    >
      {input.children}
    </a>
  );
}

function renderAttachmentCard(
  attachment: ConversationMessageAttachmentPart,
  workspaceId: string | undefined,
  onOpenWorkspaceFilePreview?: (path: string) => void,
) {
  const previewUrl = resolveDesktopConversationAttachmentPreviewUrl({
    path: attachment.path,
    assetId: attachment.assetId,
    assetMonth: attachment.assetMonth,
    workspaceId,
  });
  const displayName = resolveAttachmentDisplayName(attachment);
  const metaLabel = resolveAttachmentMetaLabel(attachment);
  const title = attachment.path?.trim() || displayName;
  const className = attachment.kind === "image" && previewUrl
    ? "chat-direct-attachment is-image"
    : `chat-direct-attachment is-file is-${attachment.kind ?? "file"}`;

  if (attachment.kind === "image" && previewUrl) {
    return renderAction({
      attachment,
      className,
      href: previewUrl,
      title,
      onOpenWorkspaceFilePreview,
      children: (
        <>
          <img
            className="chat-direct-attachment-image"
            src={previewUrl}
            alt={displayName}
            loading="lazy"
          />
          <span className="chat-direct-attachment-meta">
            <span className="chat-direct-attachment-name">{displayName}</span>
            {metaLabel ? (
              <span className="chat-direct-attachment-file-meta">{metaLabel}</span>
            ) : null}
          </span>
        </>
      ),
    });
  }

  return renderAction({
    attachment,
    className,
    href: previewUrl,
    title,
    onOpenWorkspaceFilePreview,
    children: (
      <>
        <span className="chat-direct-attachment-file-icon-shell" aria-hidden="true">
          <WorkspaceFileIcon
            className="chat-direct-attachment-file-icon"
            path={displayName}
            kind="file"
            mono
          />
        </span>
        <span className="chat-direct-attachment-file-body">
          <span className="chat-direct-attachment-name">{displayName}</span>
          {metaLabel ? (
            <span className="chat-direct-attachment-file-meta">{metaLabel}</span>
          ) : null}
          {attachment.path?.trim() ? (
            <span className="chat-direct-attachment-path">{attachment.path}</span>
          ) : null}
        </span>
      </>
    ),
  });
}

export function ConversationAttachmentParts(props: Props) {
  return (
    <div className="chat-direct-attachment-strip">
      {props.attachments.map((attachment) => renderAttachmentCard(
        attachment,
        props.workspaceId,
        props.onOpenWorkspaceFilePreview,
      ))}
    </div>
  );
}

export default ConversationAttachmentParts;