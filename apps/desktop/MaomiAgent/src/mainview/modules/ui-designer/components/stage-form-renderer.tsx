import { Input, Select, Switch } from "antd";

export type UiDesignerInteractionField =
  | {
      key: string;
      label: string;
      kind: "text";
      required: boolean;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      key: string;
      label: string;
      kind: "textarea";
      required: boolean;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      key: string;
      label: string;
      kind: "singleSelect";
      required: boolean;
      options: Array<{ label: string; value: string }>;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      key: string;
      label: string;
      kind: "multiSelect";
      required: boolean;
      options: Array<{ label: string; value: string }>;
      placeholder?: string;
      defaultValue?: string[];
    }
  | {
      key: string;
      label: string;
      kind: "boolean";
      required: boolean;
      defaultValue?: boolean;
    };

type StageFormRendererProps = {
  fields: UiDesignerInteractionField[];
  values: Record<string, unknown>;
  disabled: boolean;
  onChange: (key: string, value: unknown) => void;
};

export function StageFormRenderer(props: StageFormRendererProps) {
  return (
    <div className="ui-designer-stage-form">
      {props.fields.map((field) => (
        <label key={field.key} className="ui-designer-stage-form-field">
          <span className="ui-designer-status-bar-label">{field.label}</span>
          {field.kind === "text" ? (
            <Input
              value={typeof props.values[field.key] === "string" ? props.values[field.key] as string : ""}
              disabled={props.disabled}
              placeholder={field.placeholder}
              onChange={(event) => props.onChange(field.key, event.target.value)}
            />
          ) : null}
          {field.kind === "textarea" ? (
            <Input.TextArea
              value={typeof props.values[field.key] === "string" ? props.values[field.key] as string : ""}
              disabled={props.disabled}
              placeholder={field.placeholder}
              autoSize={{ minRows: 3, maxRows: 6 }}
              onChange={(event) => props.onChange(field.key, event.target.value)}
            />
          ) : null}
          {field.kind === "singleSelect" ? (
            <Select
              value={typeof props.values[field.key] === "string" ? props.values[field.key] as string : undefined}
              options={field.options}
              style={{ width: "100%" }}
              disabled={props.disabled}
              placeholder={field.placeholder}
              onChange={(value) => props.onChange(field.key, value)}
            />
          ) : null}
          {field.kind === "multiSelect" ? (
            <Select
              mode="multiple"
              value={Array.isArray(props.values[field.key]) ? props.values[field.key] as string[] : []}
              options={field.options}
              style={{ width: "100%" }}
              disabled={props.disabled}
              placeholder={field.placeholder}
              onChange={(value) => props.onChange(field.key, value)}
            />
          ) : null}
          {field.kind === "boolean" ? (
            <Switch
              checked={props.values[field.key] === true}
              disabled={props.disabled}
              onChange={(checked) => props.onChange(field.key, checked)}
            />
          ) : null}
        </label>
      ))}
    </div>
  );
}

export default StageFormRenderer;
