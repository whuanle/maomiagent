import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  DesktopModelChannelItem,
  DesktopModelsSnapshot,
  DesktopModelProviderConfigValue,
  DesktopModelProviderItem,
} from "../../../shared/desktop-models";
import {
  isCustomProtocolProviderType,
  readChannelProtocolMetadata,
} from "../../../shared/desktop-model-channel-protocol";
import { AppTableCard } from "../../components/shared/AppTableCard";
import {
  DESKTOP_MODELS_BRIDGE_READY_EVENT,
  DESKTOP_MODELS_INVALIDATED_EVENT,
  createDesktopModelChannel,
  getDesktopModelsSnapshot,
  hasDesktopModelsBridge,
  removeDesktopModelChannel,
  setDesktopModelChannelEnabled,
  updateDesktopModelChannel,
} from "../../lib/desktop-models";
import { buildDesktopChannelModelRows } from "./services/channel-models";
import {
  buildCustomChannelProtocolMetadata,
  buildPresetProviderChannelMetadata,
  getCustomChannelProtocolPreset,
  resolveChannelProtocolLabelKey,
} from "./services/channel-protocol";
import { ChannelFormModal } from "./components/ChannelFormModal";
import { ChannelModelsModal } from "./components/ChannelModelsModal";
import type {
  ModelsChannelEditorState,
  ModelsChannelFormValues,
  ModelsPageProps,
} from "./types";
import { buildModelsChannelHeaders } from "./types";
import "./models-page.css";

const CHANNEL_PAGE_SIZE = 20;
const CHANNEL_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

type ModelsChannelRow = {
  key: string;
  providerType: string;
  providerDisplayName: string;
  protocolLabel: string;
  channelId: string;
  name: string;
  baseUrl?: string;
  enabled: boolean;
  enabledModelCount: number;
  totalModelCount: number;
  updatedAt: string;
  item: DesktopModelChannelItem;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeText(value?: string) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function providerSupportsRemoteSync(provider: DesktopModelProviderItem | undefined) {
  if (!provider) {
    return false;
  }

  if (provider.supportsRemoteModelDiscovery) {
    return true;
  }

  if (provider.protocolFamily && ["openai", "anthropic", "azure-openai"].includes(provider.protocolFamily)) {
    return true;
  }

  const providerType = provider.providerType.toLowerCase();
  if (["openai", "azure", "anthropic"].includes(providerType)) {
    return true;
  }

  return provider.models.some((model) => {
    const upstreamProvider = model.providerType.toLowerCase();
    return ["openai", "azure", "anthropic"].includes(upstreamProvider);
  });
}

function formatDateTime(value: string, language: ModelsPageProps["language"]) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language);
}

