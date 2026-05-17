import path from "node:path";
import { readFileSync } from "node:fs";

import type { MessagePart } from "../kernel-bridge";

type AttachmentMessagePart = Extract<MessagePart, { type: "attachment" }>;

const IMAGE_MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  ["apng", "image/png"],
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["ico", "image/x-icon"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
]);

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveAttachmentExtension(part: AttachmentMessagePart) {
  const candidate = trimText(part.fileName) || trimText(part.name) || trimText(part.path);
  return candidate.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase();
}

function resolveAttachmentDisplayName(part: AttachmentMessagePart) {
  return trimText(part.fileName)
    || trimText(part.name)
    || trimText(part.path ? path.basename(part.path) : "")
    || part.attachmentId;
}

function resolveAttachmentMimeType(part: AttachmentMessagePart) {
  const normalizedMimeType = trimText(part.mimeType).toLowerCase();
  if (normalizedMimeType && !normalizedMimeType.endsWith("/*")) {
    return normalizedMimeType;
  }

  const extension = resolveAttachmentExtension(part);
  if (extension) {
    const inferredMimeType = IMAGE_MIME_TYPE_BY_EXTENSION.get(extension);
    if (inferredMimeType) {
      return inferredMimeType;
    }
  }

  return normalizedMimeType || undefined;
}

export function collectAttachmentParts(parts: readonly MessagePart[]) {
  return parts.filter((part): part is AttachmentMessagePart => part.type === "attachment");
}

export function buildAttachmentPromptText(part: AttachmentMessagePart) {
  const displayName = resolveAttachmentDisplayName(part);
  const mimeType = (resolveAttachmentMimeType(part)
    ?? trimText(part.mimeType))
    || "application/octet-stream";
  return `[Attachment: ${displayName} (${mimeType})]`;
}

export function readPromptImageAttachment(
  part: AttachmentMessagePart,
  options?: {
    allowedMimeTypes?: ReadonlySet<string>;
  },
) {
  const mimeType = resolveAttachmentMimeType(part);
  if (!mimeType?.startsWith("image/")) {
    return undefined;
  }

  if (options?.allowedMimeTypes && !options.allowedMimeTypes.has(mimeType)) {
    return undefined;
  }

  const filePath = trimText(part.path);
  if (!filePath) {
    return undefined;
  }

  try {
    const dataBase64 = readFileSync(filePath).toString("base64");
    if (!dataBase64) {
      return undefined;
    }

    return {
      mimeType,
      dataBase64,
      displayName: resolveAttachmentDisplayName(part),
    };
  } catch {
    return undefined;
  }
}
