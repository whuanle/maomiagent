import type { InteractionFormField } from "#maomiagent/kernel/core";
import { Button, Input, Select, Switch } from "antd";
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

type InteractionFormValue = string | readonly string[] | boolean;
type InteractionFormDraftValue = InteractionFormValue | undefined;

function buildInitialFieldValues(interaction: ConversationInteractionEntry) {
  if (interaction.request.kind !== "form") {
    return {} as Record<string, InteractionFormDraftValue>;
  }

  const initialValues: Record<string, InteractionFormDraftValue> = {};
  for (const field of interaction.request.fields) {
    if (Array.isArray(field.value)) {
      initialValues[field.key] = [...field.value];
      continue;
    }

    initialValues[field.key] = field.value;
  }

  return initialValues;
}

function isMissingRequiredValue(value: InteractionFormDraftValue) {
  if (typeof value === "boolean") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return typeof value !== "string" || value.trim().length === 0;
}

function normalizeSubmittedFieldValues(values: Record<string, InteractionFormDraftValue>) {
  const normalizedValues: Record<string, InteractionFormValue> = {};

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      normalizedValues[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        normalizedValues[key] = value;
      }
      continue;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        normalizedValues[key] = normalized;
      }
    }

  }

  return normalizedValues;
}

function renderRecommendedOptions(input: {
  field: InteractionFormField;
  fieldValue: InteractionFormDraftValue;
  replying: boolean;
  onSelect: (value: string) => void;
}) {
  if (input.field.kind !== "text" || !input.field.recommendedOptions?.length) {
    return null;
  }

  const selectedValue = typeof input.fieldValue === "string" ? input.fieldValue.trim() : "";

  return (
    <div className="chat-assistant-interaction-option-grid">
      {input.field.recommendedOptions.map((option) => {
        const selected = selectedValue === option.value;
        return (
          <Button
            key={`${input.field.key}:${option.value}`}
            type={selected ? "primary" : "default"}
            size="small"
            className={`chat-assistant-interaction-action chat-assistant-interaction-option${selected ? " is-selected" : ""}`}
            disabled={input.replying}
            onClick={() => input.onSelect(option.value)}
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
  );
}

export function AssistantInteractionFormCard(props: Props) {
  if (props.interaction.request.kind !== "form") {
    return null;
  }

  const isEn = props.language === "en-US";
  const request = props.interaction.request;
  const [fieldValues, setFieldValues] = useState<Record<string, InteractionFormDraftValue>>(() =>
    buildInitialFieldValues(props.interaction));

  const missingRequiredFields = useMemo(() => request.fields.filter((field) =>
    field.required && isMissingRequiredValue(fieldValues[field.key])), [fieldValues, request.fields]);

  const submitLabel = request.submitLabel ?? (isEn ? "Submit" : "提交");
  const rejectLabel = request.rejectLabel ?? (isEn ? "Reject" : "拒绝");

  const actionButtons = request.actions?.length
    ? request.actions
    : [{ id: "submit", label: submitLabel, kind: "submit" as const }];

  return (
    <div className="chat-assistant-interaction-card is-form is-asked is-dock">
      <div className="chat-assistant-interaction-head">
        <div className="chat-assistant-interaction-head-main">
          <span className="chat-assistant-interaction-head-label">
            {request.layout === "confirm"
              ? (isEn ? "Confirmation" : "确认卡")
              : (isEn ? "Form" : "表单确认")}
          </span>
          <span className="chat-assistant-interaction-head-summary">
            {request.title}
          </span>
        </div>
        <span className="chat-assistant-interaction-head-status is-running">
          {isEn ? "Waiting for input" : "等待填写"}
        </span>
      </div>

      {request.description ? (
        <div className="chat-assistant-interaction-copy">
          {request.description}
        </div>
      ) : null}

      {request.fields.length > 0 ? (
        <div className="chat-assistant-interaction-section">
          {request.fields.map((field) => {
            const fieldValue = fieldValues[field.key];
            return (
              <div key={field.key} className="chat-assistant-interaction-form-field">
                <div className="chat-assistant-interaction-section-label">
                  {field.label}
                </div>
                {field.description ? (
                  <div className="chat-assistant-interaction-note">
                    {field.description}
                  </div>
                ) : null}
                {field.kind === "text" ? (
                  <>
                    {renderRecommendedOptions({
                      field,
                      fieldValue,
                      replying: props.replying,
                      onSelect: (nextValue) => {
                        setFieldValues((current) => ({
                          ...current,
                          [field.key]: nextValue,
                        }));
                      },
                    })}
                    <Input
                      disabled={props.replying}
                      placeholder={field.placeholder}
                      value={typeof fieldValue === "string" ? fieldValue : ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setFieldValues((current) => ({
                          ...current,
                          [field.key]: nextValue,
                        }));
                      }}
                    />
                  </>
                ) : null}
                {field.kind === "textarea" ? (
                  <Input.TextArea
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    disabled={props.replying}
                    placeholder={field.placeholder}
                    value={typeof fieldValue === "string" ? fieldValue : ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setFieldValues((current) => ({
                        ...current,
                        [field.key]: nextValue,
                      }));
                    }}
                  />
                ) : null}
                {field.kind === "select" ? (
                  <Select
                    allowClear={!field.required}
                    disabled={props.replying}
                    options={field.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
                    placeholder={field.placeholder}
                    value={typeof fieldValue === "string" ? fieldValue : undefined}
                    onChange={(nextValue) => {
                      setFieldValues((current) => ({
                        ...current,
                        [field.key]: typeof nextValue === "string" ? nextValue : undefined,
                      }));
                    }}
                  />
                ) : null}
                {field.kind === "multiselect" ? (
                  <Select
                    mode={field.allowCustom ? "tags" : "multiple"}
                    disabled={props.replying}
                    options={field.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
                    placeholder={field.placeholder}
                    value={Array.isArray(fieldValue) ? [...fieldValue] : []}
                    onChange={(nextValue) => {
                      setFieldValues((current) => ({
                        ...current,
                        [field.key]: Array.isArray(nextValue) ? nextValue.filter((value): value is string => typeof value === "string") : [],
                      }));
                    }}
                  />
                ) : null}
                {field.kind === "boolean" ? (
                  <div className="chat-assistant-interaction-actions">
                    <span className="chat-assistant-interaction-note">
                      {fieldValue === true
                        ? (field.trueLabel || (isEn ? "Enabled" : "是"))
                        : (field.falseLabel || (isEn ? "Disabled" : "否"))}
                    </span>
                    <Switch
                      checked={fieldValue === true}
                      disabled={props.replying}
                      onChange={(checked) => {
                        setFieldValues((current) => ({
                          ...current,
                          [field.key]: checked,
                        }));
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {missingRequiredFields.length > 0 ? (
        <div className="chat-assistant-interaction-note">
          {isEn ? "Please fill the required fields before continuing." : "请先补全必填项。"}
        </div>
      ) : null}

      <div className="chat-assistant-interaction-actions">
        {actionButtons.map((action) => (
          <Button
            key={action.id}
            type={action.kind === "submit" ? "primary" : "default"}
            danger={action.kind === "danger"}
            size="small"
            className={`chat-assistant-interaction-action${action.kind === "submit" ? " is-primary" : ""}`}
            loading={action.kind === "submit" ? props.replying : false}
            disabled={props.replying || (action.kind === "submit" && missingRequiredFields.length > 0)}
            onClick={() => {
              props.onAnswerInteraction(props.interaction.interactionId, {
                kind: "form",
                values: normalizeSubmittedFieldValues(fieldValues),
                ...(action.id !== "submit" ? { actionId: action.id } : {}),
              });
            }}
          >
            {action.label}
          </Button>
        ))}
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
  );
}

export default AssistantInteractionFormCard;
