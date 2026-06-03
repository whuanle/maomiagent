import type {
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRenameSessionInput,
  DesktopConversationRenameSessionResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationReadWorkspaceSettingsInput,
  DesktopConversationReadWorkspaceSettingsResponse,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSaveWorkspaceSettingsInput,
  DesktopConversationSaveWorkspaceSettingsResponse,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationSessionItem,
  DesktopConversationSessionListQuery,
  DesktopConversationSessionListResponse,
} from "../../shared/desktop-conversation";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopConversationBridge = {
  listDesktopConversationSessions: (
    query?: DesktopConversationSessionListQuery,
  ) => Promise<DesktopConversationSessionListResponse>;
  getDesktopConversationSession: (sessionId: string) => Promise<DesktopConversationSessionItem | null>;
  getDesktopConversationSessionDetail: (sessionId: string) => Promise<DesktopConversationSessionDetail | null>;
  listDesktopConversationCapabilities: (
    query: DesktopConversationCapabilityListQuery,
  ) => Promise<DesktopConversationCapabilityListResponse>;
  getDesktopConversationWorkspaceSettings: (
    input: DesktopConversationReadWorkspaceSettingsInput,
  ) => Promise<DesktopConversationReadWorkspaceSettingsResponse>;
  createDesktopConversationSession: (
    input: DesktopConversationCreateSessionInput,
  ) => Promise<DesktopConversationCreateSessionResponse>;
  renameDesktopConversationSession: (
    input: DesktopConversationRenameSessionInput,
  ) => Promise<DesktopConversationRenameSessionResponse>;
  hideDesktopConversationSession: (sessionId: string) => Promise<DesktopConversationHideSessionResponse>;
  saveDesktopConversationWorkspaceSettings: (
    input: DesktopConversationSaveWorkspaceSettingsInput,
  ) => Promise<DesktopConversationSaveWorkspaceSettingsResponse>;
  sendDesktopConversationMessage: (
    input: DesktopConversationSendMessageInput,
  ) => Promise<DesktopConversationSendMessageResponse>;
  stopDesktopConversationMessage: (
    input: DesktopConversationStopMessageInput,
  ) => Promise<DesktopConversationStopMessageResponse>;
  answerDesktopConversationInteraction: (
    input: DesktopConversationAnswerInteractionInput,
  ) => Promise<DesktopConversationInteractionReplyResponse>;
  rejectDesktopConversationInteraction: (
    input: DesktopConversationRejectInteractionInput,
  ) => Promise<DesktopConversationInteractionReplyResponse>;
};

type DesktopConversationClientDefaults = {
  createSession?: Partial<DesktopConversationCreateSessionInput>;
  sendMessage?: Partial<DesktopConversationSendMessageInput>;
};

export type DesktopConversationClient = {
  listSessions: (query?: DesktopConversationSessionListQuery) => Promise<DesktopConversationSessionListResponse>;
  getSession: (sessionId: string) => Promise<DesktopConversationSessionItem | null>;
  getSessionDetail: (sessionId: string) => Promise<DesktopConversationSessionDetail | null>;
  createSession: (
    input: DesktopConversationCreateSessionInput,
  ) => Promise<DesktopConversationCreateSessionResponse>;
  hideSession: (sessionId: string) => Promise<DesktopConversationHideSessionResponse>;
  sendMessage: (
    input: DesktopConversationSendMessageInput,
  ) => Promise<DesktopConversationSendMessageResponse>;
  stopMessage: (
    input: DesktopConversationStopMessageInput,
  ) => Promise<DesktopConversationStopMessageResponse>;
};

declare global {
  interface Window {
    maomiDesktopConversation?: DesktopConversationBridge;
  }
}

export const DESKTOP_CONVERSATION_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;
export const DESKTOP_CONVERSATION_INVALIDATED_EVENT = "maomi:desktop-conversation-invalidated";
export const DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT = "maomi:desktop-conversation-detail-updated";
export const DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT =
  "maomi:desktop-conversation-runtime-events-updated";

function getDesktopConversationBridge(): DesktopConversationBridge {
  const bridge = window.maomiDesktopConversation;
  if (!bridge) {
    throw new Error("Desktop conversation bridge is unavailable.");
  }

  return bridge;
}

