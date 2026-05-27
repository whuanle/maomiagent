import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";

import { resolveConversationTargetWorkspaceId } from "../components/chat-workspace-shell-state";
import type { ChatConversationOpenRequest } from "../types";

export type ResolvedConversationOpenRequest = {
  request: ChatConversationOpenRequest;
  workspaceId: string;
};

export function partitionConversationOpenRequestsByWorkspace(input: {
  requests: ChatConversationOpenRequest[];
  requestedWorkspaceId?: string;
  activeWorkspaceId?: string;
  openWorkspaceIds: string[];
  workspaceItems: Array<Pick<DesktopWorkspaceItem, "workspaceId">>;
}) {
  const ready: ResolvedConversationOpenRequest[] = [];
  const unresolved: ChatConversationOpenRequest[] = [];

  for (const request of input.requests) {
    const workspaceId = resolveConversationTargetWorkspaceId({
      requestedWorkspaceId: request.workspaceId ?? input.requestedWorkspaceId,
      activeWorkspaceId: input.activeWorkspaceId,
      openWorkspaceIds: input.openWorkspaceIds,
      workspaceItems: input.workspaceItems,
    });

    if (!workspaceId) {
      unresolved.push(request);
      continue;
    }

    ready.push({ request, workspaceId });
  }

  return {
    ready,
    unresolved,
  };
}