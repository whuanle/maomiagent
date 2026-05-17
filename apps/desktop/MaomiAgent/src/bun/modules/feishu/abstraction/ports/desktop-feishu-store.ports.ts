import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";

export type DesktopFeishuStoreSnapshot = {
  state: FeishuStateView;
  bot: FeishuBotStateView;
  docs: Record<string, FeishuDocContentView>;
};

export interface DesktopFeishuStorePort {
  read(): Promise<DesktopFeishuStoreSnapshot>;
  write(snapshot: DesktopFeishuStoreSnapshot): Promise<void>;
}
