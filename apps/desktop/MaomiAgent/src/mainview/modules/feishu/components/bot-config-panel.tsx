import { ReloadOutlined } from "@ant-design/icons"
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  Popconfirm,
  Select,
  Switch,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useMemo, useState } from "react"
import type { FeishuBotConfigInput, FeishuBotStateView } from "../../../../shared/desktop-feishu"
import type { DesktopWorkspaceItem as WorkspaceItem } from "../../../../shared/desktop-workspace"
import type { FeishuTranslate as Translate } from "../types"
import { RuntimeModelSelect } from "../../wechat/components/runtime-model-select"

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
  onSave: (input: FeishuBotConfigInput) => void
  onClear: () => void
  onRefresh: () => void
}

function formatTimestamp(value?: string): string {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-"
}

function resolveWorkspaceSwitchSummary(input: {
  allowWorkspaceSwitch?: boolean
  workspaceSwitchScope?: "all" | "restricted"
  allowedExecutionWorkspaceLabels?: string[]
}): string {
  if (!input.allowWorkspaceSwitch) {
    return "不允许切换"
  }

  if (input.workspaceSwitchScope === "restricted") {
    const labels = input.allowedExecutionWorkspaceLabels ?? []
    return labels.length > 0 ? `限制范围：${labels.join(", ")}` : "限制范围"
  }

  return "允许切换到全部普通工作区"
}

function resolveAllowedWorkspaceText(input: {
  allowWorkspaceSwitch?: boolean
  workspaceSwitchScope?: "all" | "restricted"
  allowedExecutionWorkspaceLabels?: string[]
}): string {
  if (!input.allowWorkspaceSwitch) {
    return "未开启"
  }

  if (input.workspaceSwitchScope === "restricted") {
    const labels = input.allowedExecutionWorkspaceLabels ?? []
    return labels.length > 0 ? labels.join(", ") : "未选择"
  }

  return "全部普通工作区"
}

function renderConnectionStatusTag(
  status: FeishuBotStateView["connectionStatus"] | undefined,
  t: Translate,
) {
  const resolved = status ?? "stopped"
  const color =
    resolved === "ready"
      ? "green"
      : resolved === "processing"
        ? "blue"
        : resolved === "error"
          ? "red"
          : "default"

  return <Tag bordered={false} color={color}>{t(`飞书页.机器人状态.${resolved}`)}</Tag>
}

