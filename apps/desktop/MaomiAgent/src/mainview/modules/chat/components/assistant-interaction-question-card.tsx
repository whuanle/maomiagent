import { Button, Input } from "antd";
import { useMemo, useState } from "react";

import type { ConversationInteractionEntry } from "#maomiagent/kernel/src/host/application";
import type { LanguageCode } from "../../../config/titlebar";

type Props = {
  interaction: ConversationInteractionEntry;
  language: LanguageCode;
  replying: boolean;
  onAnswerInteraction: (interactionId: string, response: unknown) => void;
  onRejectInteraction: (interactionId: string) => void;
};

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCompactPlanExitQuestion(interaction: ConversationInteractionEntry) {
  if (interaction.request.kind !== "question") {
    return false;
  }

  const toolName = trimText(interaction.request.metadata?.toolName);
  const firstItem = interaction.request.items[0];
  return toolName === "plan_exit"
    && interaction.request.items.length === 1
    && Boolean(firstItem)
    && firstItem?.multiple !== true
    && firstItem?.allowCustom !== true
    && (firstItem?.options?.length ?? 0) === 2;
}

function getCompactPlanExitCopy(isEn: boolean) {
  return {
    prompt: isEn
      ? "The plan is ready. Choose the next step."
      : "计划已准备好，选择下一步。",
    approveLabel: isEn ? "Exit plan mode" : "退出 Plan 模式",
    continueLabel: isEn ? "Keep planning" : "继续规划",
  };
}

function toggleQuestionValue(currentValues: string[], nextValue: string, multiple: boolean) {
  if (multiple) {
    return currentValues.includes(nextValue)
      ? currentValues.filter((value) => value !== nextValue)
      : [...currentValues, nextValue];
  }

  return currentValues.includes(nextValue) ? [] : [nextValue];
}

function normalizeQuestionAnswerValues(input: {
  selectedValues: string[];
  customValue: string;
  multiple: boolean;
}) {
  const customValue = input.customValue.trim();
  if (!customValue) {
    return input.selectedValues;
  }

  if (!input.multiple) {
    return [customValue];
  }

  return [...new Set([...input.selectedValues, customValue])];
}

