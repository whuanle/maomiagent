import {
  AppstoreOutlined,
  CopyOutlined,
} from "@ant-design/icons"
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  List,
  Popconfirm,
  Radio,
  Space,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { Fragment } from "react"
import type {
  FeishuDeveloperAuthStatus,
  FeishuStateView,
} from "../../../../shared/desktop-feishu"
import type { FeishuTranslate as Translate } from "../types"

const { Paragraph, Text } = Typography
const { TextArea } = Input

type FeishuEditorMode = "personal" | "developer"

type Props = {
  t: Translate
  state: FeishuStateView | null
  loadError: string
  mode: FeishuEditorMode
  personalUrl: string
  developerAppId: string
  developerAppSecret: string
  savingPersonal: boolean
  savingDeveloper: boolean
  authorizing: boolean
  refreshingToken: boolean
  clearing: boolean
  canOpenDocsWorkspace: boolean
  onModeChange: (mode: FeishuEditorMode) => void
  onPersonalUrlChange: (value: string) => void
  onDeveloperAppIdChange: (value: string) => void
  onDeveloperAppSecretChange: (value: string) => void
  onSavePersonal: () => void
  onSaveDeveloper: () => void
  onAuthorizeDeveloper: () => void
  onRefreshDeveloperToken: () => void
  onClearConfig: () => void
  onOpenDocsWorkspace: () => void
}

const FEISHU_CONFIG_ITEMS: Array<{
  value: FeishuEditorMode
  labelKey: "飞书页.标签.个人" | "飞书页.标签.开发者"
}> = [
  {
    value: "personal",
    labelKey: "飞书页.标签.个人",
  },
  {
    value: "developer",
    labelKey: "飞书页.标签.开发者",
  },
]

function formatTimestamp(value?: string): string {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-"
}

function resolveDeveloperAuthStatusText(
  t: Translate,
  status: FeishuDeveloperAuthStatus,
): string {
  switch (status) {
    case "authorized":
      return t("飞书页.状态.authorized")
    case "pending":
      return t("飞书页.状态.pending")
    case "expired":
      return t("飞书页.状态.expired")
    case "error":
      return t("飞书页.状态.error")
    default:
      return t("飞书页.状态.idle")
  }
}

function renderModeTag(
  t: Translate,
  mode: FeishuStateView["mode"],
) {
  if (mode === "personal") {
    return <Tag bordered={false} color="geekblue">{t("飞书页.标签.个人")}</Tag>
  }
  if (mode === "developer") {
    return <Tag bordered={false} color="cyan">{t("飞书页.标签.开发者")}</Tag>
  }
  return <Tag bordered={false}>{t("飞书页.值.未配置")}</Tag>
}

function renderDeveloperAuthStatusTag(
  t: Translate,
  status: FeishuDeveloperAuthStatus,
) {
  switch (status) {
    case "authorized":
      return <Tag bordered={false} color="green">{t("飞书页.状态.authorized")}</Tag>
    case "pending":
      return <Tag bordered={false} color="blue">{t("飞书页.状态.pending")}</Tag>
    case "expired":
      return <Tag bordered={false} color="orange">{t("飞书页.状态.expired")}</Tag>
    case "error":
      return <Tag bordered={false} color="red">{t("飞书页.状态.error")}</Tag>
    default:
      return <Tag bordered={false}>{t("飞书页.状态.idle")}</Tag>
  }
}

function resolveConfigStatusText(
  t: Translate,
  state: FeishuStateView | null,
  mode: FeishuEditorMode,
): string {
  if (mode === "personal") {
    return state?.personal?.serverUrl
      ? t("飞书页.状态.authorized")
      : t("飞书页.值.未配置")
  }

  return state?.developer
    ? resolveDeveloperAuthStatusText(t, state.developer.authStatus)
    : t("飞书页.值.未配置")
}

function renderConfigAuthStatusTag(
  t: Translate,
  state: FeishuStateView | null,
  mode: FeishuEditorMode,
) {
  if (mode === "personal") {
    if (state?.personal?.serverUrl) {
      return <Tag bordered={false} color="green">{t("飞书页.状态.authorized")}</Tag>
    }
    return <Tag bordered={false}>{t("飞书页.值.未配置")}</Tag>
  }

  if (state?.developer) {
    return renderDeveloperAuthStatusTag(t, state.developer.authStatus)
  }

  return <Tag bordered={false}>{t("飞书页.值.未配置")}</Tag>
}

