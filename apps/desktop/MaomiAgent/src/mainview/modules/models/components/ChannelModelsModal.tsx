import {
  DeleteOutlined,
  EditOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Modal, Popconfirm, Select, Space, Switch, Tag, Typography } from "antd";
import { useDeferredValue, useMemo, useState } from "react";
import type {
  DesktopModelChannelItem,
  DesktopModelProviderItem,
} from "../../../../shared/desktop-models";
import type { LanguageCode } from "../../../config/titlebar";
import type { Translate } from "../../../i18n";
import { AppTableCard } from "../../../components/shared/AppTableCard";
import {
  batchSetDesktopChannelModelsEnabled,
  discoverDesktopChannelModels,
  setDesktopChannelModelEnabled,
  updateDesktopModelChannel,
} from "../../../lib/desktop-models";
import {
  buildDesktopChannelModelRows,
  type DesktopChannelModelRow,
} from "../services/channel-models";
import {
  mergeCustomChannelModelMetadata,
  removeCustomChannelModelMetadata,
  stripCustomModelsMetadata,
  type EditableCustomChannelModel,
} from "../services/custom-model-metadata";
import { CustomModelInlineEditor } from "./CustomModelInlineEditor";
import type { ModelsModalFilter } from "../types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeText(value?: string) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatModelKind(kind: DesktopChannelModelRow["kind"], language: LanguageCode) {
  if (language === "en-US") {
    switch (kind) {
      case "embedding":
        return "Embedding";
      case "transcription":
        return "Transcription";
      case "image-generation":
        return "Image";
      default:
        return "Conversation";
    }
  }

  switch (kind) {
    case "embedding":
      return "向量";
    case "transcription":
      return "转写";
    case "image-generation":
      return "生图";
    default:
      return "对话";
  }
}

function formatModelSource(row: DesktopChannelModelRow, language: LanguageCode) {
  if (row.customModel) {
    return language === "en-US" ? "Custom" : "自定义";
  }
  return language === "en-US" ? "Catalog" : "目录";
}

function buildCapabilityLabels(row: DesktopChannelModelRow, language: LanguageCode) {
  const labels: string[] = [];
  const inputModalities = (row.modalities?.input ?? []).map((item) => item.toLowerCase());
  if (
    row.supportsAttachments
    || inputModalities.some((item) => ["image", "audio", "video", "pdf"].includes(item))
  ) {
    labels.push(language === "en-US" ? "Multimodal" : "多模态");
  }
  if (row.supportsReasoning) {
    labels.push(language === "en-US" ? "Reasoning" : "推理");
  }
  if (row.interleaved) {
    labels.push(language === "en-US" ? "Interleaved" : "交错推理");
  }
  if (row.supportsFunctionCall) {
    labels.push(language === "en-US" ? "Tool" : "工具");
  }
  if (row.supportsStructuredOutput) {
    labels.push(language === "en-US" ? "Structured" : "结构化");
  }
  if (row.supportsTemperature) {
    labels.push(language === "en-US" ? "Temp" : "温度");
  }
  if (row.contextWindow) {
    labels.push(`${row.contextWindow.toLocaleString()} ctx`);
  }
  return labels;
}

function projectEditableCustomChannelModel(row: DesktopChannelModelRow): EditableCustomChannelModel {
  return {
    modelId: row.modelId,
    displayName: row.displayName,
    family: row.family,
    contextWindow: row.contextWindow,
    maxOutputTokens: row.maxOutputTokens,
    supportsAttachments: row.supportsAttachments === true,
    supportsReasoning: row.supportsReasoning === true,
    supportsFunctionCall: row.supportsFunctionCall === true,
    supportsStructuredOutput: row.supportsStructuredOutput === true,
    supportsTemperature: row.supportsTemperature === true,
    interleaved: row.interleaved,
    modalities: {
      input: [...(row.modalities?.input ?? [])],
      output: [...(row.modalities?.output ?? [])],
    },
  };
}

type ChannelModelsModalProps = {
  open: boolean;
  channel: DesktopModelChannelItem | null;
  providers: DesktopModelProviderItem[];
  language: LanguageCode;
  t: Translate;
  onClose: () => void;
  onSnapshotRefresh: () => Promise<void>;
};

