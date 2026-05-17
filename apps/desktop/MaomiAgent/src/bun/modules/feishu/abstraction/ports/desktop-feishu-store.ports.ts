import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";

export type DesktopFeishuSmartAssistantAuthSnapshot = {
  appSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scopes?: string[];
  pendingState?: string;
  pendingStateIssuedAt?: string;
  pendingRedirectUri?: string;
  pendingAppId?: string;
};

export type DesktopFeishuAuthSnapshot = {
  smartAssistant: DesktopFeishuSmartAssistantAuthSnapshot;
};

export type DesktopFeishuStoreSnapshot = {
  state: FeishuStateView;
  bot: FeishuBotStateView;
  docs: Record<string, FeishuDocContentView>;
  auth: DesktopFeishuAuthSnapshot;
};

export interface DesktopFeishuStorePort {
  read(): Promise<DesktopFeishuStoreSnapshot>;
  write(snapshot: DesktopFeishuStoreSnapshot): Promise<void>;
}
