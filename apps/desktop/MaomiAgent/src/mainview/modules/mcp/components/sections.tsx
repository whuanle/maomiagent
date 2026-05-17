import {
  ApiOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons"
import {
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  type TableColumnsType,
  type TableProps,
} from "antd"
import type { Translate } from "../../../i18n"
import type {
  McpCapabilityProbeResult,
  McpMarketItem,
  McpMarketProvider,
  McpMarketProviderId,
  McpRecommendedItem,
  McpScope,
  McpTransport,
  McpView,
} from "../../../lib/desktop-mcp"
import { AppTableCard } from "../../../components/shared/AppTableCard"
import {
  buildInspectEndpoint,
  buildMarketDisplayKey,
  deriveListStatus,
  marketProviderLabel,
  marketStateTagColor,
  scopeTagColor,
  statusTagColor,
  toKeyValueText,
  toMetadataRecord,
  type MarketViewItem,
  type McpForm,
  type TestResult,
} from "../helpers"

const { Text, Paragraph } = Typography
const { TextArea } = Input

const SYSTEM_INFO_HINT_RE = /(系统信息|system[\s_-]*info|system_information|machine[\s_-]*info|os[\s_-]*info)/i
const MOUSE_ACTION_HINT_RE = /(鼠标操作|mouse|cursor|click|drag|scroll|move[\s_-]*pointer)/i
const ENV_KEY_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g

function collectEnvironmentKeys(tool: McpCapabilityProbeResult["toolDetails"][number]): string[] {
  const candidateText = [
    tool.name,
    tool.title,
    tool.description,
  ]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" ")

  const matches = candidateText.match(ENV_KEY_RE) ?? []
  const unique = Array.from(new Set(matches))

  return unique
    .filter((key) => /(_TOKEN|_KEY|_SECRET|_URL|_PATH)$/.test(key) || key === "DISPLAY" || key === "WAYLAND_DISPLAY" || key === "XDG_SESSION_TYPE")
    .slice(0, 4)
}

function resolveToolSupportHints(
  t: Translate,
  tool: McpCapabilityProbeResult["toolDetails"][number],
): string[] {
  const haystack = [tool.name, tool.title, tool.description]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
  const hints: string[] = []

  if (SYSTEM_INFO_HINT_RE.test(haystack)) {
    hints.push(t("MCP页.提示.能力注释.系统信息"))
  }

  if (MOUSE_ACTION_HINT_RE.test(haystack)) {
    hints.push(t("MCP页.提示.能力注释.鼠标操作"))
  }

  const envKeys = collectEnvironmentKeys(tool)
  if (envKeys.length > 0) {
    hints.push(t("MCP页.提示.能力注释.环境依赖", {
      环境: envKeys.join(", "),
    }))
  }

  return hints
}

type McpListSectionProps = {
  batchActionLoading: string | null
  columns: TableColumnsType<McpView>
  loading: boolean
  refreshing: boolean
  rowSelection: TableProps<McpView>["rowSelection"]
  searchText: string
  selectedRowsCount: number
  t: Translate
  transportFilter: "all" | McpTransport
  visibleItems: McpView[]
  onBatchDelete: () => void
  onBatchHealthCheck: () => void
  onBatchToggleEnabled: (enabled: boolean) => void
  onCreate: () => void
  onOpenMarket: () => void
  onOpenRecommended: () => void
  onRefresh: () => void
  onSearchTextChange: (value: string) => void
  onTableChange: NonNullable<TableProps<McpView>["onChange"]>
  onTransportFilterChange: (value: "all" | McpTransport) => void
}

