import {
  DeleteOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons"
import {
  Button,
  Input,
  Popconfirm,
  Table,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import type { ColumnsType } from "antd/es/table"
import type { FeishuResolvedTool, FeishuStateView } from "../../../../shared/desktop-feishu"

const { Paragraph, Text } = Typography

type Props = {
  state: FeishuStateView | null
  loadError: string
  personalUrl: string
  saving: boolean
  clearing: boolean
  canOpenDocsWorkspace: boolean
  onPersonalUrlChange: (value: string) => void
  onSave: () => void
  onClear: () => void
  onOpenDocsWorkspace: () => void
  onRefresh: () => void
}

const TOOL_COLUMNS: ColumnsType<FeishuResolvedTool> = [
  {
    title: "工具",
    dataIndex: "name",
    key: "name",
    render: (value: string) => <Text strong>{value}</Text>,
  },
  {
    title: "说明",
    dataIndex: "description",
    key: "description",
    render: (value?: string) => value?.trim() || <Text type="secondary">暂无说明</Text>,
  },
]

function formatTimestamp(value?: string): string {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-"
}

export function FeishuPersonalDocsPanel(props: Props) {
  const personalDocs = props.state?.personalDocs
  const docsMcp = personalDocs?.docsMcp ?? null
  const tools = personalDocs?.discoveredTools ?? []
  const configured = personalDocs?.enabled === true
  const smartAssistantEnabled = props.state?.smartAssistant.enabled === true
  const statusTags = smartAssistantEnabled
    ? [
        <Tag key="blocked" color="gold" variant="filled">已停用</Tag>,
      ]
    : [
        configured
          ? <Tag key="configured" color="green" variant="filled">已配置</Tag>
          : <Tag key="configured" variant="filled">未配置</Tag>,
        props.canOpenDocsWorkspace
          ? <Tag key="workspace" color="green" variant="filled">文档工作区可用</Tag>
          : <Tag key="workspace" variant="filled">文档工作区未就绪</Tag>,
        docsMcp
          ? (
              <Tag key="docs-mcp" color={docsMcp.enabled ? "green" : "default"} variant="filled">
                {docsMcp.name}
              </Tag>
            )
          : <Tag key="docs-mcp" variant="filled">未绑定 MCP</Tag>,
      ]

  return (
    <div className="feishu-module-panel feishu-personal-panel">
      <div className="feishu-module-stack feishu-personal-layout-shell">
        <div className={[
          "feishu-personal-layout",
          smartAssistantEnabled ? "is-smart-assistant-blocked" : "",
        ].filter(Boolean).join(" ")}>
          <aside className="feishu-personal-sidebar">
            <section className="feishu-personal-access-strip">
              <div className="feishu-personal-access-form">
                <div className="feishu-personal-access-field">
                  <Text strong>个人远程 MCP 地址</Text>
                  {smartAssistantEnabled ? (
                    <Text type="secondary">
                      已启用飞书智能助手，个人文档 MCP 已停用。请先重置智能助手配置。
                    </Text>
                  ) : (
                    <Text type="secondary">填入飞书个人远程 MCP URL。</Text>
                  )}
                </div>

                <div className="feishu-personal-access-statuses">
                  {statusTags}
                </div>

                <div className="feishu-personal-access-field">
                  <Text type="secondary">服务器 URL</Text>
                  <Input.TextArea
                    rows={6}
                    disabled={smartAssistantEnabled}
                    value={props.personalUrl}
                    placeholder="粘贴飞书 MCP 配置平台生成的个人远程 MCP URL"
                    spellCheck={false}
                    className="feishu-personal-access-input"
                    onChange={(event) => props.onPersonalUrlChange(event.target.value)}
                  />
                </div>
              </div>

              <div className="feishu-personal-access-actions">
                <div className="feishu-personal-access-action-grid">
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    disabled={smartAssistantEnabled}
                    loading={props.saving}
                    className="feishu-personal-access-action-button"
                    onClick={props.onSave}
                  >
                    保存个人文档 MCP
                  </Button>
                  <Button
                    icon={<FolderOpenOutlined />}
                    disabled={smartAssistantEnabled || !props.canOpenDocsWorkspace}
                    className="feishu-personal-access-action-button"
                    onClick={props.onOpenDocsWorkspace}
                  >
                    打开文档工作区
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    disabled={smartAssistantEnabled}
                    className="feishu-personal-access-action-button"
                    onClick={props.onRefresh}
                  >
                    刷新状态
                  </Button>
                  <Popconfirm
                    disabled={smartAssistantEnabled}
                    title="确认清除个人文档 MCP 配置？"
                    okText="清除"
                    cancelText="取消"
                    onConfirm={props.onClear}
                  >
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      disabled={smartAssistantEnabled}
                      loading={props.clearing}
                      className="feishu-personal-access-action-button"
                    >
                      清除配置
                    </Button>
                  </Popconfirm>
                </div>
              </div>

            </section>
          </aside>

          {smartAssistantEnabled ? null : (
            <section className="feishu-personal-directory">
              <div className="feishu-personal-meta-grid">
                <div className="feishu-personal-meta-item">
                  <Text type="secondary">保存时间</Text>
                  <Text>{formatTimestamp(personalDocs?.savedAt)}</Text>
                </div>
                <div className="feishu-personal-meta-item">
                  <Text type="secondary">MCP 绑定</Text>
                  {docsMcp ? (
                    <Text>{docsMcp.name}</Text>
                  ) : (
                    <Text type="secondary">未绑定</Text>
                  )}
                </div>
                <div className="feishu-personal-meta-item">
                  <Text type="secondary">已发现工具</Text>
                  <Text>{tools.length > 0 ? `${tools.length} 个` : "暂无"}</Text>
                </div>
                <div className="feishu-personal-meta-item is-span-2">
                  <Text type="secondary">MCP 地址</Text>
                  <Paragraph
                    copyable={docsMcp?.endpoint ? { text: docsMcp.endpoint } : false}
                    className="feishu-module-copy-paragraph feishu-personal-copy-paragraph"
                  >
                    {docsMcp?.endpoint || "-"}
                  </Paragraph>
                </div>
              </div>

              <section className="feishu-personal-table-shell">
                <div className="feishu-personal-table-head">
                  <Text strong>已发现工具</Text>
                  <Text type="secondary">
                    {configured
                      ? (tools.length > 0 ? `当前已同步 ${tools.length} 个工具` : "保存或刷新后可重新同步工具列表")
                      : "先保存个人远程 MCP URL"}
                  </Text>
                </div>

                <Table
                  rowKey={(item) => item.name}
                  columns={TOOL_COLUMNS}
                  dataSource={tools}
                  pagination={false}
                  className="feishu-personal-tools-table"
                  locale={{
                    emptyText: configured
                      ? "当前还没有工具探测结果，保存后可刷新。"
                      : "未配置个人文档 MCP。",
                  }}
                  size="middle"
                />
              </section>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
