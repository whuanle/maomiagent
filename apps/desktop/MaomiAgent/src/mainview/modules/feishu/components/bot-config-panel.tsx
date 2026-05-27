import { CopyOutlined, ReloadOutlined } from "@ant-design/icons"
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Input,
  Popconfirm,
  Select,
  Switch,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { FeishuBotConfigInput, FeishuBotStateView } from "../../../../shared/desktop-feishu"
import type { DesktopWorkspaceItem as WorkspaceItem } from "../../../../shared/desktop-workspace"
import { notifier } from "../../../lib/notifications"
import type { FeishuTranslate as Translate } from "../types"
import { RuntimeModelSelect } from "../../wechat/components/runtime-model-select"
import {
  buildFeishuBotConfigInput,
  createFeishuBotDraft,
  type FeishuBotDraft,
  resolveFeishuBotDraftAfterStateRefresh,
} from "./bot-config-draft"

const { Paragraph, Text } = Typography

type Props = {
  baseUrl: string
  t: Translate
  botState: FeishuBotStateView | null
  workspaces: WorkspaceItem[]
  loading: boolean
  loadError: string
  saving: boolean
  clearing: boolean
  onSave: (input: FeishuBotConfigInput) => Promise<FeishuBotStateView | null>
  onClear: () => Promise<FeishuBotStateView | null>
  onRefresh: () => void
}

function formatTimestamp(value?: string): string {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-"
}

function renderConnectionStatusTag(
  status: FeishuBotStateView["connectionStatus"] | undefined,
  t: Translate,
) {
  const resolved = status ?? "disconnected"
  const color =
    resolved === "connected"
      ? "green"
      : resolved === "connecting" || resolved === "processing"
        ? "blue"
        : resolved === "error"
          ? "red"
          : "default"

  return <Tag bordered={false} color={color}>{t(`飞书页.机器人状态.${resolved}`)}</Tag>
}

