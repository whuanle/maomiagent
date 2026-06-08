import type {
  FormInteractionRequest,
  FormInteractionResponse,
} from "#maomiagent/kernel/core";
import { Button, Modal } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { LanguageCode } from "../../../config/titlebar";
import { StageFormRenderer } from "./stage-form-renderer";

type InteractionFormDraftValue = string | readonly string[] | boolean | undefined;

type StageDialogProps = {
  open: boolean;
  language: LanguageCode;
  request: FormInteractionRequest | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (response: FormInteractionResponse) => void;
};

function buildInitialValues(fields: FormInteractionRequest["fields"]) {
  return Object.fromEntries(fields.map((field) => {
    if (Array.isArray(field.value)) {
      return [field.key, [...field.value]];
    }

    return [field.key, field.value];
  })) as Record<string, InteractionFormDraftValue>;
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
  const normalizedValues: Record<string, string | readonly string[] | boolean> = {};

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

export function StageDialog(props: StageDialogProps) {
  const request = props.request;
  const initialValues = useMemo(
    () => (request ? buildInitialValues(request.fields) : {}),
    [request],
  );
  const [values, setValues] = useState<Record<string, InteractionFormDraftValue>>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const missingRequiredFields = useMemo(() => {
    if (!request) {
      return [];
    }

    return request.fields.filter((field) => field.required && isMissingRequiredValue(values[field.key]));
  }, [request, values]);

  const submitLabel = request?.submitLabel ?? (props.language === "en-US" ? "Submit" : "提交");
  const rejectLabel = request?.rejectLabel ?? (props.language === "en-US" ? "Cancel" : "取消");
  const actions = request?.actions?.length
    ? request.actions
    : [{ id: "submit", label: submitLabel, kind: "submit" as const }];

  return (
    <Modal
      open={props.open && Boolean(request)}
      title={request?.title}
      onCancel={props.onCancel}
      footer={null}
      width={720}
      style={{ top: 72 }}
      className="ui-designer-stage-dialog"
      styles={{ body: { maxHeight: "80vh", overflow: "auto", paddingTop: 8 } }}
      destroyOnHidden
      maskClosable={!props.submitting}
      closable={!props.submitting}
      keyboard={!props.submitting}
    >
      {request ? (
        <div className="ui-designer-stage-dialog-body">
          {request.description ? (
            <p className="ui-designer-stage-dialog-description">{request.description}</p>
          ) : null}
          <StageFormRenderer
            fields={request.fields}
            values={values}
            disabled={props.submitting}
            onChange={(key, value) => {
              setValues((current) => ({
                ...current,
                [key]: value,
              }));
            }}
          />
          {missingRequiredFields.length > 0 ? (
            <div className="ui-designer-stage-dialog-note">请先补全必填项。</div>
          ) : null}
          <div className="ui-designer-stage-dialog-actions">
            {actions.map((action) => (
              <Button
                key={action.id}
                type={action.kind === "submit" ? "primary" : "default"}
                danger={action.kind === "danger"}
                ghost={action.kind === "link"}
                disabled={props.submitting || (action.kind === "submit" && missingRequiredFields.length > 0)}
                loading={action.kind === "submit" ? props.submitting : false}
                onClick={() => props.onSubmit({
                  kind: "form",
                  values: normalizeSubmittedFieldValues(values),
                  ...(action.id !== "submit" ? { actionId: action.id } : {}),
                })}
              >
                {action.label}
              </Button>
            ))}
            <Button disabled={props.submitting} onClick={props.onCancel}>
              {rejectLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default StageDialog;
