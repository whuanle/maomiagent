import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT,
  DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
} from "../../../../../../lib/desktop-conversation";
import type {
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetailUpdateEvent,
} from "../../../../../../../shared/desktop-conversation";
import { getDesktopWorkspaceFileContent } from "../../../../../../lib/desktop-workspace";
import type { DesktopWorkspaceFileContentResult } from "../../../../../../../shared/desktop-workspace";
type Input = {
  conversationWorkspaceId?: string;
  workspaceId: string;
  path: string;
};
import {
  normalizePreviewPath,
  resolveRuntimeEventFingerprint,
  resolveToolCallFingerprint,
} from "./workspace-file-preview-refresh";

export function useWorkspaceFilePreviewState(input: Input) {
  const [result, setResult] = useState<DesktopWorkspaceFileContentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previewPath = useMemo(() => normalizePreviewPath(input.path), [input.path]);
  const eventWorkspaceId = useMemo(
    () => input.conversationWorkspaceId?.trim() || input.workspaceId,
    [input.conversationWorkspaceId, input.workspaceId],
  );
  const latestRefreshFingerprintRef = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextResult = await getDesktopWorkspaceFileContent(input.workspaceId, input.path);
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
    latestRefreshFingerprintRef.current = "";
  }, [input.path, input.workspaceId]);

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

      refreshForFingerprint(resolveToolCallFingerprint(detailUpdate.detail.toolCalls, previewPath));
    };

    const handleConversationRuntimeEventsUpdated = (event: Event) => {
      const runtimeUpdate = (event as CustomEvent<DesktopConversationRuntimeEventsUpdateEvent | undefined>).detail;
      if (!runtimeUpdate || runtimeUpdate.workspaceId !== eventWorkspaceId) {
        return;
      }

      refreshForFingerprint(resolveRuntimeEventFingerprint(runtimeUpdate.events, previewPath));
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
  }, [eventWorkspaceId, load, previewPath]);

  return {
    result,
    loading,
    error,
    reload: load,
  };
}