export function ModelsPage(props: ModelsPageProps) {
  const { active, language, t } = props;
  const { message } = App.useApp();
  const [bridgeAvailable, setBridgeAvailable] = useState(() => hasDesktopModelsBridge());
  const [snapshot, setSnapshot] = useState<DesktopModelsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(CHANNEL_PAGE_SIZE);
  const [editor, setEditor] = useState<ModelsChannelEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [channelModalKey, setChannelModalKey] = useState<string | null>(null);
  const [busyChannelKey, setBusyChannelKey] = useState<string | null>(null);
  const [deletingChannelKey, setDeletingChannelKey] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(searchText);

  const refreshSnapshot = useCallback(async () => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoading(true);
    try {
      const nextSnapshot = await getDesktopModelsSnapshot();
      setSnapshot(nextSnapshot);
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [active, bridgeAvailable, message, t]);

  useEffect(() => {
    const handleBridgeAvailability = () => {
      const nextAvailable = hasDesktopModelsBridge();
      setBridgeAvailable(nextAvailable);
      if (!nextAvailable) {
        setSnapshot(null);
      }
    };

    const handleInvalidated = () => {
      if (!active) {
        return;
      }
      void refreshSnapshot();
    };

    handleBridgeAvailability();
    window.addEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, handleBridgeAvailability);
    window.addEventListener(DESKTOP_MODELS_INVALIDATED_EVENT, handleInvalidated);

    return () => {
      window.removeEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, handleBridgeAvailability);
      window.removeEventListener(DESKTOP_MODELS_INVALIDATED_EVENT, handleInvalidated);
    };
  }, [active, refreshSnapshot]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }
    void refreshSnapshot();
  }, [active, bridgeAvailable, refreshSnapshot]);

  const providers = snapshot?.providers ?? [];
  const channels = snapshot?.channels ?? [];

  const providerFilterOptions = useMemo(() => [
    { value: "all", label: t("模型页.值.全部提供商") },
    ...[...providers]
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN", {
        sensitivity: "base",
      }))
      .map((item) => ({
        value: item.providerType,
        label: `${item.displayName} (${item.providerType})`,
      })),
  ], [providers, t]);

  const rows = useMemo<ModelsChannelRow[]>(() => {
    return channels.map((item) => {
      const provider = providers.find((entry) => entry.providerType === item.providerType);
      const protocol = readChannelProtocolMetadata(item);
      const protocolLabelKey = resolveChannelProtocolLabelKey(item);
      const totalModelCount = buildDesktopChannelModelRows(providers, item).length;
      return {
        key: `${item.providerType}::${item.channelId}`,
        providerType: item.providerType,
        providerDisplayName: protocol.source === "protocol"
          ? t("模型页.值.自定义")
          : provider?.displayName ?? item.providerType,
        protocolLabel: protocolLabelKey
          ? t(protocolLabelKey as never)
          : (
            (protocol.protocolFamily ?? provider?.protocolFamily) && (protocol.apiStyle ?? provider?.apiStyle)
              ? `${protocol.protocolFamily ?? provider?.protocolFamily}/${protocol.apiStyle ?? provider?.apiStyle}`
              : "-"
          ),
        channelId: item.channelId,
        name: item.name,
        baseUrl: item.baseUrl,
        enabled: item.enabled,
        enabledModelCount: item.models.filter((entry) => entry.enabled).length,
        totalModelCount,
        updatedAt: item.updatedAt,
        item,
      };
    });
  }, [channels, providers, t]);

  const filteredRows = useMemo(() => {
    const searchToken = normalizeText(deferredSearchText);
    return rows.filter((item) => {
      if (providerFilter !== "all" && item.providerType !== providerFilter) {
        return false;
      }
      if (!searchToken) {
        return true;
      }
      return normalizeText([
        item.name,
        item.channelId,
        item.providerDisplayName,
        item.providerType,
        item.protocolLabel,
        item.baseUrl,
      ].filter(Boolean).join(" ")).includes(searchToken);
    });
  }, [deferredSearchText, providerFilter, rows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchText, providerFilter]);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * currentPageSize;
    return filteredRows.slice(start, start + currentPageSize);
  }, [currentPage, currentPageSize, filteredRows]);

  const selectedChannel = useMemo(() => {
    if (!channelModalKey) {
      return null;
    }
    return channels.find((item) => `${item.providerType}::${item.channelId}` === channelModalKey) ?? null;
  }, [channelModalKey, channels]);

  const handleSaveChannel = async (values: ModelsChannelFormValues) => {
    setSaving(true);
    try {
      const provider = providers.find((item) => item.providerType === values.providerType);
      const providerConfigSchema = provider?.configSchema ?? [];
      const protocolPreset = getCustomChannelProtocolPreset(values.protocolId);
      const customHeaders = buildModelsChannelHeaders(values.headers);
      const providerType = values.sourceMode === "protocol"
        ? protocolPreset?.providerType ?? values.providerType
        : values.providerType;
      const metadata = values.sourceMode === "protocol"
        ? buildCustomChannelProtocolMetadata(protocolPreset, values.config, customHeaders)
        : buildPresetProviderChannelMetadata({
          channel: editor?.mode === "edit" ? editor.item : undefined,
          provider,
          providerProtocolId: values.providerProtocolId,
          config: values.config,
          configSchema: providerConfigSchema,
        });

      if (editor?.mode === "edit") {
        await updateDesktopModelChannel(
          editor.item.providerType,
          editor.item.channelId,
          {
            name: values.name.trim(),
            baseUrl: values.baseUrl?.trim() || undefined,
            metadata,
          },
        );
      } else {
        await createDesktopModelChannel(providerType, {
          channelId: values.channelId.trim(),
          name: values.name.trim(),
          baseUrl: values.baseUrl?.trim() || undefined,
          metadata,
          enabled: values.enabled,
        });
      }

      message.success(t("模型页.反馈.保存成功"));
      setEditor(null);
      await refreshSnapshot();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleChannelEnabled = async (row: ModelsChannelRow, enabled: boolean) => {
    setBusyChannelKey(row.key);
    try {
      await setDesktopModelChannelEnabled(row.providerType, row.channelId, enabled);
      message.success(t("模型页.反馈.状态更新成功"));
      await refreshSnapshot();
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setBusyChannelKey(null);
    }
  };

  const handleDeleteChannel = async (row: ModelsChannelRow) => {
    setDeletingChannelKey(row.key);
    try {
      const response = await removeDesktopModelChannel(row.providerType, row.channelId);
      if (response.deleted) {
        message.success(t("模型页.反馈.删除成功"));
        if (channelModalKey === row.key) {
          setChannelModalKey(null);
        }
        await refreshSnapshot();
      }
    } catch (error) {
      message.error(`${t("模型页.反馈.加载失败")}: ${getErrorMessage(error)}`);
    } finally {
      setDeletingChannelKey(null);
    }
  };

  const columns = useMemo<TableColumnsType<ModelsChannelRow>>(() => [
    {
      title: t("模型页.列.渠道"),
      dataIndex: "name",
      key: "channel",
      width: 260,
      render: (_value, row) => (
        <div className="models-page-channel-cell">
          <Typography.Text strong>{row.name}</Typography.Text>
          <Typography.Text type="secondary" className="models-page-channel-meta">
            {row.channelId}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t("模型页.列.提供商"),
      dataIndex: "providerDisplayName",
      key: "provider",
      width: 220,
      render: (_value, row) => (
        <div className="models-page-provider-cell">
          <Typography.Text>{row.providerDisplayName}</Typography.Text>
          <Typography.Text type="secondary" className="models-page-channel-meta">
            {row.providerType}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t("模型页.列.协议"),
      dataIndex: "protocolLabel",
      key: "protocol",
      width: 220,
      render: (value: string) => (
        <Typography.Text>{value}</Typography.Text>
      ),
    },
    {
      title: t("模型页.列.BaseUrl"),
      dataIndex: "baseUrl",
      key: "baseUrl",
      render: (value?: string) => (
        <div className="models-page-base-url" title={value ?? t("模型页.值.无BaseUrl")}>{value ?? t("模型页.值.无BaseUrl")}</div>
      ),
    },
    {
      title: t("模型页.列.模型数"),
      key: "models",
      width: 120,
      align: "center",
      render: (_value, row) => (
        <Tag bordered={false} className="models-page-tag models-page-tag-count">
          {row.enabledModelCount}/{row.totalModelCount}
        </Tag>
      ),
    },
    {
      title: t("模型页.列.更新时间"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 190,
      align: "center",
      render: (value: string) => formatDateTime(value, language),
    },
    {
      title: t("模型页.列.状态"),
      key: "status",
      width: 180,
      align: "center",
      render: (_value, row) => (
        <div className="models-page-status-cell">
          <Tag
            bordered={false}
            className={`models-page-tag ${row.enabled ? "models-page-tag-enabled" : "models-page-tag-disabled"}`}
          >
            {row.enabled ? t("模型页.值.已启用") : t("模型页.值.已停用")}
          </Tag>
          <Switch
            checked={row.enabled}
            loading={busyChannelKey === row.key}
            checkedChildren={t("设置页.值.是")}
            unCheckedChildren={t("设置页.值.否")}
            onChange={(checked) => void handleToggleChannelEnabled(row, checked)}
          />
        </div>
      ),
    },
    {
      title: t("模型页.列.操作"),
      key: "actions",
      width: 120,
      align: "center",
      render: (_value, row) => (
        <Space size={4} className="models-page-actions">
          <Tooltip title={t("模型页.弹窗.编辑标题")}>
            <Button
              type="text"
              size="small"
              className="models-page-action-btn"
              icon={<EditOutlined />}
              onClick={() => setEditor({ mode: "edit", item: row.item })}
            />
          </Tooltip>
          <Tooltip title={t("模型页.弹窗.模型标题")}>
            <Button
              type="text"
              size="small"
              className="models-page-action-btn"
              icon={<SettingOutlined />}
              onClick={() => setChannelModalKey(row.key)}
            />
          </Tooltip>
          <Popconfirm
            title={t("模型页.弹窗.删除标题")}
            description={t("模型页.弹窗.删除说明")}
            okText={t("工作区页.按钮.删除")}
            cancelText={t("工作区页.按钮.取消")}
            okButtonProps={{ danger: true, loading: deletingChannelKey === row.key }}
            onConfirm={() => void handleDeleteChannel(row)}
          >
            <Tooltip title={t("模型页.弹窗.删除标题")}>
              <Button
                type="text"
                danger
                size="small"
                className="models-page-action-btn"
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ], [busyChannelKey, deletingChannelKey, handleDeleteChannel, handleToggleChannelEnabled, language, t]);

  return (
    <section className="models-page">
      <div className="models-page-surface">
        <div className="models-page-table-shell">
          {bridgeAvailable ? (
            <AppTableCard
              className="models-page-table-card"
              rowKey="key"
              columns={columns}
              items={pagedRows}
              loading={loading}
              loadingText={t("模型页.提示.加载中")}
              emptyDescription={t("模型页.提示.无渠道")}
              scrollX={1280}
              pagination={{
                total: filteredRows.length,
                currentPage,
                currentPageSize,
                pageSizeOptions: CHANNEL_PAGE_SIZE_OPTIONS,
                totalLabel: t("工作区页.分页.总条数", { 总数: filteredRows.length }),
                pageSizeLabel: (size) => t("工作区页.分页.每页", { 数量: size }),
                onChange: (nextPage, nextPageSize) => {
                  setCurrentPage(nextPage);
                  setCurrentPageSize(nextPageSize);
                },
              }}
              toolbar={(
                <div className="models-page-toolbar">
                  <Input
                    className="models-page-search"
                    placeholder={t("模型页.字段.搜索占位")}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                  <Select
                    className="models-page-select"
                    value={providerFilter}
                    options={providerFilterOptions}
                    onChange={(value) => setProviderFilter(value)}
                  />
                  <div className="models-page-toolbar-actions">
                    <Button icon={<ReloadOutlined />} onClick={() => void refreshSnapshot()}>
                      {t("工作区页.按钮.刷新")}
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setEditor({
                        mode: "create",
                        preferredProviderType:
                          providerFilter !== "all" && !isCustomProtocolProviderType(providerFilter)
                            ? providerFilter
                            : undefined,
                      })}
                    >
                      {t("模型页.按钮.新建渠道")}
                    </Button>
                  </div>
                </div>
              )}
              tableProps={{ className: "models-page-table" }}
            />
          ) : (
            <div className="models-page-empty-state">
              <Typography.Text type="secondary">{t("模型页.提示.桌面桥接不可用")}</Typography.Text>
            </div>
          )}
        </div>
      </div>

      <ChannelFormModal
        open={Boolean(editor)}
        editor={editor}
        providers={providers}
        submitting={saving}
        t={t}
        onCancel={() => setEditor(null)}
        onSubmit={handleSaveChannel}
      />

      <ChannelModelsModal
        open={Boolean(selectedChannel)}
        channel={selectedChannel}
        providers={providers.map((provider) => ({
          ...provider,
          supportsRemoteModelDiscovery: providerSupportsRemoteSync(provider),
        }))}
        language={language}
        t={t}
        onClose={() => setChannelModalKey(null)}
        onSnapshotRefresh={refreshSnapshot}
      />
    </section>
  );
}
