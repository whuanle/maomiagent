import type { InteractionFormField } from "#maomiagent/kernel/core";
import { Button, Input, Select, Switch } from "antd";

type InteractionFormDraftValue = string | readonly string[] | boolean | undefined;

type StageFormRendererProps = {
  fields: readonly InteractionFormField[];
  values: Record<string, InteractionFormDraftValue>;
  disabled: boolean;
  onChange: (key: string, value: InteractionFormDraftValue) => void;
};

function renderRecommendedOptions(input: {
  field: InteractionFormField;
  value: InteractionFormDraftValue;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  if (input.field.kind !== "text" || !input.field.recommendedOptions?.length) {
    return null;
  }

  const selectedValue = typeof input.value === "string" ? input.value.trim() : "";

  return (
    <div className="ui-designer-stage-form-option-grid">
      {input.field.recommendedOptions.map((option) => {
        const selected = selectedValue === option.value;
        return (
          <Button
            key={`${input.field.key}:${option.value}`}
            type={selected ? "primary" : "default"}
            className={`ui-designer-stage-form-option${selected ? " is-selected" : ""}`}
            disabled={input.disabled}
            onClick={() => input.onSelect(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function StageFormRenderer(props: StageFormRendererProps) {
  return (
    <div className="ui-designer-stage-form">
      {props.fields.map((field) => {
        const fieldValue = props.values[field.key];

        return (
          <label key={field.key} className="ui-designer-stage-form-field">
            <span className="ui-designer-stage-form-label">{field.label}</span>
            {field.description ? (
              <span className="ui-designer-stage-form-description">{field.description}</span>
            ) : null}
            {field.kind === "text" ? (
              <>
                {renderRecommendedOptions({
                  field,
                  value: fieldValue,
                  disabled: props.disabled,
                  onSelect: (value) => props.onChange(field.key, value),
                })}
                <Input
                  value={typeof fieldValue === "string" ? fieldValue : ""}
                  disabled={props.disabled}
                  placeholder={field.placeholder}
                  onChange={(event) => props.onChange(field.key, event.target.value)}
                />
              </>
            ) : null}
            {field.kind === "textarea" ? (
              <Input.TextArea
                value={typeof fieldValue === "string" ? fieldValue : ""}
                disabled={props.disabled}
                placeholder={field.placeholder}
                autoSize={{ minRows: 3, maxRows: 6 }}
                onChange={(event) => props.onChange(field.key, event.target.value)}
              />
            ) : null}
            {field.kind === "select" ? (
              <Select
                allowClear={!field.required}
                value={typeof fieldValue === "string" ? fieldValue : undefined}
                options={field.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
                disabled={props.disabled}
                placeholder={field.placeholder}
                onChange={(value) => props.onChange(field.key, typeof value === "string" ? value : undefined)}
              />
            ) : null}
            {field.kind === "multiselect" ? (
              <Select
                mode={field.allowCustom ? "tags" : "multiple"}
                value={Array.isArray(fieldValue) ? [...fieldValue] : []}
                options={field.options?.map((option) => ({ value: option.value, label: option.label })) ?? []}
                disabled={props.disabled}
                placeholder={field.placeholder}
                onChange={(value) => props.onChange(
                  field.key,
                  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
                )}
              />
            ) : null}
            {field.kind === "boolean" ? (
              <div className="ui-designer-stage-form-boolean">
                <span className="ui-designer-stage-form-boolean-value">
                  {fieldValue === true ? (field.trueLabel || "是") : (field.falseLabel || "否")}
                </span>
                <Switch
                  checked={fieldValue === true}
                  disabled={props.disabled}
                  onChange={(checked) => props.onChange(field.key, checked)}
                />
              </div>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

export default StageFormRenderer;
