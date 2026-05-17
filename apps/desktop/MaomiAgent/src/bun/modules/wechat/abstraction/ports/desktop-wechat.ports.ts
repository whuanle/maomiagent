import type {
  WechatAccountStatusInput,
  WechatConversationMediaSendInput,
  WechatConversationMediaSendResult,
  WechatConversationRuntimeContextView,
  WechatConversationTextSendInput,
  WechatConversationTextSendResult,
  WechatConfigInput,
  WechatQrLoginPollInput,
  WechatQrLoginPollResult,
  WechatQrLoginStartInput,
  WechatQrLoginStartResult,
  WechatStateView,
} from "../models/desktop-wechat.models";

export interface DesktopWechatQueryPort {
  getState(): Promise<WechatStateView>;
}

export interface DesktopWechatCommandPort {
  saveConfig(input: WechatConfigInput): Promise<WechatStateView>;
  startQrLogin(input?: WechatQrLoginStartInput): Promise<WechatQrLoginStartResult>;
  pollQrLogin(input: WechatQrLoginPollInput): Promise<WechatQrLoginPollResult>;
  setAccountStatus(accountId: string, input: WechatAccountStatusInput): Promise<WechatStateView>;
  clearAccountConversations(accountId: string): Promise<WechatStateView>;
  removeAccount(accountId: string): Promise<WechatStateView>;
}

export interface DesktopWechatConversationPort {
  getConversationRuntimeContext(sessionId: string): Promise<WechatConversationRuntimeContextView | undefined>;
  sendConversationText(
    input: WechatConversationTextSendInput,
  ): Promise<WechatConversationTextSendResult>;
  sendConversationMedia(
    input: WechatConversationMediaSendInput,
  ): Promise<WechatConversationMediaSendResult>;
}

export type DesktopWechatPort =
  & DesktopWechatQueryPort
  & DesktopWechatCommandPort
  & DesktopWechatConversationPort;
