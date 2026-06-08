import { Button, Modal } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { UiDesignerStageKey } from "../services/stage-view-model-resolver";
import { StageFormRenderer, type UiDesignerInteractionField } from "./stage-form-renderer";

export type UiDesignerInteractionSchema = {
  stageKey: UiDesignerStageKey;
  title: string;
  description?: string;
  submitLabel: string;
  cancelLabel: string;
  allowSkip: boolean;
  fields: UiDesignerInteractionField[];
};

type StageDialogProps = {
  open: boolean;
  schema: UiDesignerInteractionSchema | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
};

function buildInitialValues(fields: UiDesignerInteractionField[]) {
  return Object.fromEntries(fields.map((field) => [
    field.key,
    field.defaultValue ?? (field.kind === "multiSelect" ? [] : field.kind === "boolean" ? false : ""),
  ]));
}

export function StageDialog(props: StageDialogProps) {
  const schema = props.schema;
  const initialValues = useMemo(
    () => (schema ? buildInitialValues(schema.fields) : {}),
    [schema],
  );
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  return (
    <Modal
      open={props.open && Boolean(schema)}
      title={schema?.title}
      onCancel={props.onCancel}
      footer={null}
      width={720}
      className="ui-designer-stage-dialog"
      styles={{ body: { maxHeight: "80vh", overflow: "auto", paddingTop: 8 } }}
      destroyOnHidden
    >
      {schema ? (
        <div className="ui-designer-stage-dialog-body">
          {schema.description ? (
            <p className="ui-designer-stage-dialog-description">{schema.description}</p>
          ) : null}
          <StageFormRenderer
            fields={schema.fields}
            values={values}
            disabled={props.submitting}
            onChange={(key, value) => {
              setValues((current) => ({
                ...current,
                [key]: value,
              }));
            }}
          />
          <div className="ui-designer-stage-dialog-actions">
            <Button onClick={props.onCancel}>{schema.cancelLabel}</Button>
            <Button type="primary" loading={props.submitting} onClick={() => props.onSubmit(values)}>
              {schema.submitLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default StageDialog;