export function ChannelModelsModal(props: ChannelModelsModalProps) {
  const { open, channel, providers, language, t, onClose, onSnapshotRefresh } = props;
  const { message } = App.useApp();
  const [searchText, setSearchText] = useState("");
  const [filterMode, setFilterMode] = useState<ModelsModalFilter>("all");
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [resettingDefaults, setResettingDefaults] = useState(false);
  const [customEditor, setCustomEditor] = useState<EditableCustomChannelModel | null>(null);
  const [savingCustomModel, setSavingCustomModel] = useState(false);
  const [deletingCustomModelId, setDeletingCustomModelId] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(searchText);

  const provider = useMemo(
    () => providers.find((item) => item.providerType === channel?.providerType) ?? null,
    [channel?.providerType, providers],
  );

  const rows = useMemo(() => {
    if (!channel) {
      return [];
    }
    return buildDesktopChannelModelRows(providers, channel);
  }, [channel, providers]);

  const filteredRows = useMemo(() => {
    const searchToken = normalizeText(deferredSearchText);
    return rows.filter((item) => {
      if (filterMode === "enabled" && !item.enabled) {
        return false;
      }
      if (filterMode === "disabled" && item.enabled) {
        return false;
      }
      if (filterMode === "custom" && !item.customModel) {
        return false;
      }
      if (searchToken && !normalizeText(item.searchText).includes(searchToken)) {
        return false;
      }
      return true;
    });
  }, [deferredSearchText, filterMode, rows]);

  const canResetDefaults = useMemo(
    () => rows.some((item) => item.customModel || item.enabled),
    [rows],
  );

  const hasCustomModels = useMemo(
    () => rows.some((item) => item.customModel),
    [rows],
  );

  const editingModelId = customEditor?.modelId ?? null;
  const inlineEditing = customEditor !== null;

  const handleToggleModel = async (row: DesktopChannelModelRow, enabled: boolean) => {
    if (!channel) {
      return;
    }

    setBusyModelId(row.modelId);
    try {
      await setDesktopChannelModelEnabled(
        channel.providerType,
        channel.channelId,
        row.modelId,
        enabled,
      );
      message.success(t("模型页.反馈.模型状态更新成功"));
      await onSnapshotRefresh();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setBusyModelId(null);
    }
  };

  const handleBatchToggle = async (enabled: boolean) => {
    if (!channel) {
      return;
    }

    const updates = filteredRows
      .filter((item) => item.enabled !== enabled)
      .map((item) => ({ modelId: item.modelId, enabled }));
    if (updates.length === 0) {
      return;
    }

    setBatchBusy(true);
    try {
      await batchSetDesktopChannelModelsEnabled(
        channel.providerType,
        channel.channelId,
        updates,
      );
      message.success(t("模型页.反馈.模型批量更新成功"));
      await onSnapshotRefresh();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setBatchBusy(false);
    }
  };

  const handleDiscover = async () => {
    if (!channel) {
      return;
    }

    setDiscovering(true);
    try {
      const response = await discoverDesktopChannelModels(
        channel.providerType,
        channel.channelId,
      );
      message.success(
        t("模型页.反馈.模型发现完成", {
          数量: response.enabledCount,
          新增: response.addedCustomCount,
        }),
      );
      await onSnapshotRefresh();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!channel) {
      return;
    }

    const enabledUpdates = rows
      .filter((item) => item.enabled)
      .map((item) => ({
        modelId: item.modelId,
        enabled: false,
      }));
    const hasCustomModels = rows.some((item) => item.customModel);

    if (enabledUpdates.length === 0 && !hasCustomModels) {
      message.info(t("模型页.反馈.无需重置默认"));
      return;
    }

    setResettingDefaults(true);
    try {
      if (enabledUpdates.length > 0) {
        await batchSetDesktopChannelModelsEnabled(
          channel.providerType,
          channel.channelId,
          enabledUpdates,
        );
      }

      if (hasCustomModels) {
        await updateDesktopModelChannel(
          channel.providerType,
          channel.channelId,
          {
            metadata: stripCustomModelsMetadata(channel.metadata),
          },
        );
      }

      message.success(t("模型页.反馈.已重置默认"));
      await onSnapshotRefresh();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setResettingDefaults(false);
    }
  };

  const handleOpenCustomEditor = (row: DesktopChannelModelRow) => {
    if (!channel) {
      return;
    }

    setCustomEditor((current) => (
      current?.modelId === row.modelId ? null : projectEditableCustomChannelModel(row)
    ));
  };

  const handleCancelCustomEditor = () => {
    setCustomEditor(null);
  };

  const handleSaveCustomModel = async (model: EditableCustomChannelModel) => {
    if (!channel) {
      return;
    }

    setSavingCustomModel(true);
    try {
      await updateDesktopModelChannel(
        channel.providerType,
        channel.channelId,
        {
          metadata: mergeCustomChannelModelMetadata(channel.metadata, model),
        },
      );
      message.success(t("模型页.反馈.自定义模型保存成功"));
      setCustomEditor(null);
      await onSnapshotRefresh();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setSavingCustomModel(false);
    }
  };

  const handleDeleteCustomModel = async (row: DesktopChannelModelRow) => {
    if (!channel || !row.customModel) {
      return;
    }

    setDeletingCustomModelId(row.modelId);
    try {
      if (row.enabled) {
        await setDesktopChannelModelEnabled(
          channel.providerType,
          channel.channelId,
          row.modelId,
          false,
        );
      }

      await updateDesktopModelChannel(
        channel.providerType,
        channel.channelId,
        {
          metadata: removeCustomChannelModelMetadata(channel.metadata, row.modelId),
        },
      );

      message.success(t("模型页.反馈.自定义模型删除成功"));
      setCustomEditor((current) => (current?.modelId === row.modelId ? null : current));
      await onSnapshotRefresh();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setDeletingCustomModelId(null);
    }
  };

  const columns = useMemo(() => {
    const nextColumns = [
      {
        title: t("模型页.模型列.模型"),
        dataIndex: "displayName",
        key: "model",
        width: 280,
        render: (_value: string, row: DesktopChannelModelRow) => (
          <div className="models-page-model-cell">
            <Typography.Text strong className="models-page-model-name">
              {row.displayName}
            </Typography.Text>
            <Typography.Text type="secondary" className="models-page-model-meta">
              {row.family ? `${row.family} / ` : ""}
              {row.modelId}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: t("模型页.模型列.类型"),
        dataIndex: "kind",
        key: "kind",
        width: 88,
        align: "center" as const,
        render: (value: DesktopChannelModelRow["kind"]) => (
          <Tag className="models-page-tag models-page-tag-kind" bordered={false}>
            {formatModelKind(value, language)}
          </Tag>
        ),
      },
      {
        title: t("模型页.模型列.能力"),
        key: "capabilities",
        align: "center" as const,
        render: (_value: unknown, row: DesktopChannelModelRow) => {
          const capabilityLabels = buildCapabilityLabels(row, language);
          return capabilityLabels.length > 0 ? (
            <Space size={[6, 6]} wrap className="models-page-capability-tags">
              {capabilityLabels.map((label) => (
                <Tag key={`${row.modelId}-${label}`} className="models-page-tag" bordered={false}>
                  {label}
                </Tag>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          );
        },
      },
      {
        title: t("模型页.模型列.来源"),
        key: "source",
        width: 92,
        align: "center" as const,
        render: (_value: unknown, row: DesktopChannelModelRow) => (
          <Tag
            bordered={false}
            className={`models-page-tag ${row.customModel ? "models-page-tag-custom" : "models-page-tag-catalog"}`}
          >
            {formatModelSource(row, language)}
          </Tag>
        ),
      },
      {
        title: t("模型页.模型列.状态"),
        key: "status",
        width: 110,
        align: "center" as const,
        render: (_value: unknown, row: DesktopChannelModelRow) => (
          <Switch
            checked={row.enabled}
            loading={busyModelId === row.modelId}
            disabled={inlineEditing}
            checkedChildren={t("设置页.值.是")}
            unCheckedChildren={t("设置页.值.否")}
            onChange={(checked) => void handleToggleModel(row, checked)}
          />
        ),
      },
    ];

    nextColumns.push({
      title: t("模型页.列.操作"),
      key: "actions",
      width: 84,
      align: "center" as const,
      render: (_value: unknown, row: DesktopChannelModelRow) => {
        const deleting = deletingCustomModelId === row.modelId;
        const disabled =
          batchBusy
          || discovering
          || resettingDefaults
          || savingCustomModel
          || (inlineEditing && editingModelId !== row.modelId)
          || busyModelId === row.modelId;

        return (
          <Space size={4} className="models-page-actions">
            <Button
              type="text"
              size="small"
              className="models-page-action-btn"
              icon={<EditOutlined />}
              disabled={disabled || deleting}
              onClick={() => handleOpenCustomEditor(row)}
            />
            {row.customModel ? (
              <Popconfirm
                title={t("模型页.弹窗.删除模型标题")}
                description={t("模型页.弹窗.删除模型说明")}
                okText={t("工作区页.按钮.删除")}
                cancelText={t("工作区页.按钮.取消")}
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={() => void handleDeleteCustomModel(row)}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  className="models-page-action-btn"
                  icon={<DeleteOutlined />}
                  disabled={disabled || deleting}
                />
              </Popconfirm>
            ) : null}
          </Space>
        );
      },
    });

    return nextColumns;
  }, [
    batchBusy,
    busyModelId,
    deletingCustomModelId,
    editingModelId,
    discovering,
    handleDeleteCustomModel,
    handleCancelCustomEditor,
    handleOpenCustomEditor,
    handleToggleModel,
    inlineEditing,
    language,
    resettingDefaults,
    savingCustomModel,
    t,
  ]);

  const filterOptions = useMemo(() => [
    { value: "all", label: t("模型页.筛选.全部") },
    { value: "enabled", label: t("模型页.筛选.仅启用") },
    { value: "disabled", label: t("模型页.筛选.仅停用") },
    { value: "custom", label: t("模型页.筛选.仅自定义") },
  ], [t]);

  return (
    <Modal
      open={open}
      footer={null}
      destroyOnHidden
      width={1160}
      style={{ top: 56 }}
      styles={{ body: { height: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" } }}
      className="models-page-modal models-page-models-modal"
      title={channel ? `${channel.name} · ${t("模型页.弹窗.模型标题")}` : t("模型页.弹窗.模型标题")}
      onCancel={() => {
        setCustomEditor(null);
        onClose();
      }}
    >
      <div className="models-page-models-modal-body">
        <AppTableCard
          className="models-page-models-card"
          rowKey="key"
          columns={columns}
          items={filteredRows}
          loading={false}
          loadingText={t("模型页.提示.加载中")}
          emptyDescription={t("模型页.提示.无模型")}
          toolbar={(
            <div className="models-page-toolbar models-page-toolbar-modal">
              <Input
                className="models-page-search"
                placeholder={t("模型页.字段.模型搜索占位")}
                value={searchText}
                disabled={inlineEditing}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <Select
                className="models-page-select"
                value={filterMode}
                options={filterOptions}
                disabled={inlineEditing}
                onChange={(value) => setFilterMode(value)}
              />
              <div className="models-page-toolbar-actions">
                <Button icon={<ReloadOutlined />} disabled={inlineEditing} onClick={() => void onSnapshotRefresh()}>
                  {t("工作区页.按钮.刷新")}
                </Button>
                <Button
                  icon={<CloudDownloadOutlined />}
                  disabled={!provider?.supportsRemoteModelDiscovery || inlineEditing}
                  loading={discovering}
                  onClick={() => void handleDiscover()}
                >
                  {t("模型页.按钮.发现模型")}
                </Button>
                <Popconfirm
                  title={t("模型页.弹窗.重置默认标题")}
                  description={t("模型页.弹窗.重置默认说明")}
                  okText={t("模型页.按钮.重置默认")}
                  cancelText={t("工作区页.按钮.取消")}
                  okButtonProps={{ danger: true, loading: resettingDefaults }}
                  onConfirm={() => void handleResetDefaults()}
                >
                  <Button
                    icon={<RollbackOutlined />}
                    disabled={!canResetDefaults || batchBusy || discovering || resettingDefaults || inlineEditing}
                    loading={resettingDefaults}
                  >
                    {t("模型页.按钮.重置默认")}
                  </Button>
                </Popconfirm>
                <Button
                  icon={<CheckCircleOutlined />}
                  disabled={discovering || resettingDefaults || inlineEditing}
                  loading={batchBusy}
                  onClick={() => void handleBatchToggle(true)}
                >
                  {t("模型页.按钮.全部启用")}
                </Button>
                <Button
                  icon={<StopOutlined />}
                  disabled={discovering || resettingDefaults || inlineEditing}
                  loading={batchBusy}
                  onClick={() => void handleBatchToggle(false)}
                >
                  {t("模型页.按钮.全部停用")}
                </Button>
              </div>
            </div>
          )}
          tableProps={{
            className: "models-page-model-table",
            expandable: {
              expandedRowKeys: editingModelId ? [editingModelId] : [],
              rowExpandable: (row) => row.customModel,
              showExpandColumn: false,
              expandedRowRender: (row) => (
                customEditor && row.modelId === customEditor.modelId ? (
                  <CustomModelInlineEditor
                    model={customEditor}
                    submitting={savingCustomModel}
                    t={t}
                    onCancel={handleCancelCustomEditor}
                    onSubmit={handleSaveCustomModel}
                  />
                ) : null
              ),
            },
          }}
        />
      </div>
    </Modal>
  );
}
