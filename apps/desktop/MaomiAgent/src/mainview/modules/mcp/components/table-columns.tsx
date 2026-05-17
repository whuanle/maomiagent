import {
  DeleteOutlined,
  EditOutlined,
  SafetyOutlined,
} from "@ant-design/icons"
import {
  Button,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd"
import type { Translate } from "../../../i18n"
import type {
  McpHealthRecord,
  McpHealthStatus,
  McpScope,
  McpTransport,
  McpView,
} from "../../../lib/desktop-mcp"
import {
  deriveListStatus,
  formatDateTime,
  scopeTagColor,
  statusTagColor,
} from "../helpers"

const { Text } = Typography

type McpColumnsOptions = {
  deletingId: string | null
  nameSortOrder: "ascend" | "descend"
  pendingToggleIds: string[]
  onDelete: (row: McpView) => void
  onEdit: (row: McpView) => void
  onInspect: (row: McpView) => void
  onToggleEnabled: (row: McpView, enabled: boolean) => void
  t: Translate
}

export function createMcpColumns(options: McpColumnsOptions): TableColumnsType<McpView> {
  const { deletingId, nameSortOrder, onDelete, onEdit, onInspect, onToggleEnabled, pendingToggleIds, t } = options

  return [
    {
      title: t("MCP页.字段.name"),
      dataIndex: "name",
      key: "name",
      sorter: true,
      sortDirections: ["ascend", "descend", "ascend"],
      sortOrder: nameSortOrder,
      width: 220,
      render: (value: string) => (
        <span className="mcp-table-name" title={value}>
          {value}
        </span>
      ),
    },
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 180,
      render: (value: string) => (
        <code className="mcp-table-code" title={value}>
          {value}
        </code>
      ),
    },
    {
      title: t("MCP页.列.健康"),
      key: "health",
      width: 104,
      align: "center",
      render: (_value, row) => {
        const rowStatus = deriveListStatus(row)
        return (
          <Tag bordered={false} color={statusTagColor(rowStatus)}>
            {t(`MCP页.值.健康.${rowStatus}` as never)}
          </Tag>
        )
      },
    },
    {
      title: t("MCP页.列.作用域"),
      dataIndex: "scope",
      key: "scope",
      width: 108,
      align: "center",
      render: (value: McpScope) => (
        <Tag bordered={false} color={scopeTagColor(value)}>
          {value === "global" ? t("MCP页.值.作用域.全局") : t("MCP页.值.作用域.工作区")}
        </Tag>
      ),
    },
    {
      title: t("MCP页.详情.字段.transport"),
      dataIndex: "transport",
      key: "transport",
      width: 144,
      render: (value: McpTransport) => (
        <Tag bordered={false} className="mcp-table-transport-tag">
          {value}
        </Tag>
      ),
    },
    {
      title: t("MCP页.详情.字段.endpoint"),
      dataIndex: "endpoint",
      key: "endpoint",
      width: 360,
      ellipsis: true,
      render: (value: string) => (
        <Text ellipsis={{ tooltip: value }} className="mcp-table-endpoint-text">
          {value}
        </Text>
      ),
    },
    {
      title: t("MCP页.字段.tags"),
      dataIndex: "tags",
      key: "tags",
      width: 180,
      render: (value: string[] | undefined) =>
        value && value.length > 0 ? (
          <Space size={[6, 6]} wrap className="mcp-table-tags">
            {value.slice(0, 3).map((tag) => (
              <Tag key={tag} bordered={false}>
                {tag}
              </Tag>
            ))}
            {value.length > 3 ? (
              <Tag bordered={false}>+{value.length - 3}</Tag>
            ) : null}
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: t("MCP页.工作台.更新时间"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 176,
      align: "center",
      render: (value: string) => <span className="mcp-table-updated">{formatDateTime(value)}</span>,
    },
    {
      title: t("MCP页.字段.enabled"),
      dataIndex: "enabled",
      key: "enabled",
      width: 92,
      align: "center",
      render: (_value, row) => {
        const pending = pendingToggleIds.includes(row.id)
        return (
          <div className="mcp-table-switch-cell">
            <Switch
              className="mcp-table-enabled-switch"
              checked={row.enabled}
              loading={pending}
              disabled={pending}
              onChange={(checked) => {
                onToggleEnabled(row, checked)
              }}
            />
          </div>
        )
      },
    },
    {
      title: t("MCP页.工作台.操作"),
      key: "actions",
      width: 156,
      align: "center",
      render: (_value, row) => (
        <Space size={2} className="mcp-table-icon-actions">
          <Tooltip title={t("MCP页.按钮.检查")}>
            <Button
              type="text"
              size="small"
              icon={<SafetyOutlined aria-hidden="true" />}
              className="mcp-table-icon-button mcp-table-inspect-button"
              onClick={() => {
                onInspect(row)
              }}
            >
              {t("MCP页.按钮.检查")}
            </Button>
          </Tooltip>
          <Tooltip title={t("MCP页.按钮.编辑")}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined aria-hidden="true" />}
              className="mcp-table-icon-button"
              onClick={() => {
                onEdit(row)
              }}
            />
          </Tooltip>
          <Tooltip title={t("MCP页.按钮.删除")}>
            <Button
              danger
              type="text"
              size="small"
              icon={<DeleteOutlined aria-hidden="true" />}
              className="mcp-table-icon-button mcp-table-icon-button-danger"
              loading={deletingId === row.id}
              onClick={() => {
                onDelete(row)
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]
}

export function createHealthColumns(t: Translate): TableColumnsType<McpHealthRecord> {
  return [
    {
      title: t("MCP页.列.检查时间"),
      dataIndex: "checkedAt",
      key: "checkedAt",
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: t("MCP页.列.健康"),
      dataIndex: "status",
      key: "status",
      width: 100,
      align: "center",
      render: (value: McpHealthStatus) => (
        <Tag color={statusTagColor(value)}>{t(`MCP页.值.健康.${value}` as never)}</Tag>
      ),
    },
    {
      title: t("MCP页.列.延迟"),
      dataIndex: "latencyMs",
      key: "latencyMs",
      width: 100,
      render: (value: number) => `${value}ms`,
    },
    {
      title: t("MCP页.列.原因"),
      key: "reason",
      render: (_value, row) => `${row.reasonCode || "-"}${row.message ? ` | ${row.message}` : ""}`,
    },
  ]
}
