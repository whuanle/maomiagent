import { Splitter } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  readWorkspaceExperienceState,
  updateWorkspaceExperienceState,
} from "../../../components/workspace-experience-state/workspace-experience-state";
import { notifier } from "../../../lib/notifications";
import type { UiDesignerPageProps } from "../types";
import { useUiDesignerShellState } from "../hooks/use-ui-designer-shell-state";
import type { UiDesignerStageKey } from "../services/stage-view-model-resolver";
import { ConversationRail } from "./conversation-rail";
import { DesignerFlowPanel } from "./designer-flow-panel";
import { StageDialog } from "./stage-dialog";
import { StageDetailPanel } from "./stage-detail-panel";

type UiDesignerWorkspaceShellProps = UiDesignerPageProps;

const STAGE_KEY_ALIASES = {
  stack: "theme",
  layouts: "pages",
} as const;

function normalizePrimaryStageKey(value: string | undefined): UiDesignerStageKey | undefined {
  if (!value) {
    return undefined;
  }

  return (STAGE_KEY_ALIASES[value as keyof typeof STAGE_KEY_ALIASES] ?? value) as UiDesignerStageKey;
}

function resolvePreferredActiveStageKey(
  stageViewModels: Array<{ stageKey: UiDesignerStageKey; status: "empty" | "partial" | "complete" }>,
  currentStageKey: string | undefined,
): UiDesignerStageKey {
  const normalizedCurrentStageKey = normalizePrimaryStageKey(currentStageKey);
  if (normalizedCurrentStageKey && stageViewModels.some((item) => item.stageKey === normalizedCurrentStageKey)) {
    return normalizedCurrentStageKey;
  }

  return stageViewModels.find((item) => item.status !== "complete")?.stageKey
    ?? stageViewModels[0]?.stageKey
    ?? "projectScope";
}

export function UiDesignerWorkspaceShell(props: UiDesignerWorkspaceShellProps) {
  const state = useUiDesignerShellState({
    active: props.active,
  });
  const [activeStageKey, setActiveStageKey] = useState<UiDesignerStageKey>(
    () => resolvePreferredActiveStageKey(
      state.stageViewModels,
      readWorkspaceExperienceState().uiDesigner.activeStageKey,
    ),
  );
  const lastErrorMessageRef = useRef<string | null>(null);
  const activeStage = useMemo(
    () => state.stageViewModels.find((item) => item.stageKey === activeStageKey) ?? state.stageViewModels[0],
    [activeStageKey, state.stageViewModels],
  );
  const knownStageKeys = useMemo(
    () => new Set(state.stageViewModels.map((item) => item.stageKey)),
    [state.stageViewModels],
  );

  useEffect(() => {
    const normalizedErrorMessage = state.errorMessage?.trim() ?? "";
    if (!normalizedErrorMessage) {
      lastErrorMessageRef.current = null;
      return;
    }

    if (lastErrorMessageRef.current === normalizedErrorMessage) {
      return;
    }

    lastErrorMessageRef.current = normalizedErrorMessage;
    notifier.error(normalizedErrorMessage);
  }, [state.errorMessage]);

  useEffect(() => {
    const preferredStageKey = resolvePreferredActiveStageKey(state.stageViewModels, activeStageKey);
    if (preferredStageKey !== activeStageKey) {
      setActiveStageKey(preferredStageKey);
    }
  }, [activeStageKey, state.stageViewModels]);

  useEffect(() => {
    updateWorkspaceExperienceState((current) => ({
      ...current,
      uiDesigner: {
        ...current.uiDesigner,
        activeStageKey,
      },
    }));
  }, [activeStageKey]);

  useEffect(() => {
    const nextStageKey = normalizePrimaryStageKey(state.suggestedStageKey);
    if (!nextStageKey) {
      return;
    }

    if (knownStageKeys.has(nextStageKey)) {
      setActiveStageKey(nextStageKey);
    }
    state.clearSuggestedStageKey();
  }, [knownStageKeys, state.clearSuggestedStageKey, state.suggestedStageKey]);

  return (
    <div
      className="chat-page-root ui-designer-page"
      data-testid="ui-designer-page"
      data-active={props.active ? "true" : "false"}
      data-language={props.language}
    >
      <Splitter className="ui-designer-page-splitter">
        <Splitter.Panel min={320} defaultSize="30%">
          <ConversationRail {...state} language={props.language} />
        </Splitter.Panel>
        <Splitter.Panel min={420} defaultSize="40%">
          <DesignerFlowPanel
            activeStageKey={activeStage?.stageKey ?? "projectScope"}
            pendingStageKey={state.pendingStageKey}
            stageViewModels={state.stageViewModels}
            designPackagePath={state.designerState?.designPackagePath}
            lockReason={state.designerState?.lockReason}
            missingItems={state.designerState?.readiness.missing ?? []}
            onSelectStage={setActiveStageKey}
            onStartStage={(stageKey) => {
              setActiveStageKey(stageKey);
              void state.openStageDialog(stageKey);
            }}
          />
        </Splitter.Panel>
        <Splitter.Panel min={320} defaultSize="30%">
          <StageDetailPanel activeStage={activeStage} />
        </Splitter.Panel>
      </Splitter>
      <StageDialog
        open={Boolean(state.activeLocalInteractionRequest && state.activeLocalInteractionId)}
        language={props.language}
        request={state.activeLocalInteractionRequest}
        submitting={Boolean(
          state.activeLocalInteractionId && state.replyingInteractionId === state.activeLocalInteractionId,
        )}
        onCancel={() => {
          if (state.activeLocalInteractionId) {
            void state.rejectInteraction(state.activeLocalInteractionId);
          }
        }}
        onSubmit={(response) => {
          if (state.activeLocalInteractionId) {
            void state.answerInteraction(state.activeLocalInteractionId, response);
          }
        }}
      />
    </div>
  );
}
