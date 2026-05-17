import { Button, Empty, Spin } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
} from "../../../../shared/desktop-conversation";

import {
  DirectConversationSessionPane,
  type DirectConversationSessionPaneProps,
} from "./direct-session-pane";

const SESSION_STAGE_LINGER_MS = 420;

function resolveConversationWorkspaceStageVisibleSessionIds(input: {
  activeSessionId: string;
  openSessionIds: string[];
  lingeringSessionIds?: string[];
}) {
  const activeSessionId = input.activeSessionId.trim();
  const visibleIds: string[] = [];
  const seenIds = new Set<string>();

  const pushVisibleId = (value?: string) => {
    const normalized = value?.trim() || "";
    if (!normalized || seenIds.has(normalized)) {
      return;
    }

    seenIds.add(normalized);
    visibleIds.push(normalized);
  };

  pushVisibleId(activeSessionId);

  for (const sessionId of input.lingeringSessionIds ?? []) {
    if (!input.openSessionIds.includes(sessionId)) {
      continue;
    }

    pushVisibleId(sessionId);
  }

  return visibleIds;
}

type Props = Omit<DirectConversationSessionPaneProps, "selectedSession" | "renderStageShell"> & {
  active: boolean;
  activeSessionId?: string;
  sessionSummaries: DesktopConversationSessionItem[];
  sessionDetailsById: Record<string, DesktopConversationSessionDetail>;
};

function buildSessionView(
  sessionId: string,
  summary: DesktopConversationSessionItem | undefined,
  detail: DesktopConversationSessionDetail | undefined,
) {
  if (!summary && !detail) {
    return undefined;
  }

  if (summary) {
    return {
      ...summary,
      detail,
    };
  }

  return detail ? {
    sessionId: detail.sessionId,
    title: detail.title,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    detail,
  } : undefined;
}

function areStringListsEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export function ConversationWorkspaceStage(props: Props) {
  const isEn = props.language === "en-US";
  const loadingLabel = isEn ? "Loading sessions" : "正在加载会话";
  const activeSessionId = props.activeSessionId?.trim() || "";
  const sessionSummaryMap = useMemo(
    () => new Map(props.sessionSummaries.map((item) => [item.sessionId, item])),
    [props.sessionSummaries],
  );
  const openSessionIds = useMemo(() => {
    const sessionIds = props.sessionSummaries.map((item) => item.sessionId);
    if (activeSessionId && !sessionIds.includes(activeSessionId)) {
      return [activeSessionId, ...sessionIds];
    }
    return sessionIds;
  }, [activeSessionId, props.sessionSummaries]);
  const lingerTimersRef = useRef(new Map<string, ReturnType<typeof globalThis.setTimeout>>());
  const previousActiveSessionIdRef = useRef(activeSessionId);
  const [lingeringSessionIds, setLingeringSessionIds] = useState<string[]>([]);
  const openSessionIdsSignature = openSessionIds.join("\u0000");

  useEffect(() => {
    const nextOpenSessionIds = new Set(openSessionIds);

    setLingeringSessionIds((current) => {
      const next = current.filter((sessionId) => sessionId !== activeSessionId && nextOpenSessionIds.has(sessionId));
      return areStringListsEqual(current, next) ? current : next;
    });

    for (const [sessionId, timer] of lingerTimersRef.current.entries()) {
      if (sessionId === activeSessionId || nextOpenSessionIds.has(sessionId)) {
        continue;
      }

      globalThis.clearTimeout(timer);
      lingerTimersRef.current.delete(sessionId);
    }
  }, [activeSessionId, openSessionIds, openSessionIdsSignature]);

  useEffect(() => {
    const previousActiveSessionId = previousActiveSessionIdRef.current.trim();
    previousActiveSessionIdRef.current = activeSessionId;

    if (
      !previousActiveSessionId
      || previousActiveSessionId === activeSessionId
      || !openSessionIds.includes(previousActiveSessionId)
      || !props.sessionDetailsById[previousActiveSessionId]
    ) {
      return;
    }

    const existingTimer = lingerTimersRef.current.get(previousActiveSessionId);
    if (existingTimer !== undefined) {
      globalThis.clearTimeout(existingTimer);
    }

    setLingeringSessionIds((current) => {
      if (current.includes(previousActiveSessionId)) {
        return current;
      }

      return [...current, previousActiveSessionId];
    });

    const timer = globalThis.setTimeout(() => {
      lingerTimersRef.current.delete(previousActiveSessionId);
      setLingeringSessionIds((current) => current.filter((sessionId) => sessionId !== previousActiveSessionId));
    }, SESSION_STAGE_LINGER_MS);

    lingerTimersRef.current.set(previousActiveSessionId, timer);
  }, [activeSessionId, openSessionIds, openSessionIdsSignature, props.sessionDetailsById]);

  useEffect(() => () => {
    for (const timer of lingerTimersRef.current.values()) {
      globalThis.clearTimeout(timer);
    }
    lingerTimersRef.current.clear();
  }, []);

  const visibleSessionIds = useMemo(
    () => resolveConversationWorkspaceStageVisibleSessionIds({
      activeSessionId,
      openSessionIds,
      lingeringSessionIds,
    }),
    [activeSessionId, lingeringSessionIds, openSessionIds],
  );
  const activeSession = activeSessionId ? sessionSummaryMap.get(activeSessionId) : undefined;

  return (
    <section className="chat-stage">
      {!props.bridgeAvailable ? (
        <div className="chat-stage-body">
          <div className="chat-workspace-pane-empty-state">
            <Empty description={props.copy.bridgeUnavailableDescription} image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button type="primary" onClick={props.onOpenWorkspace}>{props.copy.openWorkspace}</Button>
            </Empty>
          </div>
        </div>
      ) : !props.selectedWorkspace ? (
        <div className="chat-stage-body">
          <div className="chat-workspace-pane-empty-state">
            <Empty description={props.copy.emptyWorkspaceDescription} image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button type="primary" onClick={props.onOpenWorkspace}>{props.copy.openWorkspace}</Button>
            </Empty>
          </div>
        </div>
      ) : props.loadingSessions && !activeSession ? (
        <div className="chat-stage-body">
          <div className="chat-pane-loading-indicator is-inline">
            <Spin size="large" />
            <div className="chat-pane-loading-text">{loadingLabel}</div>
          </div>
        </div>
      ) : !activeSessionId || !activeSession ? (
        <div className="chat-stage-body">
          <div className="chat-workspace-pane-empty-state">
            <Empty description={props.copy.emptySessionDescription} image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button type="primary" onClick={props.onCreateSession} loading={props.creatingSession}>
                {props.copy.createSession}
              </Button>
            </Empty>
          </div>
        </div>
      ) : (
        <div className="chat-session-stage-stack">
          {visibleSessionIds.map((sessionId) => {
            const detail = props.sessionDetailsById[sessionId];
            const summary = sessionSummaryMap.get(sessionId);
            if (!summary && !detail) {
              return null;
            }

            if (!detail && sessionId !== activeSessionId) {
              return null;
            }

            const selectedSession = buildSessionView(sessionId, summary, detail);
            if (!selectedSession) {
              return null;
            }

            const isActiveSession = sessionId === activeSessionId;

            return (
              <div
                key={sessionId}
                className="chat-session-stage-host"
                data-active={isActiveSession ? "true" : "false"}
              >
                <DirectConversationSessionPane
                  {...props}
                  selectedSession={selectedSession}
                  loadingSessionDetail={isActiveSession ? props.loadingSessionDetail : false}
                  draftMessage={isActiveSession ? props.draftMessage : ""}
                  composerAttachments={isActiveSession ? props.composerAttachments : []}
                  sendingMessage={isActiveSession ? props.sendingMessage : false}
                  stoppingMessage={isActiveSession ? props.stoppingMessage : false}
                  replyingInteractionId={isActiveSession ? props.replyingInteractionId : null}
                  onLoadFullSessionDetail={isActiveSession ? props.onLoadFullSessionDetail : undefined}
                  onCollapseFullSessionDetail={isActiveSession ? props.onCollapseFullSessionDetail : undefined}
                  renderStageShell={false}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
