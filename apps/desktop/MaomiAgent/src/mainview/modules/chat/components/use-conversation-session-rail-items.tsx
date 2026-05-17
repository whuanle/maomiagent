import { useMemo } from "react";

import type { DesktopConversationSessionItem } from "../../../../shared/desktop-conversation";
import type { LanguageCode } from "../../../config/titlebar";
import type { ChatConversationRailItem, ChatCopy } from "../types";
import { ConversationSessionRailItem } from "./conversation-session-rail-item";

type Input = {
  sessions: DesktopConversationSessionItem[];
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
          language={input.language}
          copy={input.copy}
          removing={input.archivingSessionId === item.sessionId}
          onRemove={() => {
            void input.onHideSession(item.sessionId);
          }}
        />
      ),
    })),
    [input.archivingSessionId, input.copy, input.language, input.onHideSession, input.sessions],
  );
}