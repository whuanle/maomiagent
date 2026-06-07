import { useCallback, useEffect, useMemo, useState } from "react";

import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import {
  DESKTOP_AGENTS_BRIDGE_READY_EVENT,
  hasDesktopAgentsBridge,
} from "../../../lib/desktop-agents";
import {
  DESKTOP_CONVERSATION_BRIDGE_READY_EVENT,
  hasDesktopConversationBridge,
} from "../../../lib/desktop-conversation";
import {
  DESKTOP_MODELS_BRIDGE_READY_EVENT,
  hasDesktopModelsBridge,
} from "../../../lib/desktop-models";
import {
  DESKTOP_WORKSPACE_BRIDGE_READY_EVENT,
  hasDesktopWorkspaceBridge,
} from "../../../lib/desktop-workspace";
import { getNormalWorkspaces } from "../../../services/workspace-query-service";
import type { ChatActionErrorType } from "../types";

type UseChatPageShellStateInput = {
  active: boolean;
  onError: (action: ChatActionErrorType, error: unknown) => void;
  initialWorkspaceId?: string;
};

function normalizeWorkspaceId(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function compareWorkspaces(left: DesktopWorkspaceItem, right: DesktopWorkspaceItem) {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
}

function resolveNextWorkspaceId(
  items: DesktopWorkspaceItem[],
  currentWorkspaceId: string | undefined,
) {
  if (items.length === 0) {
    return undefined;
  }

  if (currentWorkspaceId && items.some((item) => item.workspaceId === currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  return items[0]?.workspaceId;
}

export function useChatPageShellState(input: UseChatPageShellStateInput) {
  const { active, initialWorkspaceId, onError } = input;
  const [bridgeAvailable, setBridgeAvailable] = useState(
    () => hasDesktopConversationBridge() && hasDesktopWorkspaceBridge(),
  );
  const [modelsBridgeAvailable, setModelsBridgeAvailable] = useState(
    () => hasDesktopModelsBridge(),
  );
  const [agentsBridgeAvailable, setAgentsBridgeAvailable] = useState(
    () => hasDesktopAgentsBridge(),
  );
  const [workspaces, setWorkspaces] = useState<DesktopWorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(
    () => normalizeWorkspaceId(initialWorkspaceId),
  );
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceListHydrated, setWorkspaceListHydrated] = useState(false);

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort(compareWorkspaces),
    [workspaces],
  );
  const selectedWorkspace = sortedWorkspaces.find((item) => item.workspaceId === workspaceId);

  const reloadWorkspaces = useCallback(async () => {
    if (!bridgeAvailable) {
      return;
    }

    setLoadingWorkspaces(true);
    try {
      const nextItems = (await getNormalWorkspaces({ limit: 100, offset: 0 })).sort(compareWorkspaces);
      setWorkspaces(nextItems);
      setWorkspaceId((currentWorkspaceId) => resolveNextWorkspaceId(nextItems, currentWorkspaceId));
      setWorkspaceListHydrated(true);
    } catch (error) {
      onError("loadWorkspaces", error);
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [bridgeAvailable, onError]);

  useEffect(() => {
    const handleBridgeAvailability = () => {
      const nextAvailable = hasDesktopConversationBridge() && hasDesktopWorkspaceBridge();
      const nextModelsAvailable = hasDesktopModelsBridge();
      const nextAgentsAvailable = hasDesktopAgentsBridge();
      setBridgeAvailable(nextAvailable);
      setModelsBridgeAvailable(nextModelsAvailable);
      setAgentsBridgeAvailable(nextAgentsAvailable);

      if (!nextAvailable) {
        setWorkspaces([]);
        setWorkspaceListHydrated(false);
      }
    };

    handleBridgeAvailability();
    window.addEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, handleBridgeAvailability);
    window.addEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, handleBridgeAvailability);
    window.addEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, handleBridgeAvailability);
    window.addEventListener(DESKTOP_AGENTS_BRIDGE_READY_EVENT, handleBridgeAvailability);

    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, handleBridgeAvailability);
      window.removeEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, handleBridgeAvailability);
      window.removeEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, handleBridgeAvailability);
      window.removeEventListener(DESKTOP_AGENTS_BRIDGE_READY_EVENT, handleBridgeAvailability);
    };
  }, []);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    void reloadWorkspaces();
  }, [active, bridgeAvailable, reloadWorkspaces]);

  return {
    bridgeAvailable,
    modelsBridgeAvailable,
    agentsBridgeAvailable,
    workspaces: sortedWorkspaces,
    workspaceId,
    selectedWorkspace,
    loadingWorkspaces,
    workspaceListHydrated,
    setWorkspaceId,
    reloadWorkspaces,
  };
}

export type UseChatPageShellStateResult = ReturnType<typeof useChatPageShellState>;