function renderAutoRefreshTaskTag(
  t: Translate,
  state: FeishuStateView | null,
) {
  const autoRefreshTask = state?.developer?.autoRefreshTask
  if (!autoRefreshTask?.taskId) {
    return <Tag bordered={false}>{t("飞书页.智能助手.自动续期状态.未创建")}</Tag>
  }
  if (autoRefreshTask.status === "failed") {
    return <Tag bordered={false} color="red">{t("飞书页.智能助手.自动续期状态.异常")}</Tag>
  }
  if (autoRefreshTask.enabled === false) {
    return <Tag bordered={false} color="orange">{t("飞书页.智能助手.自动续期状态.已停用")}</Tag>
  }
  if (autoRefreshTask.status === "running") {
    return <Tag bordered={false} color="blue">{t("飞书页.智能助手.自动续期状态.执行中")}</Tag>
  }
  if (autoRefreshTask.status === "queued") {
    return <Tag bordered={false} color="gold">{t("飞书页.智能助手.自动续期状态.待执行")}</Tag>
  }
  return <Tag bordered={false} color="green">{t("飞书页.智能助手.自动续期状态.已启用")}</Tag>
}

function renderMcpStatus(
  t: Translate,
  state: FeishuStateView | null,
  mode: FeishuEditorMode,
) {
  const managedMcp = state?.managedMcp
  if (!managedMcp || state?.mode !== mode) {
    return <Text type="secondary">{t("飞书页.值.MCP未绑定")}</Text>
  }
  return (
    <Space wrap size={[8, 8]}>
      <Tag bordered={false} color={managedMcp.enabled ? "green" : "default"}>
        {managedMcp.enabled ? t("飞书页.标签.MCP已启用") : t("飞书页.标签.MCP未启用")}
      </Tag>
      <Text type="secondary">{managedMcp.name}</Text>
    </Space>
  )
}

function renderToolList(
  items: Array<{ name: string; description?: string }>,
  emptyText?: string,
) {
  if (items.length === 0) {
    return emptyText
      ? <Text type="secondary">{emptyText}</Text>
      : null
  }

  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(item) => (
        <List.Item>
          <div className="feishu-detail-tool-item">
            <Text strong>{item.name}</Text>
            {item.description ? (
              <Text type="secondary">{item.description}</Text>
            ) : null}
          </div>
        </List.Item>
      )}
    />
  )
}

