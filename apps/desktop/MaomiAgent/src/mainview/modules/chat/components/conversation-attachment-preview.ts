import { DESKTOP_CONVERSATION_ASSET_BASE_URL } from "../../../../shared/desktop-conversation";

export function resolveDesktopConversationAttachmentPreviewUrl(input: {
  path?: string;
  assetId?: string;
  assetMonth?: string;
  workspaceId?: string;
  baseUrl?: string;
}): string | undefined {
  const assetId = typeof input.assetId === "string" ? input.assetId.trim().toLowerCase() : "";
  const assetMonth = typeof input.assetMonth === "string" ? input.assetMonth.trim() : "";
  const workspaceId = typeof input.workspaceId === "string" ? input.workspaceId.trim() : "";

  if (assetId && assetMonth && workspaceId) {
    const pathname = `/workspace/${encodeURIComponent(workspaceId)}/conversations/assets/${encodeURIComponent(assetMonth)}/${encodeURIComponent(assetId)}`;
    const baseUrl = input.baseUrl?.trim() || DESKTOP_CONVERSATION_ASSET_BASE_URL;
    return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  }

  const rawPath = typeof input.path === "string" ? input.path.trim() : "";
  if (!rawPath) {
    return undefined;
  }

  if (/^(?:https?:|data:|blob:|file:|desktop:)/i.test(rawPath)) {
    return rawPath;
  }

  const normalizedPath = rawPath.replaceAll("\\", "/");
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return encodeURI(`file:///${normalizedPath}`);
  }

  if (normalizedPath.startsWith("/")) {
    return encodeURI(`file://${normalizedPath}`);
  }

  return encodeURI(normalizedPath);
}

export default resolveDesktopConversationAttachmentPreviewUrl;