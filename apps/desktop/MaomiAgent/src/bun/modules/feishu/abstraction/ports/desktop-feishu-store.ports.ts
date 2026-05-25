import type {
  FeishuBotPendingActionView,
  FeishuBotStateView,
  FeishuBotProcessedMessage,
  FeishuDocContentView,
  FeishuDocTreeNode,
  FeishuDocTreeNodeKind,
  FeishuSmartAssistantExecuteActionInput,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";

export type DesktopFeishuDeveloperTokenSnapshot = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

export type DesktopFeishuDeveloperCredentialSnapshot = {
  appSecret: string;
};

export type DesktopFeishuDocTreeRootCacheEntry = {
  token: string;
  kind: FeishuDocTreeNodeKind;
  rootNodeId: string;
  title: string;
  loadedAt: string;
  error?: string;
};

export type DesktopFeishuDocTreeBranchCacheEntry = {
  rootToken: string;
  parentToken: string;
  nodes: FeishuDocTreeNode[];
  loadedAt: string;
  complete: boolean;
  pageToken?: string;
  error?: string;
};

export type DesktopFeishuDocContentCacheEntry = {
  docId: string;
  item: FeishuDocContentView;
  loadedAt: string;
  error?: string;
};

export type DesktopFeishuDocTreeCacheSnapshot = {
  lastRootToken: string;
  lastRootUpdatedAt: string;
  roots: Record<string, DesktopFeishuDocTreeRootCacheEntry>;
  branches: Record<string, DesktopFeishuDocTreeBranchCacheEntry>;
  contents: Record<string, DesktopFeishuDocContentCacheEntry>;
};

export type DesktopFeishuBotConversationBindingSnapshot = {
  key: string;
  tenantKey?: string;
  chatId: string;
  threadId?: string;
  workspaceId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageId?: string;
};

export type DesktopFeishuBotPendingActionDecision =
  | "confirm"
  | "cancel"
  | "modify"
  | "new_request"
  | "unclear";

export type DesktopFeishuBotPendingActionSnapshot = FeishuBotPendingActionView & {
  scopeKey: string;
  tenantKey?: string;
  executeInput: FeishuSmartAssistantExecuteActionInput;
  initiatorSenderId?: string;
  initiatorSenderName?: string;
  confirmedBySenderId?: string;
  confirmedBySenderName?: string;
  lastDecision?: DesktopFeishuBotPendingActionDecision;
  updatedAt: string;
};

export type DesktopFeishuBotRuntimeSnapshot = {
  version: string;
  bindings: DesktopFeishuBotConversationBindingSnapshot[];
  processedMessages: FeishuBotProcessedMessage[];
  pendingActions: DesktopFeishuBotPendingActionSnapshot[];
};

export type DesktopFeishuStoreSnapshot = {
  state: FeishuStateView;
  bot: FeishuBotStateView;
  botRuntime: DesktopFeishuBotRuntimeSnapshot;
  docs: Record<string, FeishuDocContentView>;
  developerCredential: DesktopFeishuDeveloperCredentialSnapshot;
  developerToken: DesktopFeishuDeveloperTokenSnapshot;
  docTreeCache: DesktopFeishuDocTreeCacheSnapshot;
};

export interface DesktopFeishuStorePort {
  read(): Promise<DesktopFeishuStoreSnapshot>;
  write(snapshot: DesktopFeishuStoreSnapshot): Promise<void>;
  mutate?<T>(mutator: (snapshot: DesktopFeishuStoreSnapshot) => Promise<T> | T): Promise<T>;
}