function emitDesktopConversationInvalidated(
  action: "session.created" | "session.hidden" | "session.updated",
  sessionId: string,
) {
  window.dispatchEvent(new CustomEvent(DESKTOP_CONVERSATION_INVALIDATED_EVENT, {
    detail: {
      action,
      sessionId,
      at: new Date().toISOString(),
    },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeConversationMetadata(
  base: unknown,
  override: unknown,
): Record<string, unknown> | undefined {
  const normalizedBase = isRecord(base) ? base : undefined;
  const normalizedOverride = isRecord(override) ? override : undefined;
  if (!normalizedBase && !normalizedOverride) {
    return undefined;
  }

  return {
    ...(normalizedBase ?? {}),
    ...(normalizedOverride ?? {}),
  };
}

export function emitDesktopConversationSessionDetailUpdated(
  detail: DesktopConversationSessionDetailUpdateEvent,
) {
  window.dispatchEvent(new CustomEvent(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, {
    detail,
  }));
}

export function emitDesktopConversationRuntimeEventsUpdated(
  detail: DesktopConversationRuntimeEventsUpdateEvent,
) {
  window.dispatchEvent(new CustomEvent(DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT, {
    detail,
  }));
}

export function hasDesktopConversationBridge(): boolean {
  return Boolean(window.maomiDesktopConversation);
}

export function listDesktopConversationSessions(
  query: DesktopConversationSessionListQuery = {},
): Promise<DesktopConversationSessionListResponse> {
  return getDesktopConversationBridge().listDesktopConversationSessions(query);
}

export function getDesktopConversationSession(
  sessionId: string,
): Promise<DesktopConversationSessionItem | null> {
  return getDesktopConversationBridge().getDesktopConversationSession(sessionId);
}

export function getDesktopConversationSessionDetail(
  sessionId: string,
): Promise<DesktopConversationSessionDetail | null> {
  return getDesktopConversationBridge().getDesktopConversationSessionDetail(sessionId);
}

export function listDesktopConversationCapabilities(
  query: DesktopConversationCapabilityListQuery,
): Promise<DesktopConversationCapabilityListResponse> {
  return getDesktopConversationBridge().listDesktopConversationCapabilities(query);
}

export function getDesktopConversationWorkspaceSettings(
  input: DesktopConversationReadWorkspaceSettingsInput,
): Promise<DesktopConversationReadWorkspaceSettingsResponse> {
  return getDesktopConversationBridge().getDesktopConversationWorkspaceSettings(input);
}

export async function createDesktopConversationSession(
  input: DesktopConversationCreateSessionInput,
): Promise<DesktopConversationCreateSessionResponse> {
  const response = await getDesktopConversationBridge().createDesktopConversationSession(input);
  emitDesktopConversationInvalidated("session.created", response.item.sessionId);
  return response;
}

export async function renameDesktopConversationSession(
  input: DesktopConversationRenameSessionInput,
): Promise<DesktopConversationRenameSessionResponse> {
  const response = await getDesktopConversationBridge().renameDesktopConversationSession(input);
  emitDesktopConversationInvalidated("session.updated", input.sessionId);
  return response;
}

export async function hideDesktopConversationSession(
  sessionId: string,
): Promise<DesktopConversationHideSessionResponse> {
  const response = await getDesktopConversationBridge().hideDesktopConversationSession(sessionId);
  if (response.hidden) {
    emitDesktopConversationInvalidated("session.hidden", response.sessionId);
  }
  return response;
}

export async function saveDesktopConversationWorkspaceSettings(
  input: DesktopConversationSaveWorkspaceSettingsInput,
): Promise<DesktopConversationSaveWorkspaceSettingsResponse> {
  const response = await getDesktopConversationBridge().saveDesktopConversationWorkspaceSettings(input);
  if (response.syncedSessionCount > 0) {
    emitDesktopConversationInvalidated(
      "session.updated",
      `workspace:${input.workspaceId}`,
    );
  }
  return response;
}

export async function sendDesktopConversationMessage(
  input: DesktopConversationSendMessageInput,
): Promise<DesktopConversationSendMessageResponse> {
  const response = await getDesktopConversationBridge().sendDesktopConversationMessage(input);
  emitDesktopConversationInvalidated("session.updated", input.sessionId);
  return response;
}

export async function stopDesktopConversationMessage(
  input: DesktopConversationStopMessageInput,
): Promise<DesktopConversationStopMessageResponse> {
  const response = await getDesktopConversationBridge().stopDesktopConversationMessage(input);
  emitDesktopConversationInvalidated("session.updated", input.sessionId);
  return response;
}

export async function answerDesktopConversationInteraction(
  input: DesktopConversationAnswerInteractionInput,
): Promise<DesktopConversationInteractionReplyResponse> {
  const response = await getDesktopConversationBridge().answerDesktopConversationInteraction(input);
  emitDesktopConversationInvalidated("session.updated", response.detail.sessionId);
  return response;
}

export async function rejectDesktopConversationInteraction(
  input: DesktopConversationRejectInteractionInput,
): Promise<DesktopConversationInteractionReplyResponse> {
  const response = await getDesktopConversationBridge().rejectDesktopConversationInteraction(input);
  emitDesktopConversationInvalidated("session.updated", response.detail.sessionId);
  return response;
}

export function createDesktopConversationClient(
  defaults: DesktopConversationClientDefaults = {},
): DesktopConversationClient {
  return {
    listSessions: (query) => listDesktopConversationSessions(query),
    getSession: (sessionId) => getDesktopConversationSession(sessionId),
    getSessionDetail: (sessionId) => getDesktopConversationSessionDetail(sessionId),
    createSession: (input) => createDesktopConversationSession({
      ...defaults.createSession,
      ...input,
      metadata: mergeConversationMetadata(defaults.createSession?.metadata, input.metadata),
    }),
    hideSession: (sessionId) => hideDesktopConversationSession(sessionId),
    sendMessage: (input) => sendDesktopConversationMessage({
      ...defaults.sendMessage,
      ...input,
      metadata: mergeConversationMetadata(defaults.sendMessage?.metadata, input.metadata),
    }),
    stopMessage: (input) => stopDesktopConversationMessage(input),
  };
}
