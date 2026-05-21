import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuDocTreeNode,
  FeishuDocTreeNodeKind,
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
  roots: Record<string, DesktopFeishuDocTreeRootCacheEntry>;
  branches: Record<string, DesktopFeishuDocTreeBranchCacheEntry>;
  contents: Record<string, DesktopFeishuDocContentCacheEntry>;
};

export type DesktopFeishuStoreSnapshot = {
  state: FeishuStateView;
  bot: FeishuBotStateView;
  docs: Record<string, FeishuDocContentView>;
  developerCredential: DesktopFeishuDeveloperCredentialSnapshot;
  developerToken: DesktopFeishuDeveloperTokenSnapshot;
  docTreeCache: DesktopFeishuDocTreeCacheSnapshot;
};

export interface DesktopFeishuStorePort {
  read(): Promise<DesktopFeishuStoreSnapshot>;
  write(snapshot: DesktopFeishuStoreSnapshot): Promise<void>;
}