export function McpListSection(props: McpListSectionProps) {
  const {
    batchActionLoading,
    columns,
    loading,
    refreshing,
    rowSelection,
    searchText,
    selectedRowsCount,
    t,
    transportFilter,
    visibleItems,
    onBatchDelete,
    onBatchHealthCheck,
    onBatchToggleEnabled,
    onCreate,
    onOpenMarket,
    onOpenRecommended,
    onRefresh,
    onSearchTextChange,
    onTableChange,
    onTransportFilterChange,
  } = props

  return (
    <div className="mcp-page-list">
      <div className="mcp-page-toolbar-shell">
        <div className="mcp-page-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined aria-hidden="true" />}
            className="mcp-page-search"
            placeholder={t("MCP页.工作台.搜索占位")}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
          />

          <Select
            value={transportFilter}
            className="mcp-page-select"
            onChange={onTransportFilterChange}
            options={[
              { value: "all", label: t("MCP页.工作台.全部传输") },
              { value: "stdio", label: "stdio" },
              { value: "http-streamable", label: "http-streamable" },
              { value: "sse", label: "sse" },
            ]}
          />

          <div className="mcp-page-toolbar-group">
            <Button
              disabled={selectedRowsCount === 0}
              loading={batchActionLoading === "enable"}
              onClick={() => onBatchToggleEnabled(true)}
            >
              {t("MCP页.工作台.批量启用")}
            </Button>
            <Button
              disabled={selectedRowsCount === 0}
              loading={batchActionLoading === "disable"}
              onClick={() => onBatchToggleEnabled(false)}
            >
              {t("MCP页.工作台.批量禁用")}
            </Button>
            <Button
              disabled={selectedRowsCount === 0}
              loading={batchActionLoading === "health"}
              onClick={onBatchHealthCheck}
            >
              {t("MCP页.工作台.批量检查")}
            </Button>
            <Button
              danger
              disabled={selectedRowsCount === 0}
              loading={batchActionLoading === "delete"}
              onClick={onBatchDelete}
            >
              {t("MCP页.工作台.批量删除")}
            </Button>
          </div>

          <div className="mcp-page-toolbar-group">
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading || refreshing}
              onClick={onRefresh}
            >
              {t("MCP页.按钮.刷新")}
            </Button>
            <Button onClick={onOpenMarket}>{t("MCP页.工作台.打开市场")}</Button>
            <Button onClick={onOpenRecommended}>{t("MCP页.工作台.打开推荐")}</Button>
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={onCreate}>
              {t("MCP页.按钮.新建MCP")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mcp-page-table-shell">
        <AppTableCard
          className="mcp-page-table-card"
          rowKey="id"
          columns={columns}
          items={visibleItems}
          loading={loading || refreshing}
          loadingText={t("MCP页.提示.加载中")}
          emptyDescription={t("MCP页.空状态.无MCP")}
          scrollX={1720}
          tableProps={{
            className: "mcp-page-table",
            rowSelection,
            onChange: onTableChange,
          }}
        />
      </div>
    </div>
  )
}

type InspectModalProps = {
  capabilities: McpCapabilityProbeResult | null
  capabilitiesLoading: boolean
  checkingId: string | null
  inspectItem: McpView | null
  t: Translate
  onCancel: () => void
  onRefresh: (item: McpView) => void
}

type InspectModalBodyProps = Omit<InspectModalProps, "onCancel">

type InspectSummaryField = {
  key: string
  label: string
  value: string
  wide?: boolean
}

function formatInspectArgsText(metadata: Record<string, unknown> | null): string {
  if (!Array.isArray(metadata?.args)) {
    return ""
  }

  return metadata.args
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
}

function buildInspectSummaryFields(
  t: Translate,
  inspectItem: McpView,
  metadata: Record<string, unknown> | null,
): InspectSummaryField[] {
  const endpoint = inspectItem.endpoint.trim() || "-"
  const resolvedEndpoint = buildInspectEndpoint(inspectItem.endpoint, metadata)

  if (inspectItem.transport === "stdio") {
    return [
      {
        key: "endpoint",
        label: t("MCP页.详情.字段.endpoint"),
        value: endpoint,
        wide: true,
      },
      {
        key: "args",
        label: t("MCP页.字段.argsText"),
        value: formatInspectArgsText(metadata) || "-",
      },
      {
        key: "env",
        label: t("MCP页.字段.envText"),
        value: toKeyValueText(metadata?.env) || "-",
      },
    ]
  }

  return [
    {
      key: "endpoint",
      label: t("MCP页.详情.字段.endpoint"),
      value: resolvedEndpoint || endpoint,
      wide: true,
    },
    {
      key: "headers",
      label: t("MCP页.字段.headersText"),
      value: toKeyValueText(metadata?.headers) || "-",
    },
    {
      key: "query",
      label: t("MCP页.字段.queryText"),
      value: toKeyValueText(metadata?.query) || "-",
    },
  ]
}

