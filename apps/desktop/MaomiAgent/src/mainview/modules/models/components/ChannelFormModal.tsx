import { Alert, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Typography } from "antd";
import { useEffect, useMemo } from "react";
import {
  isValidDesktopModelChannelId,
  normalizeDesktopModelChannelId,
} from "../../../../shared/desktop-models";
import type {
  DesktopModelProviderConfigField,
  DesktopModelProviderConfigValue,
  DesktopModelProviderItem,
} from "../../../../shared/desktop-models";
import type { Translate } from "../../../i18n";
import type {
  ModelsChannelEditorState,
  ModelsChannelFormValues,
} from "../types";

type ChannelFormModalProps = {
  open: boolean;
  editor: ModelsChannelEditorState | null;
  providers: DesktopModelProviderItem[];
  submitting: boolean;
  t: Translate;
  onCancel: () => void;
  onSubmit: (values: ModelsChannelFormValues) => Promise<void>;
};

function extractLegacyEnvValues(editor: ModelsChannelEditorState | null) {
  const env = editor?.mode === "edit"
    && editor.item.metadata
    && typeof editor.item.metadata === "object"
    && !Array.isArray(editor.item.metadata)
      ? (editor.item.metadata.env as Record<string, unknown> | undefined)
      : undefined;

  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(env)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function extractStoredConfigValues(editor: ModelsChannelEditorState | null) {
  const config = editor?.mode === "edit"
    && editor.item.metadata
    && typeof editor.item.metadata === "object"
    && !Array.isArray(editor.item.metadata)
      ? (editor.item.metadata.config as Record<string, unknown> | undefined)
      : undefined;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(config)
      .filter((entry): entry is [string, DesktopModelProviderConfigValue] => (
        typeof entry[1] === "string"
        || typeof entry[1] === "number"
        || typeof entry[1] === "boolean"
      )),
  );
}

function buildProviderConfigDefaults(provider: DesktopModelProviderItem | null | undefined) {
  const next: Record<string, DesktopModelProviderConfigValue> = {};

  for (const field of provider?.configSchema ?? []) {
    if (field.defaultValue !== undefined) {
      next[field.key] = field.defaultValue;
      continue;
    }

    if (field.type === "boolean") {
      next[field.key] = false;
      continue;
    }

    if (field.type !== "number" && field.type !== "select") {
      next[field.key] = "";
    }
  }

  return next;
}

function extractConfigValues(
  editor: ModelsChannelEditorState | null,
  provider: DesktopModelProviderItem | null | undefined,
) {
  const next = {
    ...buildProviderConfigDefaults(provider),
    ...extractStoredConfigValues(editor),
  };
  const legacyEnv = extractLegacyEnvValues(editor);

  for (const field of provider?.configSchema ?? []) {
    if (!field.envKey) {
      continue;
    }

    const currentValue = next[field.key];
    if (
      currentValue !== undefined
      && currentValue !== ""
    ) {
      continue;
    }

    const legacyValue = legacyEnv[field.envKey];
    if (typeof legacyValue === "string" && legacyValue.length > 0) {
      next[field.key] = legacyValue;
    }
  }

  return next;
}