export function AssistantInteractionQuestionCard(props: Props) {
  if (props.interaction.request.kind !== "question") {
    return null;
  }

  const isEn = props.language === "en-US";
  const request = props.interaction.request;
  const compactPlanExit = isCompactPlanExitQuestion(props.interaction);
  const [selectedValuesByQuestionId, setSelectedValuesByQuestionId] = useState<Record<string, string[]>>({});
  const [customValuesByQuestionId, setCustomValuesByQuestionId] = useState<Record<string, string>>({});

  const answers = useMemo(() => request.items
    .map((item) => {
      const selectedValues = selectedValuesByQuestionId[item.id] ?? [];
      const customValue = customValuesByQuestionId[item.id] ?? "";
      const values = normalizeQuestionAnswerValues({
        selectedValues,
        customValue,
        multiple: item.multiple === true,
      });
      if (values.length === 0) {
        return undefined;
      }

      return {
        questionId: item.id,
        values,
      };
    })
    .filter((answer): answer is NonNullable<typeof answer> => Boolean(answer)), [customValuesByQuestionId, request.items, selectedValuesByQuestionId]);

  const submitLabel = request.confirmLabel ?? (isEn ? "Submit answers" : "提交回答");
  const rejectLabel = request.rejectLabel ?? (isEn ? "Reject" : "拒绝");
  const selectionSummary = answers.length > 0
    ? (isEn ? `${answers.length} answer set ready` : `已准备 ${answers.length} 组回答`)
    : (isEn ? "Choose an option or enter an answer to continue." : "请选择一个选项或填写回答后继续。");

  if (compactPlanExit) {
    const item = request.items[0]!;
    const copy = getCompactPlanExitCopy(isEn);

    return (
      <div className="chat-assistant-interaction-card is-question is-asked is-dock is-compact-question">
        <div className="chat-assistant-interaction-compact-copy">
          {copy.prompt}
        </div>
        <div className="chat-assistant-interaction-compact-actions">
          <Button
            type="primary"
            size="small"
            className="chat-assistant-interaction-action is-primary"
            disabled={props.replying}
            onClick={() => {
              props.onAnswerInteraction(props.interaction.interactionId, {
                kind: "question",
                answers: [{
                  questionId: item.id,
                  values: ["approve"],
                }],
              });
            }}
          >
            {copy.approveLabel}
          </Button>
          <Button
            size="small"
            className="chat-assistant-interaction-action"
            disabled={props.replying}
            onClick={() => {
              props.onAnswerInteraction(props.interaction.interactionId, {
                kind: "question",
                answers: [{
                  questionId: item.id,
                  values: ["continue_planning"],
                }],
              });
            }}
          >
            {copy.continueLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-assistant-interaction-card is-question is-asked is-dock">
      <div className="chat-assistant-interaction-head">
        <div className="chat-assistant-interaction-head-main">
          <span className="chat-assistant-interaction-head-label">
            {isEn ? "Question" : "提问确认"}
          </span>
          <span className="chat-assistant-interaction-head-summary">
            {request.title || (isEn ? "Answer before continuing" : "继续前请先回答")}
          </span>
        </div>
        <span className="chat-assistant-interaction-head-status is-running">
          {isEn ? "Waiting for answer" : "等待回答"}
        </span>
      </div>

      {request.description ? (
        <div className="chat-assistant-interaction-copy">
          {request.description}
        </div>
      ) : null}

      <div className="chat-assistant-interaction-question-list">
        {request.items.map((item) => {
          const selectedValues = selectedValuesByQuestionId[item.id] ?? [];
          const customValue = customValuesByQuestionId[item.id] ?? "";
          const choiceModeLabel = item.multiple === true
            ? (isEn ? "Multiple choice" : "可多选")
            : (isEn ? "Choose one" : "单选");
          return (
            <div key={item.id} className="chat-assistant-interaction-question-item">
              <div className="chat-assistant-interaction-question-meta">
                <div className="chat-assistant-interaction-question-meta-main">
                  <div className="chat-assistant-interaction-section-label">
                    {item.header}
                  </div>
                  <div className="chat-assistant-interaction-copy">
                    {item.question}
                  </div>
                </div>
                <span className="chat-assistant-interaction-badge is-neutral">
                  {choiceModeLabel}
                </span>
              </div>
              {item.description ? (
                <div className="chat-assistant-interaction-note">
                  {item.description}
                </div>
              ) : null}
              {item.options?.length ? (
                <div className="chat-assistant-interaction-option-grid">
                  {item.options.map((option) => {
                    const selected = selectedValues.includes(option.value);
                    return (
                      <Button
                        key={`${item.id}:${option.value}`}
                        type={selected ? "primary" : "default"}
                        size="small"
                        className={`chat-assistant-interaction-action chat-assistant-interaction-option${selected ? " is-selected" : ""}`}
                        disabled={props.replying}
                        onClick={() => {
                          setSelectedValuesByQuestionId((current) => ({
                            ...current,
                            [item.id]: toggleQuestionValue(current[item.id] ?? [], option.value, item.multiple === true),
                          }));
                        }}
                      >
                        <span className="chat-assistant-interaction-option-text">
                          <span className="chat-assistant-interaction-option-label">{option.label}</span>
                          {option.description ? (
                            <span className="chat-assistant-interaction-option-description">{option.description}</span>
                          ) : null}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              ) : null}
              {item.allowCustom ? (
                <Input.TextArea
                  className="chat-assistant-interaction-textarea"
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  disabled={props.replying}
                  placeholder={item.placeholder || (isEn ? "Add an answer" : "补充回答")}
                  value={customValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCustomValuesByQuestionId((current) => ({
                      ...current,
                      [item.id]: nextValue,
                    }));
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="chat-assistant-interaction-footer">
        <div className="chat-assistant-interaction-footer-note">
          {selectionSummary}
        </div>
        <div className="chat-assistant-interaction-actions">
          <Button
            type="primary"
            size="small"
            className="chat-assistant-interaction-action is-primary"
            loading={props.replying}
            disabled={props.replying || answers.length === 0}
            onClick={() => {
              props.onAnswerInteraction(props.interaction.interactionId, {
                kind: "question",
                answers,
              });
            }}
          >
            {submitLabel}
          </Button>
          <Button
            danger
            size="small"
            type="text"
            className="chat-assistant-interaction-action is-danger"
            disabled={props.replying}
            onClick={() => props.onRejectInteraction(props.interaction.interactionId)}
          >
            {rejectLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AssistantInteractionQuestionCard;