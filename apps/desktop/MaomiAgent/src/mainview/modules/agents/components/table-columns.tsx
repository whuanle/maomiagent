import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
} from "@ant-design/icons"
import { Button, Popconfirm, Space, Switch, Tag, Tooltip, type TableColumnsType } from "antd"
import type { AgentItem } from "../../../../shared/desktop-agents"
import type { AgentsTranslate as Translate } from "../agents-i18n"
import {
  displayAgentUpdatedAt,
  isReadonlyAgent,
  modeBadgeClass,
  sourceBadgeClass,
  sourceBadgeLabel,
  summarizeAgent,
} from "../helpers"
import { AgentRelationTagList } from "./agent-relation-tags"
import type { AgentListItem } from "./agent-relations"

type CreateAgentColumnsArgs = {
  deletingId: string | null
  togglingId: string | null
  t: Translate
  onView: (item: AgentItem) => void
  onEdit: (item: AgentItem) => void
  onRemove: (item: AgentItem) => Promise<void> | void
  onToggleEnabled: (item: AgentItem) => void
}

export function createAgentColumns<TRow extends AgentListItem>(
  args: CreateAgentColumnsArgs,
): TableColumnsType<TRow> {
  const {
    deletingId,
    togglingId,
    t,
    onEdit,
    onRemove,
    onToggleEnabled,
    onView,
  } = args

  return [
    {
      title: t("智能体页.列.智能体"),
      dataIndex: "name",
      key: "name",
      width: 180,
      render: (value: string) => (
        <span className="agents-table-name" title={value}>
          {value}
        </span>
      ),
    },
    {
      title: t("智能体页.字段.agentId"),
      dataIndex: "agentId",
      key: "agentId",
      width: 220,
      render: (value: string) => (
        <code className="agents-table-code" title={value}>
          {value}
        </code>
      ),
    },
    {
      title: t("智能体页.列.模式"),
      dataIndex: "mode",
      key: "mode",
      width: 136,
      render: (_value, row) => (
        <Tag bordered={false} className={`agents-table-kind-tag ${modeBadgeClass(row.mode)}`}>
          {t(`智能体页.值.模式.${row.mode}`)}
        </Tag>
      ),
    },
    {
      title: t("智能体页.列.来源"),
      dataIndex: "source",
      key: "source",
      width: 172,
      render: (_value, row) => (
        <Tag bordered={false} className={`agents-table-kind-tag ${sourceBadgeClass(row.source)}`}>
          {sourceBadgeLabel(t, row.source)}
        </Tag>
      ),
    },
    {
      title: t("智能体页.列.关联"),
      key: "relations",
      width: 220,
      render: (_value, row) => (
        <AgentRelationTagList groups={row.relationInfo.groups} maxVisible={2} t={t} />
      ),
    },
    {
      title: t("智能体页.字段.version"),
      dataIndex: "version",
      key: "version",
      width: 112,
      render: (value: string) => (
        <span className="agents-table-version" title={value}>
          {value}
        </span>
      ),
    },
    {
      title: t("智能体页.字段.description"),
      key: "description",
      width: 360,
      render: (_value, row) => {
        const summary = summarizeAgent(row, t)
        return (
          <span className="agents-table-summary" title={summary}>
            {summary}
          </span>
        )
      },
    },
    {
      title: t("智能体页.列.更新时间"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 176,
      render: (_value, row) => (
        <span className="agents-table-updated">{displayAgentUpdatedAt(row)}</span>
      ),
    },
    {
      title: t("智能体页.列.状态"),
      dataIndex: "enabled",
      key: "enabled",
      width: 96,
      align: "center",
      render: (_value, row) => (row as TRow & { nested?: boolean }).nested || row.mode === "subagent"
        ? (
            <div className="agents-table-status-cell">
              <span className="agents-table-status-placeholder" aria-hidden="true">-</span>
            </div>
          )
        : (
            <div className="agents-table-status-cell">
              <Switch
                checked={row.enabled}
                loading={togglingId === row.agentId}
                disabled={isReadonlyAgent(row)}
                aria-label={`${t("智能体页.字段.enabled")} ${row.name}`}
                onChange={() => onToggleEnabled(row)}
                onClick={(_, event) => {
                  event?.stopPropagation()
                }}
              />
            </div>
          ),
    },
    {
      title: t("智能体页.列.操作"),
      key: "actions",
      width: 118,
      align: "center",
      render: (_value, row) => (
        <Space size={2} className="agents-table-actions">
          <Tooltip title={t("智能体页.按钮.查看")}>
            <Button
              type="text"
              className="agents-table-action-button"
              icon={<EyeOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onView(row)
              }}
            />
          </Tooltip>
          <Tooltip title={t("智能体页.按钮.编辑")}>
            <Button
              type="text"
              className="agents-table-action-button"
              disabled={isReadonlyAgent(row)}
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onEdit(row)
              }}
            />
          </Tooltip>
          <Popconfirm
            title={t("智能体页.提示.确认删除")}
            description={row.agentId}
            okText={t("智能体页.按钮.删除")}
            cancelText={t("智能体页.按钮.取消")}
            okButtonProps={{
              danger: true,
              loading: deletingId === row.agentId,
            }}
            disabled={isReadonlyAgent(row)}
            onConfirm={() => onRemove(row)}
          >
            <Tooltip title={t("智能体页.按钮.删除")}>
              <Button
                type="text"
                danger
                className="agents-table-action-button"
                disabled={isReadonlyAgent(row)}
                loading={deletingId === row.agentId}
                icon={<DeleteOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]
}
