import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import { createConversationAttachedTabState } from "../components/attached-tabs";
import {
  applyConversationWorkbenchDockAction,
  closeConversationWorkbenchAllAttachedTabs,
  closeConversationWorkbenchAttachedTab,
  closeConversationWorkbenchMainPanel,
  closeConversationWorkbenchSecondaryPanel,
  createConversationWorkbenchViewState,
  hasVisibleConversationWorkbenchPanels,
  openConversationWorkbenchAttachedTab,
  resizeConversationWorkbenchMainPane,
  resizeConversationWorkbenchTerminalPane,
  selectConversationWorkbenchAttachedTab,
  selectConversationWorkbenchPanel,
  toggleConversationWorkbenchHistorySidebar,
} from "../components/conversation-workbench-state";
import type {
  ChatAttachedTabRequest,
  ChatOpenCodePreviewInput,
  ChatOpenWorkspaceFilePreviewInput,
  ChatWorkbenchDockKey,
  ChatWorkbenchPanelKey,
} from "../types";

type UseChatWorkbenchStateOptions = {
  language: LanguageCode;
  workspaceId?: string;
  revealTerminalToken?: number;
};

type WorkbenchStateMap = Record<string, ReturnType<typeof createConversationWorkbenchViewState>>;

const DETACHED_WORKSPACE_KEY = "__detached__";

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function resolveWorkspaceStateKey(workspaceId?: string) {
  const normalizedWorkspaceId = workspaceId?.trim();
  return normalizedWorkspaceId || DETACHED_WORKSPACE_KEY;
}

