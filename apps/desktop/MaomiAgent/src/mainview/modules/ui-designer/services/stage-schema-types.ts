import type { UiDesignerStageKey } from "./stage-view-model-resolver";

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

export type UiDesignerInteractionSchema = {
  stageKey: UiDesignerStageKey;
  title: string;
  description?: string;
  submitLabel: string;
  cancelLabel: string;
  allowSkip: boolean;
  fields: UiDesignerInteractionField[];
};

