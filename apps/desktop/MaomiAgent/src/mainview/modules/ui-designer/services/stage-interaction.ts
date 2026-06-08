import type { FormInteractionRequest } from "#maomiagent/kernel/core";

import type { UiDesignerInteractionSchema } from "./stage-schema-types";
import type { UiDesignerStageKey } from "./stage-view-model-resolver";

export function buildUiDesignerStageInteractionRequest(
  schema: UiDesignerInteractionSchema,
): FormInteractionRequest {
  return {
    kind: "form",
    title: schema.title,
    ...(schema.description ? { description: schema.description } : {}),
    submitLabel: schema.submitLabel,
    rejectLabel: schema.cancelLabel,
    fields: schema.fields.map((field) => {
      if (field.kind === "text" || field.kind === "textarea") {
        return {
          key: field.key,
          label: field.label,
          kind: field.kind,
          required: field.required,
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(field.defaultValue !== undefined ? { value: field.defaultValue } : {}),
        } as const;
      }

      if (field.kind === "singleSelect") {
        return {
          key: field.key,
          label: field.label,
          kind: "select",
          required: field.required,
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(field.defaultValue !== undefined ? { value: field.defaultValue } : {}),
          options: field.options,
        } as const;
      }

      if (field.kind === "multiSelect") {
        return {
          key: field.key,
          label: field.label,
          kind: "multiselect",
          required: field.required,
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(field.defaultValue !== undefined ? { value: field.defaultValue } : {}),
          options: field.options,
        } as const;
      }

      return {
        key: field.key,
        label: field.label,
        kind: "boolean",
        required: field.required,
        ...(field.defaultValue !== undefined ? { value: field.defaultValue } : {}),
      } as const;
    }),
    metadata: {
      moduleId: "ui-designer",
      surface: "ui-designer",
      focusBlock: schema.stageKey,
      interactionKey: schema.stageKey,
    },
  };
}

export function buildUiDesignerStageInteractionId(stageKey: UiDesignerStageKey) {
  return `ui-designer:stage:${stageKey}`;
}
