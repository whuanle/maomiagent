export type FrontendConversationLauncherPort = {
  openConversation(input: {
    workspaceId?: string;
    content?: string;
    draftText?: string;
    attachedTabs?: Array<Record<string, unknown>>;
    selectedChannelId?: string;
    selectedModelId?: string;
    title?: string;
  }): Promise<void>;
};

export const FRONTEND_CONVERSATION_LAUNCHER_PORT = Symbol("frontend.conversation.launcher");