export function useChatWorkbenchState(options: UseChatWorkbenchStateOptions) {
  const workspaceStateKey = useMemo(
    () => resolveWorkspaceStateKey(options.workspaceId),
    [options.workspaceId],
  );
  const handledRevealTokenRef = useRef<number | undefined>(undefined);
  const [stateByWorkspace, setStateByWorkspace] = useState<WorkbenchStateMap>(() => ({
    [workspaceStateKey]: createConversationWorkbenchViewState(),
  }));

  const state = stateByWorkspace[workspaceStateKey] ?? createConversationWorkbenchViewState();

  const updateWorkspaceState = useCallback((
    stateKey: string,
    updater: (current: ReturnType<typeof createConversationWorkbenchViewState>) => ReturnType<typeof createConversationWorkbenchViewState>,
  ) => {
    setStateByWorkspace((currentMap) => {
      const currentState = currentMap[stateKey] ?? createConversationWorkbenchViewState();
      const nextState = updater(currentState);
      if (nextState === currentState) {
        return currentMap;
      }

      return {
        ...currentMap,
        [stateKey]: nextState,
      };
    });
  }, []);

  useEffect(() => {
    const revealToken = options.revealTerminalToken;
    if (!Number.isFinite(revealToken) || revealToken === handledRevealTokenRef.current) {
      return;
    }

    handledRevealTokenRef.current = revealToken;
    updateWorkspaceState(workspaceStateKey, (current) => current.terminalVisible
      ? current
      : {
          ...current,
          terminalVisible: true,
        });
  }, [options.revealTerminalToken, updateWorkspaceState, workspaceStateKey]);

  const onDockAction = useCallback((dockKey: ChatWorkbenchDockKey) => {
    updateWorkspaceState(workspaceStateKey, (current) => applyConversationWorkbenchDockAction(current, dockKey));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onToggleHistorySidebar = useCallback(() => {
    updateWorkspaceState(workspaceStateKey, (current) => toggleConversationWorkbenchHistorySidebar(current));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onOpenWorkspaceFilePreview = useCallback((input: ChatOpenWorkspaceFilePreviewInput) => {
    if (!input.workspaceId || !input.path) {
      return;
    }

    updateWorkspaceState(resolveWorkspaceStateKey(input.workspaceId), (current) => openConversationWorkbenchAttachedTab(
      current,
      createConversationAttachedTabState({
        kind: "preview",
        title: input.title?.trim() || input.path,
        workspaceId: input.workspaceId,
        source: {
          kind: "workspace-file",
          path: input.path,
          ...(input.targetWorkspaceId ? { targetWorkspaceId: input.targetWorkspaceId } : {}),
          requestId: input.requestId,
        },
      }),
    ));
  }, [updateWorkspaceState]);

  const onOpenAttachedTab = useCallback((input: ChatAttachedTabRequest) => {
    const targetWorkspaceId = input.workspaceId?.trim() || options.workspaceId?.trim() || undefined;

    updateWorkspaceState(resolveWorkspaceStateKey(targetWorkspaceId), (current) => openConversationWorkbenchAttachedTab(
      current,
      createConversationAttachedTabState({
        ...input,
        workspaceId: targetWorkspaceId,
      }),
    ));
  }, [options.workspaceId, updateWorkspaceState]);

  const onOpenCodePreview = useCallback((input: ChatOpenCodePreviewInput) => {
    const normalizedTitle = input.title.trim() || (options.language === "en-US" ? "Preview" : "预览");
    const tabId = input.messageId?.trim()
      || `code-${simpleHash(`${normalizedTitle}\n${input.infoString ?? ""}\n${input.code}`)}`;

    updateWorkspaceState(workspaceStateKey, (current) => openConversationWorkbenchAttachedTab(
      current,
      createConversationAttachedTabState({
        kind: "preview",
        title: normalizedTitle,
        workspaceId: options.workspaceId,
        source: {
          kind: "message-code-block",
          tabId,
          language: options.language,
          code: input.code,
          infoString: input.infoString,
        },
      }),
    ));
  }, [options.language, options.workspaceId, updateWorkspaceState, workspaceStateKey]);

  const onCloseAttachedTab = useCallback((tabKey: string) => {
    updateWorkspaceState(workspaceStateKey, (current) => closeConversationWorkbenchAttachedTab(current, tabKey));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onCloseAllAttachedTabs = useCallback(() => {
    updateWorkspaceState(workspaceStateKey, (current) => closeConversationWorkbenchAllAttachedTabs(current));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onCloseMainPanel = useCallback(() => {
    updateWorkspaceState(workspaceStateKey, (current) => closeConversationWorkbenchMainPanel(current));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onCloseSecondaryPanel = useCallback(() => {
    updateWorkspaceState(workspaceStateKey, (current) => closeConversationWorkbenchSecondaryPanel(current));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onSelectBuiltinPanel = useCallback((key: string) => {
    updateWorkspaceState(workspaceStateKey, (current) => selectConversationWorkbenchPanel(current, key));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onSelectAttachedTab = useCallback((key: string) => {
    updateWorkspaceState(workspaceStateKey, (current) => selectConversationWorkbenchAttachedTab(current, key));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onMainSplitterResize = useCallback((sizes: number[]) => {
    updateWorkspaceState(workspaceStateKey, (current) => resizeConversationWorkbenchMainPane(current, sizes));
  }, [updateWorkspaceState, workspaceStateKey]);

  const onTerminalSplitterResize = useCallback((sizes: number[]) => {
    updateWorkspaceState(workspaceStateKey, (current) => resizeConversationWorkbenchTerminalPane(current, sizes));
  }, [updateWorkspaceState, workspaceStateKey]);

  return {
    historySidebarVisible: state.historySidebarVisible,
    activePanelKey: state.activePanelKey as ChatWorkbenchPanelKey,
    activeAttachedTabKey: state.activeAttachedTabKey,
    attachedTabs: state.attachedTabs,
    mainPanelVisible: state.mainPanelVisible,
    secondaryPanelVisible: state.secondaryPanelVisible,
    terminalVisible: state.terminalVisible,
    paneSizes: state.paneSizes,
    rightPaneVisible: hasVisibleConversationWorkbenchPanels(state),
    onDockAction,
    onToggleHistorySidebar,
    onOpenAttachedTab,
    onOpenCodePreview,
    onOpenWorkspaceFilePreview,
    onCloseAttachedTab,
    onCloseAllAttachedTabs,
    onCloseMainPanel,
    onCloseSecondaryPanel,
    onSelectBuiltinPanel,
    onSelectAttachedTab,
    onMainSplitterResize,
    onTerminalSplitterResize,
  };
}