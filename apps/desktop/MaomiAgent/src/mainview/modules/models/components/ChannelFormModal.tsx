import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Typography } from "antd";
import { useEffect, useMemo } from "react";
import {
  isValidDesktopModelChannelId,
  normalizeDesktopModelChannelId,
} from "../../../../shared/desktop-models";
import type {
  DesktopModelChannelItem,
  DesktopModelProviderConfigField,
  DesktopModelProviderConfigValue,
  DesktopModelProviderItem,
} from "../../../../shared/desktop-models";
import type { Translate } from "../../../i18n";
import {
  CUSTOM_CHANNEL_PROTOCOL_PRESETS,
  getPresetProviderProtocolPresets,
  getCustomChannelProtocolPreset,
  resolvePresetProviderProtocolPresetId,
  resolveChannelEditorMode,
  resolveCustomChannelPresetFromChannel,
} from "../services/channel-protocol";
import type {
  ModelsChannelEditorState,
  ModelsChannelHeaderRow,
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

function extractLegacyEnvValues(channel: DesktopModelChannelItem | null) {
  const env = channel?.metadata
    && typeof channel.metadata === "object"
    && !Array.isArray(channel.metadata)
      ? (channel.metadata.env as Record<string, unknown> | undefined)
      : undefined;

  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(env)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function extractStoredConfigValues(channel: DesktopModelChannelItem | null) {
  const config = channel?.metadata
    && typeof channel.metadata === "object"
    && !Array.isArray(channel.metadata)
      ? (channel.metadata.config as Record<string, unknown> | undefined)
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

function extractStoredHeaders(channel: DesktopModelChannelItem | null): ModelsChannelHeaderRow[] {
  const headers = channel?.metadata
    && typeof channel.metadata === "object"
    && !Array.isArray(channel.metadata)
      ? (channel.metadata.headers as Record<string, unknown> | undefined)
      : undefined;

  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return [];
  }

  return Object.entries(headers)
    .filter((entry): entry is [string, string] => (
      typeof entry[0] === "string"
      && entry[0].trim().length > 0
      && typeof entry[1] === "string"
      && entry[1].trim().length > 0
    ))
    .map(([key, value]) => ({
      key: key.trim(),
      value: value.trim(),
    }));
}

function buildConfigDefaults(fields: DesktopModelProviderConfigField[]) {
  const next: Record<string, DesktopModelProviderConfigValue> = {};

  for (const field of fields) {
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
  channel: DesktopModelChannelItem | null,
  fields: DesktopModelProviderConfigField[],
) {
  const next = {
    ...buildConfigDefaults(fields),
    ...extractStoredConfigValues(channel),
  };
  const legacyEnv = extractLegacyEnvValues(channel);

  for (const field of fields) {
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

function resolveChannelFormBaseUrl(input: {
  sourceMode: "provider" | "protocol";
  channel?: DesktopModelChannelItem | null;
  provider?: DesktopModelProviderItem | null;
  protocolDefaultBaseUrl?: string;
}) {
  const explicitBaseUrl = input.channel?.baseUrl?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  if (input.sourceMode === "protocol") {
    return input.protocolDefaultBaseUrl ?? "";
  }

  return input.provider?.defaultBaseUrl ?? input.protocolDefaultBaseUrl ?? "";
}

export function ChannelFormModal(props: ChannelFormModalProps) {
  const { open, editor, providers, submitting, t, onCancel, onSubmit } = props;
  const [form] = Form.useForm<ModelsChannelFormValues>();
  const isEditMode = editor?.mode === "edit";
  const sourceMode = Form.useWatch("sourceMode", form) ?? "provider";
  const selectedProviderType = Form.useWatch("providerType", form);
  const selectedProviderProtocolId = Form.useWatch("providerProtocolId", form);
  const selectedProtocolId = Form.useWatch("protocolId", form);

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
  const providerProtocolPresets = useMemo(
    () => getPresetProviderProtocolPresets(currentProvider ?? undefined),
    [currentProvider],
  );
  const currentProviderProtocol = useMemo(
    () => providerProtocolPresets.find((item) => item.id === selectedProviderProtocolId) ?? providerProtocolPresets[0],
    [providerProtocolPresets, selectedProviderProtocolId],
  );
  const currentProtocol = useMemo(
    () => getCustomChannelProtocolPreset(selectedProtocolId),
    [selectedProtocolId],
  );

  const activeConfigFields = sourceMode === "protocol"
    ? currentProtocol?.configSchema ?? []
    : currentProvider?.configSchema ?? [];

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
  const baseUrlRules = useMemo(() => [{
    validator: async (_rule: unknown, value: unknown) => {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized) {
        return;
      }

      try {
        // eslint-disable-next-line no-new
        new URL(normalized);
      } catch {
        throw new Error(t("模型页.校验.BaseUrl格式"));
      }
    },
  }], [t]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    if (editor?.mode === "edit") {
      const sourceModeValue = resolveChannelEditorMode(editor.item);
      const protocolPreset = sourceModeValue === "protocol"
        ? resolveCustomChannelPresetFromChannel(editor.item)
        : undefined;
      const initialProvider = providers.find((item) => item.providerType === editor.item.providerType) ?? null;
      const initialFields = sourceModeValue === "protocol"
        ? protocolPreset?.configSchema ?? []
        : initialProvider?.configSchema ?? [];

      form.setFieldsValue({
        sourceMode: sourceModeValue,
        providerType: editor.item.providerType,
        providerProtocolId: sourceModeValue === "provider"
          ? resolvePresetProviderProtocolPresetId(initialProvider ?? undefined, editor.item)
          : undefined,
        protocolId: protocolPreset?.id,
        channelId: editor.item.channelId,
        name: editor.item.name,
        baseUrl: resolveChannelFormBaseUrl({
          sourceMode: sourceModeValue,
          channel: editor.item,
          provider: initialProvider,
          protocolDefaultBaseUrl: protocolPreset?.defaultBaseUrl,
        }),
        config: extractConfigValues(editor.item, initialFields),
        headers: sourceModeValue === "protocol" ? extractStoredHeaders(editor.item) : [],
        enabled: editor.item.enabled,
      });
      return;
    }

    const providerType = editor?.preferredProviderType ?? providerOptions[0]?.value;
    const initialProvider = providers.find((item) => item.providerType === providerType) ?? null;

    form.setFieldsValue({
      sourceMode: "provider",
      providerType,
      providerProtocolId: resolvePresetProviderProtocolPresetId(initialProvider ?? undefined),
      protocolId: undefined,
      channelId: "",
      name: "",
      baseUrl: resolveChannelFormBaseUrl({
        sourceMode: "provider",
        provider: initialProvider,
      }),
      config: extractConfigValues(null, initialProvider?.configSchema ?? []),
      headers: [],
      enabled: true,
    });
  }, [editor, form, open, providerOptions, providers]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultConfig = buildConfigDefaults(activeConfigFields);
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
  }, [activeConfigFields, form, open]);

  useEffect(() => {
    if (!open || sourceMode !== "provider") {
      return;
    }

    const editChannel = editor?.mode === "edit" ? editor.item : undefined;
    const nextProviderProtocolId = resolvePresetProviderProtocolPresetId(
      currentProvider ?? undefined,
      editChannel,
    );
    if (providerProtocolPresets.length === 0) {
      if (form.getFieldValue("providerProtocolId") !== undefined) {
        form.setFieldValue("providerProtocolId", undefined);
      }
      return;
    }

    if (
      typeof selectedProviderProtocolId !== "string"
      || !providerProtocolPresets.some((item) => item.id === selectedProviderProtocolId)
    ) {
      form.setFieldValue("providerProtocolId", nextProviderProtocolId);
    }
  }, [
    currentProvider,
    editor,
    form,
    open,
    providerProtocolPresets,
    selectedProviderProtocolId,
    sourceMode,
  ]);

  const baseUrlPlaceholder = useMemo(() => {
    if (sourceMode === "protocol" && currentProtocol) {
      return currentProtocol.defaultBaseUrl;
    }

    if (sourceMode === "provider" && currentProviderProtocol) {
      return currentProviderProtocol.defaultBaseUrl;
    }

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
  }, [
    currentProtocol,
    currentProvider?.defaultBaseUrl,
    currentProvider?.deploymentKind,
    currentProvider?.protocolFamily,
    currentProvider?.providerType,
    currentProviderProtocol,
    sourceMode,
  ]);

  const protocolOptions = useMemo(() => (
    CUSTOM_CHANNEL_PROTOCOL_PRESETS.map((item) => ({
      label: t(item.labelKey as never),
      value: item.id,
    }))
  ), [t]);
  const providerProtocolOptions = useMemo(() => (
    providerProtocolPresets.map((item) => ({
      label: t(item.labelKey as never),
      value: item.id,
    }))
  ), [providerProtocolPresets, t]);

  const handleProviderTypeChange = (providerType: string) => {
    const provider = providers.find((item) => item.providerType === providerType) ?? null;
    form.setFieldsValue({
      providerType,
      providerProtocolId: resolvePresetProviderProtocolPresetId(provider ?? undefined),
      baseUrl: resolveChannelFormBaseUrl({
        sourceMode: "provider",
        provider,
      }),
      config: extractConfigValues(null, provider?.configSchema ?? []),
    });
  };
  const handleSourceModeChange = (nextMode: ModelsChannelFormValues["sourceMode"]) => {
    if (nextMode === "protocol") {
      const firstProtocol = CUSTOM_CHANNEL_PROTOCOL_PRESETS[0];
      form.setFieldsValue({
        sourceMode: nextMode,
        protocolId: firstProtocol?.id,
        providerType: firstProtocol?.providerType,
        baseUrl: resolveChannelFormBaseUrl({
          sourceMode: "protocol",
          protocolDefaultBaseUrl: firstProtocol?.defaultBaseUrl,
        }),
        config: extractConfigValues(null, firstProtocol?.configSchema ?? []),
        headers: [],
      });
      return;
    }

    const nextProviderType = providerOptions[0]?.value;
    const provider = providers.find((item) => item.providerType === nextProviderType) ?? null;
    form.setFieldsValue({
      sourceMode: nextMode,
      providerType: nextProviderType,
      providerProtocolId: resolvePresetProviderProtocolPresetId(provider ?? undefined),
      protocolId: undefined,
      baseUrl: resolveChannelFormBaseUrl({
        sourceMode: "provider",
        provider,
      }),
      config: extractConfigValues(null, provider?.configSchema ?? []),
      headers: [],
    });
  };
  const handleProtocolChange = (protocolId: string) => {
    const preset = getCustomChannelProtocolPreset(protocolId);
    form.setFieldsValue({
      protocolId,
      providerType: preset?.providerType,
      baseUrl: resolveChannelFormBaseUrl({
        sourceMode: "protocol",
        protocolDefaultBaseUrl: preset?.defaultBaseUrl,
      }),
      config: extractConfigValues(null, preset?.configSchema ?? []),
      headers: [],
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
          label={t("模型页.字段.创建方式")}
          name="sourceMode"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: "provider", label: t("模型页.字段.创建方式.预置提供商") },
              { value: "protocol", label: t("模型页.字段.创建方式.自定义协议") },
            ]}
            disabled={isEditMode}
            onChange={handleSourceModeChange}
          />
        </Form.Item>

        {sourceMode === "protocol" ? (
          <Form.Item
            label={t("模型页.字段.协议类型")}
            name="protocolId"
            rules={[{ required: true, message: t("模型页.校验.协议必填") }]}
          >
            <Select
              options={protocolOptions}
              disabled={isEditMode}
              onChange={handleProtocolChange}
            />
          </Form.Item>
        ) : null}

        {sourceMode === "provider" ? (
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
        ) : null}

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

        <Form.Item label={t("模型页.字段.BaseUrl")} name="baseUrl" rules={baseUrlRules}>
          <Input placeholder={baseUrlPlaceholder} />
        </Form.Item>

        {sourceMode === "provider" && providerProtocolOptions.length > 0 ? (
          <Form.Item
            label={t("模型页.字段.协议格式")}
            name="providerProtocolId"
            rules={[{ required: true, message: t("模型页.校验.协议格式必填") }]}
          >
            <Select options={providerProtocolOptions} />
          </Form.Item>
        ) : null}

        {sourceMode === "provider" && currentProviderProtocol ? (
          <Form.Item label={t("模型页.字段.SDKProvider")}>
            <Input value={currentProviderProtocol.sdkProviderPackage} readOnly disabled />
          </Form.Item>
        ) : null}

        {sourceMode === "provider" && currentProvider?.doc ? (
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

        {activeConfigFields.length > 0 ? (
          <Row gutter={16} className="models-page-provider-env-grid">
            {activeConfigFields.map((field) => (
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

        {sourceMode === "protocol" ? (
          <Form.List name="headers">
            {(fields, { add, remove }) => (
              <div className="models-page-provider-env-grid">
                <Form.Item label={t("模型页.字段.自定义Header")}>
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {fields.map((field) => (
                      <Row gutter={12} key={field.key} align="middle">
                        <Col span={10}>
                          <Form.Item
                            name={[field.name, "key"]}
                            rules={[{ whitespace: true }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input placeholder={t("模型页.字段.HeaderKey")} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={[field.name, "value"]}
                            rules={[{ whitespace: true }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input placeholder={t("模型页.字段.HeaderValue")} />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <Button
                            type="text"
                            danger
                            aria-label={t("模型页.按钮.删除Header")}
                            icon={<MinusCircleOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        </Col>
                      </Row>
                    ))}
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => add({ key: "", value: "" })}
                    >
                      {t("模型页.按钮.新增Header")}
                    </Button>
                  </Space>
                </Form.Item>
              </div>
            )}
          </Form.List>
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
