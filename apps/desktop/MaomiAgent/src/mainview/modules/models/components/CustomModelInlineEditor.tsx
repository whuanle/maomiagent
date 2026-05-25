import { Button, Checkbox, Form, Input, InputNumber, Select, Space, Typography } from "antd";
import { useEffect } from "react";

import type { Translate } from "../../../i18n";
import type { EditableCustomChannelModel } from "../services/custom-model-metadata";

const COMMON_MODALITY_OPTIONS = [
  { label: "text", value: "text" },
  { label: "image", value: "image" },
  { label: "audio", value: "audio" },
  { label: "video", value: "video" },
  { label: "pdf", value: "pdf" },
  { label: "embedding", value: "embedding" },
  { label: "json", value: "json" },
] as const;

const CAPABILITY_ATTACHMENTS = "attachments";
const CAPABILITY_REASONING = "reasoning";
const CAPABILITY_FUNCTION_CALL = "function-call";
const CAPABILITY_STRUCTURED_OUTPUT = "structured-output";
const CAPABILITY_TEMPERATURE = "temperature";

type CustomModelFormState = {
  modelId: string;
  displayName: string;
  family?: string;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  inputModalities: string[];
  outputModalities: string[];
  capabilityKeys: string[];
};

type CustomModelInlineEditorProps = {
  model: EditableCustomChannelModel;
  submitting: boolean;
  t: Translate;
  onCancel: () => void;
  onSubmit: (model: EditableCustomChannelModel) => void | Promise<void>;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeModalityValues(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}

export function CustomModelInlineEditor(props: CustomModelInlineEditorProps) {
  const { model, submitting, t, onCancel, onSubmit } = props;
  const [form] = Form.useForm<CustomModelFormState>();

  useEffect(() => {
    const capabilityKeys: string[] = [];
    if (model.supportsAttachments) {
      capabilityKeys.push(CAPABILITY_ATTACHMENTS);
    }
    if (model.supportsReasoning) {
      capabilityKeys.push(CAPABILITY_REASONING);
    }
    if (model.supportsFunctionCall) {
      capabilityKeys.push(CAPABILITY_FUNCTION_CALL);
    }
    if (model.supportsStructuredOutput) {
      capabilityKeys.push(CAPABILITY_STRUCTURED_OUTPUT);
    }
    if (model.supportsTemperature) {
      capabilityKeys.push(CAPABILITY_TEMPERATURE);
    }

    form.setFieldsValue({
      modelId: model.modelId,
      displayName: model.displayName,
      family: model.family,
      contextWindow: model.contextWindow ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      inputModalities: [...model.modalities.input],
      outputModalities: [...model.modalities.output],
      capabilityKeys,
    });
  }, [form, model]);

  const capabilityOptions = [
    { label: t("模型页.字段.能力.多模态"), value: CAPABILITY_ATTACHMENTS },
    { label: t("模型页.字段.能力.推理"), value: CAPABILITY_REASONING },
    { label: t("模型页.字段.能力.工具"), value: CAPABILITY_FUNCTION_CALL },
    { label: t("模型页.字段.能力.结构化"), value: CAPABILITY_STRUCTURED_OUTPUT },
    { label: t("模型页.字段.能力.温度"), value: CAPABILITY_TEMPERATURE },
  ];

  const handleFinish = (values: CustomModelFormState) => {
    const capabilitySet = new Set(values.capabilityKeys ?? []);
    void onSubmit({
      modelId: values.modelId,
      displayName: values.displayName?.trim() ?? "",
      family: normalizeOptionalString(values.family),
      contextWindow: values.contextWindow ?? undefined,
      maxOutputTokens: values.maxOutputTokens ?? undefined,
      supportsAttachments: capabilitySet.has(CAPABILITY_ATTACHMENTS),
      supportsReasoning: capabilitySet.has(CAPABILITY_REASONING),
      supportsFunctionCall: capabilitySet.has(CAPABILITY_FUNCTION_CALL),
      supportsStructuredOutput: capabilitySet.has(CAPABILITY_STRUCTURED_OUTPUT),
      supportsTemperature: capabilitySet.has(CAPABILITY_TEMPERATURE),
      modalities: {
        input: normalizeModalityValues(values.inputModalities),
        output: normalizeModalityValues(values.outputModalities),
      },
    });
  };

  return (
    <div className="models-page-inline-editor">
      <div className="models-page-inline-editor-header">
        <div className="models-page-inline-editor-heading">
          <Typography.Text strong>{t("模型页.弹窗.编辑模型标题")}</Typography.Text>
          <Typography.Text type="secondary">{model.modelId}</Typography.Text>
        </div>
        <Space size={8}>
          <Button onClick={onCancel}>
            {t("工作区页.按钮.取消")}
          </Button>
          <Button type="primary" loading={submitting} onClick={() => void form.submit()}>
            {t("技能页.按钮.保存")}
          </Button>
        </Space>
      </div>

      <Form<CustomModelFormState>
        form={form}
        layout="vertical"
        className="models-page-custom-model-form"
        onFinish={handleFinish}
      >
        <div className="models-page-custom-model-grid">
          <Form.Item label={t("模型页.字段.模型ID")} name="modelId">
            <Input disabled />
          </Form.Item>
          <Form.Item label={t("模型页.字段.显示名称")} name="displayName">
            <Input />
          </Form.Item>
          <Form.Item label={t("模型页.字段.模型家族")} name="family">
            <Input />
          </Form.Item>
          <Form.Item label={t("模型页.字段.上下文窗口")} name="contextWindow">
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label={t("模型页.字段.最大输出")} name="maxOutputTokens">
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <div className="models-page-custom-model-grid">
          <Form.Item label={t("模型页.字段.输入模态")} name="inputModalities">
            <Select
              mode="tags"
              options={COMMON_MODALITY_OPTIONS.map((item) => ({ ...item }))}
              placeholder={t("模型页.字段.模型模态占位")}
              tokenSeparators={[","]}
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item label={t("模型页.字段.输出模态")} name="outputModalities">
            <Select
              mode="tags"
              options={COMMON_MODALITY_OPTIONS.map((item) => ({ ...item }))}
              placeholder={t("模型页.字段.模型模态占位")}
              tokenSeparators={[","]}
              maxTagCount="responsive"
            />
          </Form.Item>
        </div>

        <Form.Item label={t("模型页.字段.模型能力")} name="capabilityKeys">
          <Checkbox.Group options={capabilityOptions} className="models-page-custom-model-capabilities" />
        </Form.Item>
      </Form>
    </div>
  );
}