export function FeishuDetailPanel(props: Props) {
  const developer = props.state?.developer ?? null
  const currentMode = props.state?.mode ?? "none"
  const selectedMode = props.mode
  const personalSelected = selectedMode === "personal"
  const developerSelected = selectedMode === "developer"
  const toolItems = props.state?.catalog.supportedTools ?? []
  const personalToolItems = props.state?.personal?.discoveredTools ?? []
  const userScopes = props.state?.catalog.developerScopes ?? []
  const tenantScopes = props.state?.catalog.developerTenantScopes ?? []
  const scopeCount = userScopes.length + tenantScopes.length
  const scopeJson = JSON.stringify({
    scopes: {
      tenant: tenantScopes,
      user: userScopes,
    },
  }, null, 2)
  const redirectUri = developer?.redirectUri ?? ""

  return (
    <Card className="panel-card feishu-detail-card" bordered>
      <div className="feishu-detail-layout">
        <section className="feishu-detail-input-pane">
          <div className="feishu-detail-pane-surface feishu-detail-editor-stack">
            <div className="feishu-detail-toolbar">
              <Space wrap>
                <Button
                  type="text"
                  className="feishu-detail-toolbar-button is-workspace"
                  icon={<AppstoreOutlined />}
                  disabled={!props.canOpenDocsWorkspace}
                  onClick={props.onOpenDocsWorkspace}
                >
                  {props.t("飞书页.按钮.打开文档工作区")}
                </Button>
                <Popconfirm
                  title={props.t("飞书页.提示.确认清除配置")}
                  okText={props.t("飞书页.按钮.清除配置")}
                  cancelText={props.t("危险操作.弹窗.取消")}
                  onConfirm={props.onClearConfig}
                >
                  <Button
                    type="text"
                    danger
                    className="feishu-detail-toolbar-button is-danger"
                    loading={props.clearing}
                  >
                    {props.t("飞书页.按钮.清除配置")}
                  </Button>
                </Popconfirm>
              </Space>
            </div>

            <Divider className="feishu-detail-section-divider" />

            <Radio.Group
              className="feishu-detail-config-panel"
              value={selectedMode}
              onChange={(event) => props.onModeChange(event.target.value as FeishuEditorMode)}
            >
              {FEISHU_CONFIG_ITEMS.map((item, index) => {
                const active = item.value === selectedMode
                return (
                  <Fragment key={item.value}>
                    <Radio
                      value={item.value}
                      className={`feishu-detail-config-option${active ? " is-active" : ""}`}
                    >
                      <span className="feishu-detail-config-content">
                        <span className="feishu-detail-config-name">{props.t(item.labelKey)}</span>
                        <span className="feishu-detail-config-meta">
                          {resolveConfigStatusText(props.t, props.state, item.value)}
                        </span>
                      </span>
                    </Radio>
                    {index < FEISHU_CONFIG_ITEMS.length - 1 ? (
                      <Divider type="vertical" className="feishu-detail-config-divider" />
                    ) : null}
                  </Fragment>
                )
              })}
            </Radio.Group>

            <Divider className="feishu-detail-section-divider" />

            <div className="feishu-detail-editor-panel">
              <section className={`feishu-detail-form-section${personalSelected ? " is-active" : " is-inactive"}`}>
                <div className="feishu-detail-form-head">
                  <Text strong>{props.t("飞书页.标签.个人")}</Text>
                  <Text type="secondary">{resolveConfigStatusText(props.t, props.state, "personal")}</Text>
                </div>
                <div className="feishu-detail-form-fields">
                  <div className="feishu-detail-field-block">
                    <Text type="secondary">{props.t("飞书页.行.个人URL")}</Text>
                    <TextArea
                      className="feishu-detail-textarea"
                      rows={8}
                      value={props.personalUrl}
                      disabled={!personalSelected}
                      placeholder={props.t("飞书页.字段.个人URL占位")}
                      spellCheck={false}
                      onChange={(event) => props.onPersonalUrlChange(event.target.value)}
                    />
                  </div>

                  <Button
                    type="primary"
                    size="large"
                    block
                    disabled={!personalSelected}
                    loading={props.savingPersonal}
                    onClick={props.onSavePersonal}
                  >
                    {props.t("飞书页.按钮.保存个人URL")}
                  </Button>
                </div>
              </section>

              <Divider className="feishu-detail-section-divider" />

              <section className={`feishu-detail-form-section${developerSelected ? " is-active" : " is-inactive"}`}>
                <div className="feishu-detail-form-head">
                  <Text strong>{props.t("飞书页.标签.开发者")}</Text>
                  <Text type="secondary">{resolveConfigStatusText(props.t, props.state, "developer")}</Text>
                </div>
                <div className="feishu-detail-form-fields">
                  <div className="feishu-detail-field-block">
                    <Text type="secondary">{props.t("飞书页.字段.AppId")}</Text>
                    <Input
                      size="large"
                      value={props.developerAppId}
                      disabled={!developerSelected}
                      placeholder={props.t("飞书页.字段.AppId占位")}
                      spellCheck={false}
                      onChange={(event) => props.onDeveloperAppIdChange(event.target.value)}
                    />
                  </div>

                  <div className="feishu-detail-field-block">
                    <Text type="secondary">{props.t("飞书页.字段.AppSecret")}</Text>
                    <Input.Password
                      size="large"
                      value={props.developerAppSecret}
                      disabled={!developerSelected}
                      placeholder={
                        developer?.hasAppSecret
                          ? props.t("飞书页.字段.AppSecret已保存占位")
                          : props.t("飞书页.字段.AppSecret占位")
                      }
                      onChange={(event) => props.onDeveloperAppSecretChange(event.target.value)}
                    />
                  </div>

                  <Button
                    type="primary"
                    size="large"
                    block
                    disabled={!developerSelected}
                    loading={props.savingDeveloper}
                    onClick={props.onSaveDeveloper}
                  >
                    {props.t("飞书页.按钮.保存开发者配置")}
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="feishu-detail-status-pane">
          <div className="feishu-detail-summary-stack">
            {props.loadError ? (
              <Alert
                showIcon
                type="error"
                message={props.t("飞书页.反馈.加载失败", { 错误: props.loadError })}
              />
            ) : null}
            {currentMode === "none" ? (
              <Alert showIcon type="info" message={props.t("飞书页.提示.空状态")} />
            ) : null}
            {developer?.authStatus === "pending" ? (
              <Alert showIcon type="info" message={props.t("飞书页.提示.等待授权回调")} />
            ) : null}
            {developer?.statusNotice ? (
              <Alert showIcon type="info" message={developer.statusNotice} />
            ) : null}
            {developer?.lastError ? (
              <Alert showIcon type="warning" message={developer.lastError} />
            ) : null}

            <div className="feishu-detail-pane-surface feishu-detail-summary-panel">
              <Descriptions
                size="small"
                column={2}
                className="feishu-detail-descriptions"
              >
                <Descriptions.Item label={props.t("飞书页.字段.授权状态")}>
                  {renderConfigAuthStatusTag(props.t, props.state, selectedMode)}
                </Descriptions.Item>
                <Descriptions.Item label={props.t("飞书页.字段.当前模式")}>
                  {renderModeTag(props.t, selectedMode)}
                </Descriptions.Item>
                {selectedMode === "developer" ? (
                  <>
                    <Descriptions.Item label={props.t("飞书页.字段.AppId")}>
                      {developer?.appId || "-"}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.列.MCP")}>
                      {renderMcpStatus(props.t, props.state, selectedMode)}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.字段.Token续期")}>
                      {developer?.hasRefreshToken
                        ? props.t("飞书页.值.自动续期已开启")
                        : props.t("飞书页.值.仅当前Token")}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.字段.自动续期任务")}>
                      {renderAutoRefreshTaskTag(props.t, props.state)}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.字段.回调地址")} span={2}>
                      <Paragraph
                        className="feishu-detail-summary-value"
                        copyable={redirectUri ? { text: redirectUri } : false}
                      >
                        {redirectUri || "-"}
                      </Paragraph>
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.字段.AccessToken到期")}>
                      {formatTimestamp(developer?.accessTokenExpiresAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.字段.RefreshToken到期")}>
                      {formatTimestamp(developer?.refreshTokenExpiresAt)}
                    </Descriptions.Item>
                  </>
                ) : (
                  <>
                    <Descriptions.Item label={props.t("飞书页.字段.保存时间")}>
                      {formatTimestamp(props.state?.personal?.savedAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.列.MCP")}>
                      {renderMcpStatus(props.t, props.state, selectedMode)}
                    </Descriptions.Item>
                    <Descriptions.Item label={props.t("飞书页.字段.预计失效时间")}>
                      {formatTimestamp(props.state?.personal?.estimatedExpiresAt)}
                    </Descriptions.Item>
                  </>
                )}
              </Descriptions>

              {selectedMode === "developer" ? (
                <div className="feishu-detail-side-actions">
                  <Button
                    type="primary"
                    loading={props.authorizing}
                    disabled={!developer?.appId || !developer?.hasAppSecret}
                    onClick={props.onAuthorizeDeveloper}
                  >
                    {props.t("飞书页.按钮.发起授权")}
                  </Button>
                  <Button
                    loading={props.refreshingToken}
                    disabled={developer?.authStatus !== "authorized" || !developer?.hasRefreshToken}
                    onClick={props.onRefreshDeveloperToken}
                  >
                    {props.t("飞书页.按钮.立即刷新Token")}
                  </Button>
                </div>
              ) : null}
            </div>

            {selectedMode === "personal" ? (
              <>
                <Alert
                  showIcon
                  type="info"
                  message={props.t("飞书页.提示.个人模式说明")}
                />
                <section className="feishu-detail-pane-surface feishu-detail-meta-panel">
                  <div className="feishu-detail-meta-head">
                    <Text strong>{props.t("飞书页.字段.已发现工具")}</Text>
                    <Text type="secondary">{personalToolItems.length}</Text>
                  </div>
                  {renderToolList(personalToolItems, props.t("飞书页.提示.暂无工具信息"))}
                </section>
              </>
            ) : (
              <>
                <Alert showIcon type="info" message={props.t("飞书页.提示.OAuth前置设置")} />

                <div className="feishu-detail-meta-grid">
                  <section className="feishu-detail-pane-surface feishu-detail-meta-panel">
                    <div className="feishu-detail-meta-head">
                      <Text strong>{props.t("飞书页.字段.授权Scope")}</Text>
                      <Space size={8}>
                        <Text type="secondary">{scopeCount}</Text>
                        <Paragraph
                          className="feishu-detail-inline-copy"
                          copyable={scopeCount > 0 ? { text: scopeJson } : false}
                        >
                          <span className="feishu-detail-inline-copy-trigger">
                            <CopyOutlined />
                            {props.t("飞书页.按钮.复制Scope")}
                          </span>
                        </Paragraph>
                      </Space>
                    </div>
                    <Paragraph className="feishu-detail-scope-copy">
                      {scopeCount > 0 ? scopeJson : "-"}
                    </Paragraph>
                  </section>

                  <section className="feishu-detail-pane-surface feishu-detail-meta-panel">
                    <div className="feishu-detail-meta-head">
                      <Text strong>{props.t("飞书页.字段.支持功能")}</Text>
                      <Text type="secondary">{toolItems.length}</Text>
                    </div>
                    {renderToolList(toolItems)}
                  </section>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </Card>
  )
}
