import type { ChatConversationOpenRequest } from "../../modules/chat/types";

export type FrontendConversationLauncherPort = {
  openConversation(input: {
    workspaceId?: string;
    content?: string;
    draftText?: string;
    createSession?: boolean;
    attachedTabs?: ChatConversationOpenRequest["attachedTabs"];
    selectedAgentId?: string;
    selectedChannelId?: string;
    selectedModelId?: string;
    title?: string;
  }): Promise<void>;
};

export const FRONTEND_CONVERSATION_LAUNCHER_PORT = Symbol("frontend.conversation.launcher");
