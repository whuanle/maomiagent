import { useMemo } from "react";

import type { DesktopConversationSessionItem } from "../../../../shared/desktop-conversation";
import type { LanguageCode } from "../../../config/titlebar";
import type { SessionExecutionOverlayState } from "../../../components/workspace-experience-state/session-execution-overlay";
import { resolveSessionExecutionView } from "../../../components/workspace-experience-state/session-execution-overlay";
import type { ChatConversationRailItem, ChatCopy } from "../types";
import { ConversationSessionRailItem } from "./conversation-session-rail-item";
import { hasManagedTakeoverChildSession } from "../hooks/managed-takeover";

type Input = {
  sessions: DesktopConversationSessionItem[];
  executionOverlays: SessionExecutionOverlayState;
  language: LanguageCode;
  copy: ChatCopy;
  archivingSessionId: string | null;
  onHideSession: (sessionId: string) => Promise<boolean>;
};

export function useConversationSessionRailItems(input: Input): ChatConversationRailItem[] {
  return useMemo(
    () => input.sessions.map((item) => ({
      key: item.sessionId,
      title: item.title || item.sessionId,
      label: (
        <ConversationSessionRailItem
          item={item}
          executionView={resolveSessionExecutionView({
            detailStatus: item.status,
            overlay: input.executionOverlays[item.sessionId],
          })}
          suppressPendingState={hasManagedTakeoverChildSession({
            sourceSession: item,
            sessions: input.sessions,
          })}
          language={input.language}
          copy={input.copy}
          removing={input.archivingSessionId === item.sessionId}
          onRemove={() => {
            void input.onHideSession(item.sessionId);
          }}
        />
      ),
    })),
    [input.archivingSessionId, input.copy, input.executionOverlays, input.language, input.onHideSession, input.sessions],
  );
}