function renderWebhookStatusTag(
  status: NonNullable<FeishuBotStateView["latestWebhook"]>["status"] | undefined,
  t: Translate,
) {
  const resolved = status ?? "ignored"
  const color =
    resolved === "processed"
      ? "green"
      : resolved === "queued" || resolved === "challenge"
        ? "blue"
        : resolved === "failed"
          ? "red"
          : "default"

  return <Tag bordered={false} color={color}>{t(`飞书页.机器人Webhook状态.${resolved}`)}</Tag>
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

  useEffect(() => {
    setAppId(props.botState?.appId ?? "")
    setAppSecret("")
    setVerificationToken("")
    setEncryptKey("")
    setAllowWorkspaceSwitch(props.botState?.allowWorkspaceSwitch === true)
    setAllowedExecutionWorkspaceIds(
      props.botState?.workspaceSwitchScope === "restricted"
        ? (props.botState.allowedExecutionWorkspaceIds ?? [])
        : [],
    )
    setSelectedChannelId(props.botState?.selectedChannelId)
    setSelectedModelId(props.botState?.selectedModelId)
  }, [props.botState])

  const workspaceOptions = useMemo(
    () => props.workspaces
      .map((item) => ({
        label: `${item.name} · ${item.workspaceId}`,
        value: item.workspaceId,
      })),
    [props.workspaces],
  )

  const workspaceLabelMap = useMemo(
    () => new Map(
      workspaceOptions.map((item) => [item.value, item.label]),
    ),
    [workspaceOptions],
  )

  const savedAllowedExecutionWorkspaceLabels = (props.botState?.allowedExecutionWorkspaceIds ?? [])
    .map((workspaceId) => workspaceLabelMap.get(workspaceId) ?? workspaceId)
  const savedWorkspaceSwitchSummary = resolveWorkspaceSwitchSummary({
    allowWorkspaceSwitch: props.botState?.allowWorkspaceSwitch,
    workspaceSwitchScope: props.botState?.workspaceSwitchScope,
    allowedExecutionWorkspaceLabels: savedAllowedExecutionWorkspaceLabels,
  })
  const savedAllowedWorkspaceText = resolveAllowedWorkspaceText({
    allowWorkspaceSwitch: props.botState?.allowWorkspaceSwitch,
    workspaceSwitchScope: props.botState?.workspaceSwitchScope,
    allowedExecutionWorkspaceLabels: savedAllowedExecutionWorkspaceLabels,
  })

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
                  props.onSave({
                    appId,
                    appSecret: appSecret || undefined,
                    verificationToken: verificationToken || undefined,
                    encryptKey: encryptKey || undefined,
                    allowWorkspaceSwitch,
                    workspaceSwitchScope:
                      allowWorkspaceSwitch && allowedExecutionWorkspaceIds.length > 0
                        ? "restricted"
                        : "all",
                    allowedExecutionWorkspaceIds: allowWorkspaceSwitch ? allowedExecutionWorkspaceIds : [],
                    selectedChannelId,
                    selectedModelId,
                  })
                }}
              >
                {props.t("飞书页.按钮.保存机器人配置")}
              </Button>
              <Popconfirm
                title={props.t("飞书页.提示.确认清除机器人配置")}
                okText={props.t("飞书页.按钮.清除机器人配置")}
                cancelText={props.t("设置页.按钮.取消")}
                onConfirm={props.onClear}
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
                <Text strong>{props.t("飞书页.列.接入信息")}</Text>
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

            <Descriptions size="small" column={2} className="feishu-bot-descriptions">
              <Descriptions.Item label={props.t("飞书页.页签.机器人")}>
                {props.botState?.enabled
                  ? <Tag bordered={false} color="green">{props.t("飞书页.状态.authorized")}</Tag>
                  : <Tag bordered={false}>{props.t("飞书页.值.机器人未配置")}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.连接状态")}>
                {renderConnectionStatusTag(props.botState?.connectionStatus, props.t)}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.AppId")}>
                {props.botState?.appId || "-"}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.Webhook状态")}>
                {props.botState?.latestWebhook
                  ? renderWebhookStatusTag(props.botState.latestWebhook.status, props.t)
                  : props.t("飞书页.值.未收到")}
              </Descriptions.Item>
              <Descriptions.Item label="默认工作区">
                用户主页工作区
              </Descriptions.Item>
              <Descriptions.Item label="工作区切换">
                {savedWorkspaceSwitchSummary}
              </Descriptions.Item>
              <Descriptions.Item label="允许范围">
                {savedAllowedWorkspaceText}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.模型渠道")}>
                {props.botState?.selectedChannelId ?? props.t("飞书页.值.未选择")}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.模型")}>
                {props.botState?.selectedModelId ?? props.t("飞书页.值.未选择")}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.Session映射")}>
                {props.botState?.sessionMappingCount ?? 0}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.已处理消息")}>
                {props.botState?.processedMessageCount ?? 0}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.最近Webhook")}>
                {formatTimestamp(props.botState?.latestWebhook?.receivedAt)}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.字段.最近处理")}>
                {formatTimestamp(props.botState?.latestProcessedMessage?.updatedAt)}
              </Descriptions.Item>
            </Descriptions>

            <div className="feishu-bot-status-grid">
              <div className="feishu-bot-status-block">
                <Text type="secondary">{props.t("飞书页.字段.Webhook状态")}</Text>
                <Paragraph className="feishu-bot-inline-value">
                  {props.botState?.latestWebhook?.detail || props.t("飞书页.值.未收到")}
                </Paragraph>
                <Text type="secondary">
                  {props.botState?.latestWebhook?.messageId
                    ? `Message ID: ${props.botState.latestWebhook.messageId}`
                    : props.t("飞书页.值.未收到")}
                </Text>
              </div>

              <div className="feishu-bot-status-block">
                <Text type="secondary">{props.t("飞书页.字段.最近处理")}</Text>
                <Paragraph className="feishu-bot-inline-value">
                  {props.botState?.latestProcessedMessage?.responsePreview || props.t("飞书页.值.未收到")}
                </Paragraph>
                <Text type="secondary">
                  {props.botState?.latestProcessedMessage?.queryPreview
                    ? `${props.t("飞书页.字段.最近处理")}: ${props.botState.latestProcessedMessage.queryPreview}`
                    : props.t("飞书页.值.未收到")}
                </Text>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Card>
  )
}