export function ChannelFormModal(props: ChannelFormModalProps) {
  const { open, editor, providers, submitting, t, onCancel, onSubmit } = props;
  const [form] = Form.useForm<ModelsChannelFormValues>();
  const isEditMode = editor?.mode === "edit";
  const selectedProviderType = Form.useWatch("providerType", form);

  const providerOptions = useMemo(() => {
    return [...providers]
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN", {
        sensitivity: "base",
      }))
      .map((item) => ({
        label: `${item.displayName} (${item.providerType})`,
        value: item.providerType,
      }));
  }, [providers]);

  const currentProvider = useMemo(
    () => providers.find((item) => item.providerType === selectedProviderType) ?? null,
    [providers, selectedProviderType],
  );

  const providerConfigFields = currentProvider?.configSchema ?? [];

  const channelIdRules = useMemo(() => [
    { required: true, message: t("模型页.校验.渠道ID必填") },
    {
      validator: async (_rule: unknown, value: unknown) => {
        if (value === undefined || value === null || String(value).trim() === "") {
          return;
        }

        if (!isValidDesktopModelChannelId(value)) {
          throw new Error(t("模型页.校验.渠道ID格式"));
        }
      },
    },
  ], [t]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    const providerType = editor?.mode === "edit"
      ? editor.item.providerType
      : editor?.preferredProviderType ?? providerOptions[0]?.value;
    const initialProvider = providers.find((item) => item.providerType === providerType) ?? null;

    if (editor?.mode === "edit") {
      form.setFieldsValue({
        providerType: editor.item.providerType,
        channelId: editor.item.channelId,
        name: editor.item.name,
        baseUrl: editor.item.baseUrl,
        config: extractConfigValues(editor, initialProvider),
        enabled: editor.item.enabled,
      });
      return;
    }

    form.setFieldsValue({
      providerType,
      channelId: "",
      name: "",
      baseUrl: "",
      config: extractConfigValues(null, initialProvider),
      enabled: true,
    });
  }, [editor, form, open, providerOptions, providers]);

  useEffect(() => {
    if (!open || !currentProvider) {
      return;
    }

    const defaultConfig = buildProviderConfigDefaults(currentProvider);
    const currentConfig = form.getFieldValue("config") ?? {};
    const nextConfig = { ...currentConfig };
    let changed = false;

    for (const [key, value] of Object.entries(defaultConfig)) {
      if (nextConfig[key] === undefined) {
        nextConfig[key] = value;
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    form.setFieldValue("config", nextConfig);
  }, [currentProvider, form, open]);

  const baseUrlPlaceholder = useMemo(() => {
    if (currentProvider?.defaultBaseUrl) {
      return currentProvider.defaultBaseUrl;
    }

    const providerId = normalizeDesktopModelChannelId(currentProvider?.providerType)?.toLowerCase();
    if (providerId === "openai") {
      return "https://api.openai.com/v1";
    }
    if (providerId === "anthropic" || currentProvider?.protocolFamily === "anthropic") {
      return "https://api.anthropic.com/v1";
    }
    if (providerId === "azure" || currentProvider?.deploymentKind === "azure-openai") {
      return "https://{resource}.services.ai.azure.com/models";
    }
    return "https://api.example.com/v1";
  }, [currentProvider?.defaultBaseUrl, currentProvider?.deploymentKind, currentProvider?.protocolFamily, currentProvider?.providerType]);

  const handleProviderTypeChange = (providerType: string) => {
    const provider = providers.find((item) => item.providerType === providerType) ?? null;
    form.setFieldsValue({
      providerType,
      config: extractConfigValues(null, provider),
    });
  };

  const renderConfigInput = (field: DesktopModelProviderConfigField) => {
    const placeholder = field.placeholder
      ?? (field.defaultValue !== undefined ? String(field.defaultValue) : undefined)
      ?? field.envKey
      ?? field.label;

    if (field.type === "boolean") {
      return (
        <Switch
          checkedChildren={t("设置页.值.是")}
          unCheckedChildren={t("设置页.值.否")}
        />
      );
    }

    if (field.type === "select") {
      return (
        <Select
          allowClear={!field.required}
          options={(field.options ?? []).map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          placeholder={placeholder}
        />
      );
    }

    if (field.type === "number") {
      return (
        <InputNumber
          controls={false}
          style={{ width: "100%" }}
          placeholder={placeholder}
        />
      );
    }

    if (field.type === "secret") {
      return (
        <Input.Password
          autoComplete="new-password"
          spellCheck={false}
          placeholder={placeholder}
        />
      );
    }

    return (
      <Input
        autoComplete="off"
        spellCheck={false}
        type={field.type === "url" ? "url" : undefined}
        placeholder={placeholder}
      />
    );
  };

  return (
    <Modal
      open={open}
      title={isEditMode ? t("模型页.弹窗.编辑标题") : t("模型页.弹窗.新建标题")}
      okText={t("工作区页.按钮.保存")}
      cancelText={t("工作区页.按钮.取消")}
      confirmLoading={submitting}
      width="min(760px, calc(100vw - 48px))"
      destroyOnHidden
      style={{ top: 56 }}
      styles={{
        body: {
          maxHeight: "calc(80vh - 180px)",
          overflowX: "hidden",
          overflowY: "auto",
        },
      }}
      className="models-page-modal"
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then(onSubmit);
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ enabled: true, env: {} }}
      >
        <Form.Item
          label={t("模型页.字段.提供商")}
          name="providerType"
          rules={[{ required: true, message: t("模型页.校验.提供商必填") }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={providerOptions}
            disabled={isEditMode}
            onChange={handleProviderTypeChange}
          />
        </Form.Item>

        <Form.Item
          label={t("模型页.字段.渠道ID")}
          name="channelId"
          rules={channelIdRules}
        >
          <Input disabled={isEditMode} maxLength={64} />
        </Form.Item>

        <Form.Item
          label={t("模型页.字段.渠道名称")}
          name="name"
          rules={[{ required: true, message: t("模型页.校验.渠道名称必填") }]}
        >
          <Input />
        </Form.Item>

        <Form.Item label={t("模型页.字段.BaseUrl")} name="baseUrl">
          <Input placeholder={baseUrlPlaceholder} />
        </Form.Item>

        {currentProvider?.doc ? (
          <Alert
            type="info"
            showIcon={false}
            className="models-page-provider-doc-alert"
            message={(
              <Typography.Link href={currentProvider.doc} target="_blank" rel="noreferrer">
                {t("模型页.字段.参数填写说明")}
              </Typography.Link>
            )}
          />
        ) : null}

        {providerConfigFields.length > 0 ? (
          <Row gutter={16} className="models-page-provider-env-grid">
            {providerConfigFields.map((field) => (
              <Col xs={24} md={12} key={field.key}>
                <Form.Item
                  label={field.label}
                  name={["config", field.key]}
                  rules={field.required ? [{ required: true }] : undefined}
                  extra={field.helpText}
                  valuePropName={field.type === "boolean" ? "checked" : "value"}
                >
                  {renderConfigInput(field)}
                </Form.Item>
              </Col>
            ))}
          </Row>
        ) : null}

        {!isEditMode ? (
          <Form.Item
            label={t("模型页.字段.启用渠道")}
            name="enabled"
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t("设置页.值.是")}
              unCheckedChildren={t("设置页.值.否")}
            />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
