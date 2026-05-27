import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getDesktopWorkspaceFileContent } from "../../../../../../lib/desktop-workspace";
import {
  fetchFeishuDocMediaPreviewUrls,
  fetchFeishuDocWhiteboardPreviewUrls,
} from "../../../../../../lib/feishu";
import type { DesktopWorkspaceFileContentResult } from "../../../../../../../shared/desktop-workspace";
import {
  extractFeishuMediaTokens,
  extractFeishuWhiteboardTokens,
} from "../../../../../feishu/components/feishu-doc-preview-support";

type Input = {
  workspaceId: string;
  path: string;
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
    try {
      const nextResult = await getDesktopWorkspaceFileContent(input.workspaceId, input.path);
      if (nextResult.binary) {
        throw new Error("无法以飞书文档预览方式打开二进制文件");
      }

      setResult(nextResult);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [input.path, input.workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

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