function renderProcessedConversationStatusTag(
  status: NonNullable<FeishuBotStateView["latestProcessedMessage"]>["status"],
  t: Translate,
) {
  const color =
    status === "completed"
      ? "green"
      : status === "pending"
        ? "blue"
        : status === "failed"
          ? "red"
          : "default"
  const label = status === "pending"
    ? t("飞书页.机器人.值.处理中")
    : status === "failed"
      ? t("飞书页.机器人事件状态.failed")
      : t("飞书页.机器人.值.已处理完成")

  return <Tag bordered={false} color={color}>{label}</Tag>
}
export function FeishuBotConfigPanel(props: Props) {
  const [appId, setAppId] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [verificationToken, setVerificationToken] = useState("")
  const [encryptKey, setEncryptKey] = useState("")
  const [allowWorkspaceSwitch, setAllowWorkspaceSwitch] = useState(false)
  const [allowedExecutionWorkspaceIds, setAllowedExecutionWorkspaceIds] = useState<string[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(undefined)
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined)
  const [draftDirty, setDraftDirty] = useState(false)

  const applyDraft = useCallback((nextDraft: FeishuBotDraft) => {
    setAppId(nextDraft.appId)
    setAppSecret(nextDraft.appSecret)
    setVerificationToken(nextDraft.verificationToken)
    setEncryptKey(nextDraft.encryptKey)
    setAllowWorkspaceSwitch(nextDraft.allowWorkspaceSwitch)
    setAllowedExecutionWorkspaceIds(nextDraft.allowedExecutionWorkspaceIds)
    setSelectedChannelId(nextDraft.selectedChannelId)
    setSelectedModelId(nextDraft.selectedModelId)
  }, [])

  const syncDraftFromState = useCallback((nextState: FeishuBotStateView | null) => {
    applyDraft(createFeishuBotDraft(nextState))
    setDraftDirty(false)
  }, [applyDraft])

  useEffect(() => {
    const currentDraft: FeishuBotDraft = {
      appId,
      appSecret,
      verificationToken,
      encryptKey,
      allowWorkspaceSwitch,
      allowedExecutionWorkspaceIds,
      selectedChannelId,
      selectedModelId,
    }
    const result = resolveFeishuBotDraftAfterStateRefresh({
      currentDraft,
      botState: props.botState,
      draftDirty,
    })

    if (!result.shouldApply) {
      return
    }

    applyDraft(result.draft)
    setDraftDirty(result.draftDirty)
  }, [
    allowWorkspaceSwitch,
    allowedExecutionWorkspaceIds,
    appId,
    appSecret,
    applyDraft,
    draftDirty,
    encryptKey,
    props.botState,
    selectedChannelId,
    selectedModelId,
    verificationToken,
  ])

  const handleSave = useCallback(async () => {
    const nextState = await props.onSave(buildFeishuBotConfigInput({
      appId,
      appSecret,
      verificationToken,
      encryptKey,
      allowWorkspaceSwitch,
      allowedExecutionWorkspaceIds,
      selectedChannelId,
      selectedModelId,
    }))
    if (nextState) {
      syncDraftFromState(nextState)
    }
  }, [
    allowedExecutionWorkspaceIds,
    allowWorkspaceSwitch,
    appId,
    appSecret,
    encryptKey,
    props.onSave,
    selectedChannelId,
    selectedModelId,
    syncDraftFromState,
    verificationToken,
  ])

  const handleClear = useCallback(async () => {
    const nextState = await props.onClear()
    if (nextState) {
      syncDraftFromState(nextState)
    }
  }, [props.onClear, syncDraftFromState])

  const workspaceOptions = useMemo(
    () => props.workspaces
      .map((item) => ({
        label: `${item.name} · ${item.workspaceId}`,
        value: item.workspaceId,
      })),
    [props.workspaces],
  )
  const processedConversationItems = useMemo(
    () => props.botState?.recentProcessedMessages ?? [],
    [props.botState?.recentProcessedMessages],
  )
  const botTenantScopes = useMemo(() => (
    [...new Set(
      (props.botState?.tenantCapabilities?.tenantScopes ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
    )]
  ), [props.botState?.tenantCapabilities?.tenantScopes])
  const botScopeJson = useMemo(() => (
    JSON.stringify({
      scopes: {
        tenant: botTenantScopes,
      },
    }, null, 2)
  ), [botTenantScopes])

  const handleCopyBotScopes = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      notifier.warning(props.t("飞书页.智能助手.反馈.当前环境不支持复制JSON"))
      return
    }

    await navigator.clipboard.writeText(botScopeJson).catch(() => undefined)
    notifier.success("飞书机器人 tenant 权限 JSON 已复制")
  }, [botScopeJson, props.t])

  return (
    <Card className="panel-card feishu-bot-card" bordered>
      <div className="feishu-bot-layout">
        <section className="feishu-bot-input-pane">
          <div className="feishu-bot-surface feishu-bot-editor-panel is-plain">
            <div className="feishu-bot-section-head">
              <Text strong>{props.t("飞书页.页签.机器人")}</Text>
            </div>

            <div className="feishu-bot-field-grid">
              <label className="feishu-bot-field is-span-2">
                <Text type="secondary">{props.t("飞书页.字段.AppId")}</Text>
                <Input
                  size="large"
                  value={appId}
                  placeholder={props.t("飞书页.字段.AppId占位")}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraftDirty(true)
                    setAppId(event.target.value)
                  }}
                />
              </label>

              <label className="feishu-bot-field is-span-2">
                <Text type="secondary">{props.t("飞书页.字段.AppSecret")}</Text>
                <Input.Password
                  size="large"
                  value={appSecret}
                  placeholder={
                    props.botState?.hasAppSecret
                      ? props.t("飞书页.字段.AppSecret已保存占位")
                      : props.t("飞书页.字段.AppSecret占位")
                  }
                  onChange={(event) => {
                    setDraftDirty(true)
                    setAppSecret(event.target.value)
                  }}
                />
              </label>

              <label className="feishu-bot-field">
                <Text type="secondary">{props.t("飞书页.字段.VerificationToken")}</Text>
                <Input
                  size="large"
                  value={verificationToken}
                  placeholder={props.t("飞书页.字段.VerificationToken占位")}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraftDirty(true)
                    setVerificationToken(event.target.value)
                  }}
                />
              </label>

              <label className="feishu-bot-field">
                <Text type="secondary">{props.t("飞书页.字段.EncryptKey")}</Text>
                <Input.Password
                  size="large"
                  value={encryptKey}
                  placeholder={props.t("飞书页.字段.EncryptKey占位")}
                  onChange={(event) => {
                    setDraftDirty(true)
                    setEncryptKey(event.target.value)
                  }}
                />
              </label>

              <div className="feishu-bot-field-section is-span-2">
                <Divider className="feishu-bot-field-section-divider" />
                <div className="feishu-bot-field-section-head">
                  <Text strong className="feishu-bot-field-section-title">工作区</Text>
                  <Text type="secondary" className="feishu-bot-field-section-copy">
                    飞书用户默认固定使用自己的外部渠道工作区。允许切换后，也只能切到普通工作区，不能切到其他飞书或微信用户的工作区。
                  </Text>
                </div>
              </div>

              <div className="feishu-bot-field">
                <Text type="secondary">允许切换工作区</Text>
                <Switch
                  className="feishu-bot-workspace-switch"
                  checked={allowWorkspaceSwitch}
                  onChange={(checked) => {
                    setDraftDirty(true)
                    setAllowWorkspaceSwitch(checked)
                  }}
                />
              </div>

              <label className="feishu-bot-field">
                <Text type="secondary">切换范围</Text>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  size="large"
                  value={allowedExecutionWorkspaceIds}
                  disabled={!allowWorkspaceSwitch}
                  placeholder={allowWorkspaceSwitch ? "留空表示全部普通工作区" : "开启工作区切换后可设置"}
                  optionFilterProp="label"
                  options={workspaceOptions}
                  onChange={(value) => {
                    setDraftDirty(true)
                    setAllowedExecutionWorkspaceIds(value)
                  }}
                />
              </label>

              <div className="feishu-bot-field-section is-span-2">
                <Divider className="feishu-bot-field-section-divider" />
                <div className="feishu-bot-field-section-head">
                  <Text strong className="feishu-bot-field-section-title">模型</Text>
                </div>
              </div>

              <label className="feishu-bot-field is-span-2">
                <Text type="secondary">{props.t("飞书页.字段.模型")}</Text>
                <RuntimeModelSelect
                  allowClear
                  showSearch
                  selectedChannelId={selectedChannelId}
                  selectedModelId={selectedModelId}
                  placeholder={props.t("飞书页.值.未选择")}
                  notFoundContent="暂无可用模型"
                  onChange={(patch) => {
                    setDraftDirty(true)
                    setSelectedChannelId(patch.selectedChannelId)
                    setSelectedModelId(patch.selectedModelId)
                  }}
                />
              </label>
            </div>

            <Divider className="feishu-bot-panel-divider" />

            <div className="feishu-bot-actions">
              <Button
                type="primary"
                size="large"
                autoInsertSpace={false}
                loading={props.saving}
                className="feishu-bot-primary-action"
                onClick={() => {
                  void handleSave()
                }}
              >
                {props.t("飞书页.按钮.保存机器人配置")}
              </Button>
              <Popconfirm
                title={props.t("飞书页.提示.确认清除机器人配置")}
                okText={props.t("飞书页.按钮.清除机器人配置")}
                cancelText={props.t("设置页.按钮.取消")}
                onConfirm={() => handleClear()}
              >
                <Button
                  type="text"
                  danger
                  autoInsertSpace={false}
                  loading={props.clearing}
                  className="feishu-bot-secondary-action"
                >
                  {props.t("飞书页.按钮.清除机器人配置")}
                </Button>
              </Popconfirm>
            </div>

            <Divider className="feishu-bot-panel-divider" />

            <div className="feishu-bot-scope-box">
              <div className="feishu-bot-scope-head">
                <Text type="secondary">{props.t("飞书页.智能助手.字段.权限JSON")}</Text>
                <Button
                  size="small"
                  className="feishu-bot-scope-copy"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void handleCopyBotScopes()
                  }}
                >
                  {props.t("飞书页.智能助手.按钮.复制JSON")}
                </Button>
              </div>
              <Input.TextArea
                readOnly
                autoSize={false}
                className="feishu-bot-scope-json"
                value={botScopeJson}
                spellCheck={false}
              />
            </div>
          </div>
        </section>

        <section className="feishu-bot-status-pane">
          <div className="feishu-bot-surface feishu-bot-status-panel is-plain">
            {props.loadError ? (
              <Alert showIcon type="error" message={props.t("飞书页.反馈.加载失败", { 错误: props.loadError })} />
            ) : null}
            {props.botState?.lastError ? (
              <Alert showIcon type="warning" message={props.botState.lastError} />
            ) : null}

            <div className="feishu-bot-section-head is-split">
              <div className="feishu-bot-section-copy">
                <Text strong>{props.t("飞书页.字段.连接状态")}</Text>
              </div>

              <Button
                type="text"
                icon={<ReloadOutlined />}
                className="feishu-bot-inline-action"
                loading={props.loading}
                onClick={props.onRefresh}
              >
                {props.t("飞书页.按钮.刷新")}
              </Button>
            </div>

            <div className="feishu-bot-connection-row">
              <div className="feishu-bot-connection-copy">
                <Text type="secondary">WebSocket</Text>
                <Text>{props.botState?.enabled ? props.botState.appId || props.t("飞书页.页签.机器人") : props.t("飞书页.值.机器人未配置")}</Text>
              </div>
              <div className="feishu-bot-connection-status">
                {renderConnectionStatusTag(props.botState?.connectionStatus, props.t)}
              </div>
            </div>

            <Divider className="feishu-bot-panel-divider" />

            <div className="feishu-bot-section-head">
              <Text strong>{props.t("飞书页.字段.处理对话")}</Text>
            </div>

            {processedConversationItems.length > 0
              ? (
                <div className="feishu-bot-conversation-list">
                  {processedConversationItems.map((item) => (
                    <div key={item.messageId} className="feishu-bot-conversation-item">
                      <div className="feishu-bot-conversation-head">
                        <div className="feishu-bot-conversation-copy">
                          <Text strong>{item.queryPreview || item.messageId}</Text>
                          <Text type="secondary">{formatTimestamp(item.updatedAt)}</Text>
                        </div>
                        {renderProcessedConversationStatusTag(item.status, props.t)}
                      </div>
                      <Paragraph className="feishu-bot-inline-value">
                        {item.responsePreview
                          || (item.status === "pending"
                            ? props.t("飞书页.机器人.值.处理中")
                            : item.status === "failed"
                              ? props.t("飞书页.机器人事件状态.failed")
                              : props.t("飞书页.机器人.值.已处理完成"))}
                      </Paragraph>
                    </div>
                  ))}
                </div>
              )
              : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  className="feishu-bot-conversation-empty"
                  description={props.t("飞书页.值.暂无处理对话")}
                />
              )}
          </div>
        </section>
      </div>
    </Card>
  )
}
