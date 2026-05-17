import type {
  WechatAccountStatusInput,
  WechatConfigInput,
  WechatQrLoginPollInput,
  WechatQrLoginPollResult,
  WechatQrLoginStartInput,
  WechatQrLoginStartResult,
  WechatStateView,
} from "../../shared/desktop-wechat";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopWechatBridge = {
  getDesktopWechatState: () => Promise<WechatStateView>;
  saveDesktopWechatConfig: (input: WechatConfigInput) => Promise<WechatStateView>;
  startDesktopWechatQrLogin: (input?: WechatQrLoginStartInput) => Promise<WechatQrLoginStartResult>;
  pollDesktopWechatQrLogin: (input: WechatQrLoginPollInput) => Promise<WechatQrLoginPollResult>;
  setDesktopWechatAccountStatus: (accountId: string, input: WechatAccountStatusInput) => Promise<WechatStateView>;
  clearDesktopWechatAccountConversations: (accountId: string) => Promise<WechatStateView>;
  removeDesktopWechatAccount: (accountId: string) => Promise<WechatStateView>;
};

declare global {
  interface Window {
    maomiDesktopWechat?: DesktopWechatBridge;
  }
}

export const DESKTOP_WECHAT_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopWechatBridge(): DesktopWechatBridge {
  const bridge = window.maomiDesktopWechat;
  if (!bridge) {
    throw new Error("Desktop wechat bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopWechatBridge(): boolean {
  return Boolean(window.maomiDesktopWechat);
}

export function fetchWechatState(): Promise<WechatStateView> {
  return getDesktopWechatBridge().getDesktopWechatState();
}

export function saveWechatConfig(input: WechatConfigInput): Promise<WechatStateView> {
  return getDesktopWechatBridge().saveDesktopWechatConfig(input);
}

export function startWechatQrLogin(input?: WechatQrLoginStartInput): Promise<WechatQrLoginStartResult> {
  return getDesktopWechatBridge().startDesktopWechatQrLogin(input);
}

export function pollWechatQrLogin(input: WechatQrLoginPollInput): Promise<WechatQrLoginPollResult> {
  return getDesktopWechatBridge().pollDesktopWechatQrLogin(input);
}

export function setWechatAccountStatus(
  accountId: string,
  input: WechatAccountStatusInput,
): Promise<WechatStateView> {
  return getDesktopWechatBridge().setDesktopWechatAccountStatus(accountId, input);
}

export function clearWechatAccountConversations(accountId: string): Promise<WechatStateView> {
  return getDesktopWechatBridge().clearDesktopWechatAccountConversations(accountId);
}

export function removeWechatAccount(accountId: string): Promise<WechatStateView> {
  return getDesktopWechatBridge().removeDesktopWechatAccount(accountId);
}

export function subscribeWechatMutations(listener: () => void): () => void {
  const timer = window.setInterval(() => {
    listener();
  }, 5_000);

  return () => {
    window.clearInterval(timer);
  };
}
