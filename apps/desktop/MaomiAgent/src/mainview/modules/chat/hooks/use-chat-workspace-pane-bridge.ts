import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";

import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import { resolveConversationTargetWorkspaceId } from "../components/chat-workspace-shell-state";
import type {
  ChatAttachedTabRequest,
  ChatConversationOpenRequest,
  ChatPendingDraft,
} from "../types";
import type { ConversationWorkspacePaneHandle } from "../components/workspace-pane";
import { partitionConversationOpenRequestsByWorkspace } from "./conversation-open-resolution";

type Input = {
  workspaceItems: DesktopWorkspaceItem[];
  activeWorkspaceIdRef: MutableRefObject<string>;
  openWorkspaceIdsRef: MutableRefObject<string[]>;
  activateWorkspaceTab: (workspaceId: string) => void;
};

type Result = {
  registerWorkspacePaneRef: (
    workspaceId: string,
    instance: ConversationWorkspacePaneHandle | null,
  ) => void;
  clearWorkspacePaneState: (workspaceId: string) => void;
  handleOpenConversation: (input?: ChatConversationOpenRequest) => void;
  handleOpenAttachedTab: (input: ChatAttachedTabRequest) => void;
};

function buildPendingDraft(text?: string): ChatPendingDraft | null {
  const nextText = text ?? "";
  if (!nextText.trim()) {
    return null;
  }

  return {
    id: `chat-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: nextText,
  };
}

function resolveAttachedTabWorkspaceId(
  input: ChatAttachedTabRequest,
  fallbackWorkspaceId: string,
) {
  return input.workspaceId?.trim() || fallbackWorkspaceId;
}

function withAttachedTabWorkspace(
  input: ChatAttachedTabRequest,
  workspaceId: string,
): ChatAttachedTabRequest {
  return {
    ...input,
    workspaceId,
  };
}

export function useChatWorkspacePaneBridge(input: Input): Result {
  const workspacePaneRefs = useRef<Record<string, ConversationWorkspacePaneHandle | null>>({});
  const unresolvedConversationOpensRef = useRef<ChatConversationOpenRequest[]>([]);
  const pendingConversationOpensRef = useRef<Record<string, ChatConversationOpenRequest[]>>({});
  const pendingSessionActivationsRef = useRef<Record<string, string[]>>({});
  const pendingDraftsRef = useRef<Record<string, ChatPendingDraft[]>>({});
  const pendingAttachedTabsRef = useRef<Record<string, ChatAttachedTabRequest[]>>({});

  const flushPendingConversationOpens = useCallback((workspaceId: string) => {
    const host = workspacePaneRefs.current[workspaceId];
    const pendingItems = pendingConversationOpensRef.current[workspaceId];
    if (!host || !pendingItems || pendingItems.length === 0) {
      return;
    }

    delete pendingConversationOpensRef.current[workspaceId];
    for (const item of pendingItems) {
      void host.openConversation(item);
    }
  }, []);

  const flushPendingSessionActivations = useCallback((workspaceId: string) => {
    const host = workspacePaneRefs.current[workspaceId];
    const pendingItems = pendingSessionActivationsRef.current[workspaceId];
    if (!host || !pendingItems || pendingItems.length === 0) {
      return;
    }

    delete pendingSessionActivationsRef.current[workspaceId];
    for (const sessionId of pendingItems) {
      host.activateSession(sessionId);
    }
  }, []);

  const flushPendingDrafts = useCallback((workspaceId: string) => {
    const host = workspacePaneRefs.current[workspaceId];
    const pendingItems = pendingDraftsRef.current[workspaceId];
    if (!host || !pendingItems || pendingItems.length === 0) {
      return;
    }

    delete pendingDraftsRef.current[workspaceId];
    for (const item of pendingItems) {
      host.applyDraftPrefill(item);
    }
  }, []);

  const flushPendingAttachedTabs = useCallback((workspaceId: string) => {
    const host = workspacePaneRefs.current[workspaceId];
    const pendingItems = pendingAttachedTabsRef.current[workspaceId];
    if (!host || !pendingItems || pendingItems.length === 0) {
      return;
    }

    delete pendingAttachedTabsRef.current[workspaceId];
    for (const item of pendingItems) {
      host.openAttachedTab(item);
    }
  }, []);

  const registerWorkspacePaneRef = useCallback((
    workspaceId: string,
    instance: ConversationWorkspacePaneHandle | null,
  ) => {
    workspacePaneRefs.current[workspaceId] = instance;
    if (!instance) {
      return;
    }

    window.setTimeout(() => {
      if (workspacePaneRefs.current[workspaceId] === instance) {
        flushPendingConversationOpens(workspaceId);
        flushPendingSessionActivations(workspaceId);
        flushPendingDrafts(workspaceId);
        flushPendingAttachedTabs(workspaceId);
      }
    }, 0);
  }, [flushPendingAttachedTabs, flushPendingConversationOpens, flushPendingDrafts, flushPendingSessionActivations]);

  const clearWorkspacePaneState = useCallback((workspaceId: string) => {
    delete workspacePaneRefs.current[workspaceId];
    delete pendingConversationOpensRef.current[workspaceId];
    delete pendingSessionActivationsRef.current[workspaceId];
    delete pendingDraftsRef.current[workspaceId];
    delete pendingAttachedTabsRef.current[workspaceId];
  }, []);

  const dispatchConversationOpen = useCallback((
    requestedWorkspaceId: string,
    request?: ChatConversationOpenRequest,
  ) => {
    if (request?.createSession) {
      pendingConversationOpensRef.current[requestedWorkspaceId] = [
        ...(pendingConversationOpensRef.current[requestedWorkspaceId] ?? []),
        {
          ...request,
          workspaceId: requestedWorkspaceId,
        },
      ];

      input.activateWorkspaceTab(requestedWorkspaceId);
      window.setTimeout(() => {
        flushPendingConversationOpens(requestedWorkspaceId);
      }, 0);
      return;
    }

    if (request?.sessionId?.trim()) {
      pendingSessionActivationsRef.current[requestedWorkspaceId] = [
        ...(pendingSessionActivationsRef.current[requestedWorkspaceId] ?? []),
        request.sessionId.trim(),
      ];
    }

    const pendingDraft = buildPendingDraft(request?.draftText);
    if (pendingDraft) {
      pendingDraftsRef.current[requestedWorkspaceId] = [
        ...(pendingDraftsRef.current[requestedWorkspaceId] ?? []),
        pendingDraft,
      ];
    }

    if (request?.attachedTabs?.length) {
      pendingAttachedTabsRef.current[requestedWorkspaceId] = [
        ...(pendingAttachedTabsRef.current[requestedWorkspaceId] ?? []),
        ...request.attachedTabs.map((item) => withAttachedTabWorkspace(
          item,
          resolveAttachedTabWorkspaceId(item, requestedWorkspaceId),
        )),
      ];
    }

    input.activateWorkspaceTab(requestedWorkspaceId);
    window.setTimeout(() => {
      flushPendingSessionActivations(requestedWorkspaceId);
      flushPendingDrafts(requestedWorkspaceId);
      flushPendingAttachedTabs(requestedWorkspaceId);
    }, 0);
  }, [
    flushPendingAttachedTabs,
    flushPendingConversationOpens,
    flushPendingDrafts,
    flushPendingSessionActivations,
    input.activateWorkspaceTab,
  ]);

  const tryHandleOpenConversation = useCallback((request?: ChatConversationOpenRequest) => {
    const requestedWorkspaceId = resolveConversationTargetWorkspaceId({
      requestedWorkspaceId: request?.workspaceId,
      activeWorkspaceId: input.activeWorkspaceIdRef.current,
      openWorkspaceIds: input.openWorkspaceIdsRef.current,
      workspaceItems: input.workspaceItems,
    });
    if (!requestedWorkspaceId) {
      return false;
    }

    dispatchConversationOpen(requestedWorkspaceId, request);
    return true;
  }, [
    dispatchConversationOpen,
    input.activeWorkspaceIdRef,
    input.openWorkspaceIdsRef,
    input.workspaceItems,
  ]);

  const flushUnresolvedConversationOpens = useCallback(() => {
    const pendingItems = unresolvedConversationOpensRef.current;
    if (pendingItems.length === 0) {
      return;
    }

    const result = partitionConversationOpenRequestsByWorkspace({
      requests: pendingItems,
      activeWorkspaceId: input.activeWorkspaceIdRef.current,
      openWorkspaceIds: input.openWorkspaceIdsRef.current,
      workspaceItems: input.workspaceItems,
    });

    unresolvedConversationOpensRef.current = result.unresolved;
    for (const item of result.ready) {
      dispatchConversationOpen(item.workspaceId, item.request);
    }
  }, [
    dispatchConversationOpen,
    input.activeWorkspaceIdRef,
    input.openWorkspaceIdsRef,
    input.workspaceItems,
  ]);

  const handleOpenConversation = useCallback((request?: ChatConversationOpenRequest) => {
    if (!tryHandleOpenConversation(request)) {
      if (request) {
        unresolvedConversationOpensRef.current = [
          ...unresolvedConversationOpensRef.current,
          request,
        ];
      }
      return;
    }
  }, [
    tryHandleOpenConversation,
  ]);

  const workspaceItemsKey = input.workspaceItems.map((item) => item.workspaceId).join("|");
  const openWorkspaceIdsKey = input.openWorkspaceIdsRef.current.join("|");
  const activeWorkspaceId = input.activeWorkspaceIdRef.current;

  useEffect(() => {
    flushUnresolvedConversationOpens();
  }, [activeWorkspaceId, flushUnresolvedConversationOpens, openWorkspaceIdsKey, workspaceItemsKey]);

  const handleOpenAttachedTab = useCallback((request: ChatAttachedTabRequest) => {
    const fallbackWorkspaceId = resolveConversationTargetWorkspaceId({
      activeWorkspaceId: input.activeWorkspaceIdRef.current,
      openWorkspaceIds: input.openWorkspaceIdsRef.current,
      workspaceItems: input.workspaceItems,
    });
    if (!fallbackWorkspaceId) {
      return;
    }

    const requestedWorkspaceId = resolveAttachedTabWorkspaceId(request, fallbackWorkspaceId);
    pendingAttachedTabsRef.current[requestedWorkspaceId] = [
      ...(pendingAttachedTabsRef.current[requestedWorkspaceId] ?? []),
      withAttachedTabWorkspace(request, requestedWorkspaceId),
    ];

    input.activateWorkspaceTab(requestedWorkspaceId);
    window.setTimeout(() => {
      flushPendingAttachedTabs(requestedWorkspaceId);
    }, 0);
  }, [
    flushPendingAttachedTabs,
    input.activeWorkspaceIdRef,
    input.activateWorkspaceTab,
    input.openWorkspaceIdsRef,
    input.workspaceItems,
  ]);

  return {
    registerWorkspacePaneRef,
    clearWorkspacePaneState,
    handleOpenConversation,
    handleOpenAttachedTab,
  };
}