export function InspectModalBody(props: InspectModalBodyProps) {
  const {
    capabilities,
    capabilitiesLoading,
    checkingId,
    inspectItem,
    t,
    onRefresh,
  } = props

  const metadata = toMetadataRecord(inspectItem?.metadata)
  const status = inspectItem ? deriveListStatus(inspectItem) : "disabled"
  const inspectStatus = capabilities?.status ?? status
  const latencyText = !capabilitiesLoading && capabilities
    ? `${capabilities.latencyMs}ms`
    : null
  const summaryFields = inspectItem
    ? buildInspectSummaryFields(t, inspectItem, metadata)
    : []
  const headerDescription = inspectItem?.description?.trim() || ""
  const capabilityMessage = capabilities
    ? capabilities.toolsMessage?.trim()
      || capabilities.message?.trim()
      || capabilities.toolsReasonCode?.trim()
      || capabilities.reasonCode?.trim()
      || ""
    : ""

  if (!inspectItem) {
    return null
  }

  return (
    <div className="mcp-inspect-layout">
      <div className="mcp-inspect-topbar">
        <Space wrap className="mcp-inspect-tags">
          <Tag variant="filled" color={scopeTagColor(inspectItem.scope)}>
            {inspectItem.scope === "global"
              ? t("MCP页.值.作用域.全局")
              : t("MCP页.值.作用域.工作区")}
          </Tag>
          <Tag variant="filled" color={statusTagColor(inspectStatus)}>
            {t(`MCP页.值.健康.${inspectStatus}` as never)}
          </Tag>
          <Tag variant="filled">{inspectItem.transport}</Tag>
          {inspectItem.scope === "workspace" && inspectItem.workspaceId ? (
            <Tag variant="filled">{inspectItem.workspaceId}</Tag>
          ) : null}
          {latencyText ? <Tag variant="filled">{latencyText}</Tag> : null}
        </Space>
        <div className="mcp-inspect-actions">
          <Button
            type="primary"
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={checkingId === inspectItem.id}
            size="small"
            onClick={() => onRefresh(inspectItem)}
          >
            {t("MCP页.按钮.检查")}
          </Button>
        </div>
      </div>

      {headerDescription ? (
        <Paragraph className="mcp-inspect-description">{headerDescription}</Paragraph>
      ) : null}

      <div className="mcp-inspect-summary">
        {summaryFields.map((field) => (
          <div
            key={field.key}
            className={`mcp-inspect-field${field.wide ? " is-wide" : ""}`}
          >
            <Text className="mcp-inspect-label">{field.label}</Text>
            <Paragraph className="mcp-inspect-value">{field.value}</Paragraph>
          </div>
        ))}
      </div>

      {capabilityMessage ? (
        <div className="mcp-inspect-state-line">
          <Text type="secondary">{capabilityMessage}</Text>
        </div>
      ) : null}

      {capabilitiesLoading ? (
        <div className="mcp-inspect-empty">
          <Text type="secondary">{t("MCP页.提示.加载中")}</Text>
        </div>
      ) : capabilities && capabilities.toolDetails.length > 0 ? (
        <div className="mcp-inspect-tools">
          {capabilities.toolDetails.map((tool) => {
            const supportHints = resolveToolSupportHints(t, tool)

            return (
              <div key={tool.name} className="mcp-inspect-tool-row">
                <div className="mcp-inspect-tool-cell">
                  <div className="mcp-inspect-tool-head">
                    <Text className="mcp-inspect-tool-name">{tool.name}</Text>
                    {tool.title ? (
                      <Text type="secondary" className="mcp-inspect-tool-title">{tool.title}</Text>
                    ) : null}
                  </div>
                  <Text type="secondary" className="mcp-inspect-tool-description">
                    {tool.description || "-"}
                  </Text>
                  {supportHints.length > 0 ? (
                    <Text type="secondary" className="mcp-inspect-tool-hints">
                      {supportHints.join(" · ")}
                    </Text>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mcp-inspect-empty">
          <Text type="secondary">{capabilityMessage || t("MCP页.空状态.待检查")}</Text>
        </div>
      )}
    </div>
  )
}

export function InspectModal(props: InspectModalProps) {
  const {
    inspectItem,
    t,
    onCancel,
  } = props

  return (
    <Modal
      className="mcp-inspect-modal"
      open={Boolean(inspectItem)}
      width={920}
      footer={null}
      destroyOnHidden
      title={inspectItem?.name || t("MCP页.检查.标题")}
      onCancel={onCancel}
    >
      <InspectModalBody {...props} />
    </Modal>
  )
}

type MarketModalProps = {
  hasMarketSearchKeyword: boolean
  installedMarketCatalogIds: Set<string>
  installedMarketDisplayKeys: Set<string>
  installingMarketCatalogId: string | null
  marketAutoInstalling: boolean
  marketDialogOpen: boolean
  marketItems: MarketViewItem[]
  marketLoading: boolean
  marketProvider: McpMarketProviderId
  marketProviderOptions: McpMarketProvider[]
  marketQueries: string[]
  marketRefreshing: boolean
  marketSearchText: string
  marketTerms: string[]
  t: Translate
  onAutoInstall: () => void
  onCancel: () => void
  onInstall: (item: McpMarketItem) => void
  onProviderChange: (value: McpMarketProviderId) => void
  onSearch: () => void
  onSearchByNeed: () => void
  onSearchTextChange: (value: string) => void
}

export function MarketModal(props: MarketModalProps) {
  const {
    hasMarketSearchKeyword,
    installedMarketCatalogIds,
    installedMarketDisplayKeys,
    installingMarketCatalogId,
    marketAutoInstalling,
    marketDialogOpen,
    marketItems,
    marketLoading,
    marketProvider,
    marketProviderOptions,
    marketQueries,
    marketRefreshing,
    marketSearchText,
    marketTerms,
    t,
    onAutoInstall,
    onCancel,
    onInstall,
    onProviderChange,
    onSearch,
    onSearchByNeed,
    onSearchTextChange,
  } = props

  return (
    <Modal
      open={marketDialogOpen}
      width={980}
      footer={null}
      destroyOnHidden
      title={t("MCP页.市场.标题")}
      onCancel={onCancel}
    >
      <div className="mcp-market-layout">
        <div className="mcp-market-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined aria-hidden="true" />}
            className="mcp-market-search"
            placeholder={t("MCP页.输入.市场搜索占位")}
            value={marketSearchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            onPressEnter={onSearch}
          />
          <Select
            value={marketProvider}
            className="mcp-market-provider"
            onChange={onProviderChange}
            options={marketProviderOptions.map((provider) => ({
              value: provider.id,
              label: marketProviderLabel(t, provider.id, provider.label),
            }))}
          />
          <div className="mcp-market-toolbar-group">
            <Button loading={marketLoading || marketRefreshing} type="primary" onClick={onSearch}>
              {t("MCP页.按钮.市场搜索")}
            </Button>
            <Button loading={marketLoading || marketRefreshing} onClick={onSearchByNeed}>
              {t("MCP页.按钮.需求匹配")}
            </Button>
            <Button
              disabled={!hasMarketSearchKeyword}
              loading={marketAutoInstalling}
              onClick={onAutoInstall}
            >
              {marketAutoInstalling ? t("MCP页.按钮.自动安装中") : t("MCP页.按钮.自动安装最匹配")}
            </Button>
          </div>
        </div>

        {marketQueries.length > 0 || marketTerms.length > 0 ? (
          <div className="mcp-market-tags">
            {marketQueries.length > 0 ? (
              <div className="mcp-market-tag-group">
                <Text type="secondary">{t("MCP页.市场.值.检索词")}</Text>
                <Space wrap>
                  {marketQueries.map((query) => <Tag key={query}>{query}</Tag>)}
                </Space>
              </div>
            ) : null}
            {marketTerms.length > 0 ? (
              <div className="mcp-market-tag-group">
                <Text type="secondary">{t("MCP页.市场.值.扩展词")}</Text>
                <Space wrap>
                  {marketTerms.map((term) => <Tag key={term}>{term}</Tag>)}
                </Space>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mcp-result-list">
          {marketItems.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                marketLoading || marketRefreshing
                  ? t("MCP页.提示.加载中")
                  : hasMarketSearchKeyword
                    ? t("MCP页.空状态.无市场结果")
                    : t("MCP页.空状态.市场候选占位")
              }
            />
          ) : (
            <List
              itemLayout="vertical"
              dataSource={marketItems}
              renderItem={(item) => {
                const installed = installedMarketCatalogIds.has(item.catalogId)
                  || installedMarketDisplayKeys.has(buildMarketDisplayKey(item))

                return (
                  <List.Item
                    key={item.catalogId}
                    extra={(
                      <Button
                        type={installed ? "default" : "primary"}
                        disabled={installed}
                        loading={installingMarketCatalogId === item.catalogId}
                        onClick={() => onInstall(item)}
                      >
                        {installed ? t("MCP页.按钮.已安装") : t("MCP页.按钮.安装")}
                      </Button>
                    )}
                  >
                    <Space wrap className="mcp-result-tags">
                      <Text strong>{item.title}</Text>
                      <Tag bordered={false}>{marketProviderLabel(t, item.provider, item.platform)}</Tag>
                      <Tag bordered={false} color={marketStateTagColor(installed)}>
                        {installed ? t("MCP页.值.已安装") : t("MCP页.值.市场候选")}
                      </Tag>
                      <Tag bordered={false}>{item.transport}</Tag>
                    </Space>
                    {item.description ? <Paragraph type="secondary">{item.description}</Paragraph> : null}
                    <Text type="secondary" className="mcp-result-endpoint">{item.endpoint}</Text>
                  </List.Item>
                )
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

type RecommendedModalProps = {
  installingRecommendedId: string | null
  recommendedDialogOpen: boolean
  recommendedItems: McpRecommendedItem[]
  t: Translate
  onCancel: () => void
  onInstall: (item: McpRecommendedItem) => void
}

export function RecommendedModal(props: RecommendedModalProps) {
  const { installingRecommendedId, recommendedDialogOpen, recommendedItems, t, onCancel, onInstall } = props

  return (
    <Modal
      open={recommendedDialogOpen}
      width={900}
      footer={null}
      destroyOnHidden
      title={t("MCP页.推荐.标题")}
      onCancel={onCancel}
    >
      <div className="mcp-result-list">
        {recommendedItems.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("MCP页.空状态.无推荐项")} />
        ) : (
          <List
            itemLayout="vertical"
            dataSource={recommendedItems}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                extra={(
                  <Button
                    type={item.installed ? "default" : "primary"}
                    disabled={item.installed}
                    loading={installingRecommendedId === item.id}
                    onClick={() => onInstall(item)}
                  >
                    {item.installed ? t("MCP页.按钮.已安装") : t("MCP页.按钮.安装")}
                  </Button>
                )}
              >
                <Space wrap className="mcp-result-tags">
                  <Text strong>{item.title}</Text>
                  <Tag bordered={false} color={marketStateTagColor(item.installed)}>
                    {item.installed ? t("MCP页.值.已安装") : t("MCP页.值.推荐")}
                  </Tag>
                  <Tag bordered={false}>{item.transport}</Tag>
                </Space>
                <Paragraph type="secondary">{item.description}</Paragraph>
                <Text type="secondary" className="mcp-result-endpoint">{item.endpoint}</Text>
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  )
}

type McpEditorModalProps = {
  deletingId: string | null
  editingItem: McpView | null
  form: McpForm
  modalOpen: boolean
  saving: boolean
  showSaveButton: boolean
  t: Translate
  testResult: TestResult | null
  testing: boolean
  onCancel: () => void
  onDelete: (item: McpView) => void
  onFormChange: (updater: (prev: McpForm) => McpForm) => void
  onSave: () => void
  onTestConnection: () => void
}

function renderScopeOptions(t: Translate) {
  return [
    { value: "global", label: t("MCP页.值.作用域.全局") },
    { value: "workspace", label: t("MCP页.值.作用域.工作区") },
  ]
}

export function McpEditorModal(props: McpEditorModalProps) {
  const { deletingId, editingItem, form, modalOpen, saving, showSaveButton, t, testResult, testing, onCancel, onDelete, onFormChange, onSave, onTestConnection } = props

  return (
    <Modal
      open={modalOpen}
      width={720}
      destroyOnHidden
      className="mcp-editor-modal"
      title={editingItem ? t("MCP页.弹窗.标题.编辑") : t("MCP页.弹窗.标题.新建")}
      onCancel={onCancel}
      footer={[
        editingItem ? (
          <Button
            key="delete"
            danger
            loading={deletingId === editingItem.id}
            onClick={() => onDelete(editingItem)}
          >
            {t("MCP页.按钮.删除")}
          </Button>
        ) : null,
        <Button key="cancel" onClick={onCancel}>{t("MCP页.按钮.取消")}</Button>,
        showSaveButton ? (
          <Button key="save" type="primary" loading={saving} onClick={onSave}>
            {t("MCP页.按钮.保存")}
          </Button>
        ) : null,
      ]}
    >
      <div className="mcp-editor-layout">
        <Form layout="vertical" className="mcp-editor-form" size="small">
          <div className="mcp-editor-grid">
            <Form.Item label={t("MCP页.字段.name")}>
              <Input value={form.name} onChange={(event) => onFormChange((current) => ({ ...current, name: event.target.value }))} />
            </Form.Item>
            <Form.Item label={t("MCP页.字段.scope")}>
              <Select value={form.scope} options={renderScopeOptions(t)} onChange={(value: McpScope) => onFormChange((current) => ({ ...current, scope: value }))} />
            </Form.Item>
            <Form.Item label={t("MCP页.字段.transport")}>
              <Select
                value={form.transport}
                options={[
                  { value: "stdio", label: "stdio" },
                  { value: "http-streamable", label: "http-streamable" },
                  { value: "sse", label: "sse" },
                ]}
                onChange={(value: McpTransport) => onFormChange((current) => ({ ...current, transport: value }))}
              />
            </Form.Item>
            <Form.Item label={t("MCP页.字段.timeoutMs")}>
              <Input value={form.timeoutMs} onChange={(event) => onFormChange((current) => ({ ...current, timeoutMs: event.target.value }))} />
            </Form.Item>
          </div>

          {form.scope === "workspace" ? (
            <Form.Item label={t("MCP页.字段.workspaceId")}>
              <Input value={form.workspaceId} onChange={(event) => onFormChange((current) => ({ ...current, workspaceId: event.target.value }))} />
            </Form.Item>
          ) : null}

          <Form.Item label={t("MCP页.字段.endpoint")}>
            <Input value={form.endpoint} onChange={(event) => onFormChange((current) => ({ ...current, endpoint: event.target.value }))} />
          </Form.Item>
          <Form.Item label={t("MCP页.字段.tags")}>
            <Input value={form.tagsText} onChange={(event) => onFormChange((current) => ({ ...current, tagsText: event.target.value }))} />
          </Form.Item>
          <Form.Item label={t("MCP页.字段.description")}>
            <TextArea rows={2} value={form.description} onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))} />
          </Form.Item>

          <div className="mcp-editor-grid">
            {form.transport === "stdio" ? (
              <>
                <Form.Item label={t("MCP页.字段.argsText")}>
                  <TextArea rows={4} value={form.argsText} onChange={(event) => onFormChange((current) => ({ ...current, argsText: event.target.value }))} />
                </Form.Item>
                <Form.Item label={t("MCP页.字段.envText")}>
                  <TextArea rows={4} value={form.envText} onChange={(event) => onFormChange((current) => ({ ...current, envText: event.target.value }))} />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item label={t("MCP页.字段.headersText")}>
                  <TextArea rows={4} value={form.headersText} onChange={(event) => onFormChange((current) => ({ ...current, headersText: event.target.value }))} />
                </Form.Item>
                <Form.Item label={t("MCP页.字段.queryText")}>
                  <TextArea rows={4} value={form.queryText} onChange={(event) => onFormChange((current) => ({ ...current, queryText: event.target.value }))} />
                </Form.Item>
              </>
            )}
          </div>

          <div className="mcp-editor-check">
            <Space wrap>
              <Switch checked={form.enabled} onChange={(checked) => onFormChange((current) => ({ ...current, enabled: checked }))} />
              <Text>{t("MCP页.字段.enabled")}</Text>
            </Space>
            <Space wrap>
              <Button icon={<ApiOutlined aria-hidden="true" />} loading={testing} onClick={onTestConnection} size="small">
                {t("MCP页.按钮.测试连接")}
              </Button>
              {testResult ? (
                <>
                  <Tag bordered={false} color={statusTagColor(testResult.status)}>
                    {t(`MCP页.值.健康.${testResult.status}` as never)}
                  </Tag>
                  <Tag bordered={false}>{testResult.latencyMs}ms</Tag>
                  <Text type="secondary">{testResult.reasonCode || testResult.message || "-"}</Text>
                </>
              ) : null}
            </Space>
          </div>
        </Form>
      </div>
    </Modal>
  )
}
