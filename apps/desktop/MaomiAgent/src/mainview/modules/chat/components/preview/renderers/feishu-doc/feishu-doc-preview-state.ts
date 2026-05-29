import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT,
  DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
} from "../../../../../../lib/desktop-conversation";
import { getDesktopWorkspaceFileContent } from "../../../../../../lib/desktop-workspace";
import {
  fetchFeishuDocMediaPreviewUrls,
  fetchFeishuDocWhiteboardPreviewUrls,
} from "../../../../../../lib/feishu";
import type {
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetailUpdateEvent,
} from "../../../../../../../shared/desktop-conversation";
import type { DesktopWorkspaceFileContentResult } from "../../../../../../../shared/desktop-workspace";
import {
  extractFeishuMediaTokens,
  extractFeishuWhiteboardTokens,
} from "../../../../../feishu/components/feishu-doc-preview-support";
import {
  normalizeFeishuDocPreviewPaths,
  resolveFeishuDocRuntimeEventFingerprint,
  resolveFeishuDocToolCallFingerprint,
} from "./feishu-doc-preview-refresh";

type Input = {
  conversationWorkspaceId?: string;
  workspaceId: string;
  path: string;
  fallbackPath?: string;
};

export function useFeishuDocPreviewState(input: Input) {
  const [result, setResult] = useState<DesktopWorkspaceFileContentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({});
  const [mediaPreviewErrors, setMediaPreviewErrors] = useState<Record<string, string>>({});
  const [whiteboardPreviewUrls, setWhiteboardPreviewUrls] = useState<Record<string, string>>({});
  const [whiteboardPreviewFocusRects, setWhiteboardPreviewFocusRects] = useState<Record<string, { left: number; top: number; width: number; height: number }>>({});
  const [whiteboardPreviewErrors, setWhiteboardPreviewErrors] = useState<Record<string, string>>({});
  const loadPaths = useMemo(
    () => [...new Set([
      input.path.trim().replaceAll("\\", "/"),
      input.fallbackPath?.trim().replaceAll("\\", "/") || "",
    ].filter((value) => value.length > 0))],
    [input.fallbackPath, input.path],
  );
  const previewPaths = useMemo(
    () => normalizeFeishuDocPreviewPaths({
      path: input.path,
      fallbackPath: input.fallbackPath,
    }),
    [input.fallbackPath, input.path],
  );
  const eventWorkspaceId = useMemo(
    () => input.conversationWorkspaceId?.trim() || input.workspaceId,
    [input.conversationWorkspaceId, input.workspaceId],
  );
  const latestRefreshFingerprintRef = useRef("");
  const mediaPreviewRequestIdRef = useRef(0);
  const whiteboardPreviewRequestIdRef = useRef(0);

  const markdown = result?.content ?? "";
  const mediaTokens = useMemo(() => extractFeishuMediaTokens(markdown), [markdown]);
  const mediaTokenKey = useMemo(() => mediaTokens.join("|"), [mediaTokens]);
  const whiteboardTokens = useMemo(() => extractFeishuWhiteboardTokens(markdown), [markdown]);
  const whiteboardTokenKey = useMemo(() => whiteboardTokens.join("|"), [whiteboardTokens]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let lastError: unknown = null;
    try {
      for (const previewPath of loadPaths) {
        try {
          const nextResult = await getDesktopWorkspaceFileContent(input.workspaceId, previewPath);
          if (nextResult.binary) {
            throw new Error("无法以飞书文档预览方式打开二进制文件");
          }

          setResult(nextResult);
          setError(null);
          return;
        } catch (loadError) {
          lastError = loadError;
        }
      }

      throw lastError ?? new Error("无法读取飞书文档预览");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [input.workspaceId, loadPaths]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    latestRefreshFingerprintRef.current = "";
  }, [input.conversationWorkspaceId, input.fallbackPath, input.path, input.workspaceId]);

  useEffect(() => {
    const refreshForFingerprint = (fingerprint: string) => {
      if (!fingerprint || fingerprint === latestRefreshFingerprintRef.current) {
        return;
      }

      latestRefreshFingerprintRef.current = fingerprint;
      void load();
    };

    const handleConversationDetailUpdated = (event: Event) => {
      const detailUpdate = (event as CustomEvent<DesktopConversationSessionDetailUpdateEvent | undefined>).detail;
      if (!detailUpdate || detailUpdate.detail.workspaceId !== eventWorkspaceId) {
        return;
      }

      refreshForFingerprint(resolveFeishuDocToolCallFingerprint(detailUpdate.detail.toolCalls, previewPaths));
    };

    const handleConversationRuntimeEventsUpdated = (event: Event) => {
      const runtimeUpdate = (event as CustomEvent<DesktopConversationRuntimeEventsUpdateEvent | undefined>).detail;
      if (!runtimeUpdate || runtimeUpdate.workspaceId !== eventWorkspaceId) {
        return;
      }

      refreshForFingerprint(resolveFeishuDocRuntimeEventFingerprint(runtimeUpdate.events, previewPaths));
    };

    window.addEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    window.addEventListener(
      DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
      handleConversationRuntimeEventsUpdated,
    );

    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
      window.removeEventListener(
        DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
        handleConversationRuntimeEventsUpdated,
      );
    };
  }, [eventWorkspaceId, load, previewPaths]);

  useEffect(() => {
    if (mediaTokens.length === 0) {
      mediaPreviewRequestIdRef.current += 1;
      setMediaPreviewUrls({});
      setMediaPreviewErrors({});
      return;
    }

    const requestId = mediaPreviewRequestIdRef.current + 1;
    mediaPreviewRequestIdRef.current = requestId;

    void fetchFeishuDocMediaPreviewUrls("", {
      fileTokens: mediaTokens,
    }).then((response) => {
      if (mediaPreviewRequestIdRef.current !== requestId) {
        return;
      }

      setMediaPreviewUrls(Object.fromEntries(response.items.map((item) => [item.fileToken, item.tmpDownloadUrl])));
      setMediaPreviewErrors(Object.fromEntries(response.errors.map((item) => [item.fileToken, item.message])));
    }).catch(() => {
      if (mediaPreviewRequestIdRef.current !== requestId) {
        return;
      }

      setMediaPreviewUrls({});
      setMediaPreviewErrors({});
    });
  }, [mediaTokenKey, mediaTokens]);

  useEffect(() => {
    if (whiteboardTokens.length === 0) {
      whiteboardPreviewRequestIdRef.current += 1;
      setWhiteboardPreviewUrls({});
      setWhiteboardPreviewFocusRects({});
      setWhiteboardPreviewErrors({});
      return;
    }

    const requestId = whiteboardPreviewRequestIdRef.current + 1;
    whiteboardPreviewRequestIdRef.current = requestId;

    void fetchFeishuDocWhiteboardPreviewUrls("", {
      whiteboardTokens,
    }).then((response) => {
      if (whiteboardPreviewRequestIdRef.current !== requestId) {
        return;
      }

      setWhiteboardPreviewUrls(Object.fromEntries(response.items.map((item) => [item.whiteboardToken, item.tmpDownloadUrl])));
      setWhiteboardPreviewFocusRects(Object.fromEntries(
        response.items
          .filter((item): item is typeof item & {
            focusRect: { left: number; top: number; width: number; height: number };
          } => Boolean(item.focusRect))
          .map((item) => [item.whiteboardToken, item.focusRect]),
      ));
      setWhiteboardPreviewErrors(Object.fromEntries(response.errors.map((item) => [item.whiteboardToken, item.message])));
    }).catch(() => {
      if (whiteboardPreviewRequestIdRef.current !== requestId) {
        return;
      }

      setWhiteboardPreviewUrls({});
      setWhiteboardPreviewFocusRects({});
      setWhiteboardPreviewErrors({});
    });
  }, [whiteboardTokenKey, whiteboardTokens]);

  return {
    result,
    markdown,
    loading,
    error,
    mediaPreviewUrls,
    mediaPreviewErrors,
    whiteboardPreviewUrls,
    whiteboardPreviewFocusRects,
    whiteboardPreviewErrors,
  };
}
