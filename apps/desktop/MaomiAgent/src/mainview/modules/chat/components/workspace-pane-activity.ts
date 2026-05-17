export type WorkspacePaneActivity = {
  isVisible: boolean;
  conversationActive: boolean;
  viewActive: boolean;
};

export function resolveWorkspacePaneActivity(input: {
  pageActive: boolean;
  workspaceId: string;
  visibleWorkspaceId: string;
}): WorkspacePaneActivity {
  const isVisible = input.workspaceId === input.visibleWorkspaceId;
  const viewActive = input.pageActive && isVisible;

  return {
    isVisible,
    conversationActive: input.pageActive,
    viewActive,
  };
}