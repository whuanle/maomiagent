import {
  CopyOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  SyncOutlined,
} from "@ant-design/icons"
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "antd"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ColumnsType } from "antd/es/table"
import type {
  FeishuDocTreeRoot,
  FeishuSmartAssistantActionView,
  FeishuSmartAssistantConnectionProfileView,
  FeishuSmartAssistantContextTemplateView,
  FeishuSmartAssistantDomainMountStrategy,
  FeishuSmartAssistantDomainView,
  FeishuSmartAssistantContextKind,
  FeishuSmartAssistantRuntimePolicyView,
  FeishuStateView,
  FeishuUserIdType,
} from "../../../../shared/desktop-feishu"
import type { DesktopWorkspaceItem as WorkspaceItem } from "../../../../shared/desktop-workspace"
import { executeFeishuSmartAssistantAction } from "../../../lib/feishu"
import { notifier } from "../../../lib/notifications"
import { AppTableCard } from "../../../components/shared/AppTableCard"

const { Text } = Typography

type Props = {
  baseUrl: string
  state: FeishuStateView | null
  activeWorkspaceId: string
  workspaces: WorkspaceItem[]
  loadError: string
  assistantAppId: string
  assistantAppSecret: string
  assistantRedirectUri: string
  saving: boolean
  authorizing: boolean
  refreshingToken: boolean
  clearing: boolean
  canOpenDocsWorkspace: boolean
  onAssistantAppIdChange: (value: string) => void
  onAssistantAppSecretChange: (value: string) => void
  onAssistantRedirectUriChange: (value: string) => void
  onSave: () => void
  onAuthorize: () => void
  onRefreshToken: () => void
  onClear: () => void
  onRefresh: () => void
  onOpenDocsWorkspace: () => void
}

type SmartAssistantActionDraft = {
  actionId: string
  query: string
  docId: string
  text: string
  userId: string
  userIdType: FeishuUserIdType
  chatId: string
  messageId: string
  threadId: string
  replyInThread: boolean
  attendeeIdsText: string
  durationMinutes: number | null
  timezone: string
  calendarId: string
  startAt: string
  endAt: string
  baseToken: string
  tableId: string
  viewId: string
  recordId: string
  offset: number | null
  fieldsText: string
  title: string
  subject: string
  markdown: string
  root: FeishuDocTreeRoot
  pageToken: string
  pageSize: number | null
  limit: number | null
  fileTokensText: string
  folderToken: string
  fileToken: string
  localPath: string
  outputPath: string
  spreadsheetToken: string
  sheetId: string
  range: string
  valuesText: string
  fileExtension: "xlsx" | "csv"
  taskId: string
  tasklistId: string
  dueAt: string
  wikiNodeToken: string
  wikiNodeAction: "" | "create" | "move" | "rename"
  wikiNodeType: "" | "origin" | "shortcut"
  wikiObjType: "" | "doc" | "docx" | "sheet" | "mindnote" | "bitable" | "file" | "slides"
  originWikiNodeToken: string
  wikiSpaceId: string
  targetWikiNodeToken: string
  targetWikiSpaceId: string
  mailbox: string
  toText: string
  ccText: string
  bccText: string
  meetingId: string
  minuteToken: string
}

function renderLifecycleTag(value: "ready" | "planned") {
  return (
    <Tag color={value === "ready" ? "green" : "default"} variant="filled">
      {value === "ready" ? "已接入" : "规划中"}
    </Tag>
  )
}

function renderMountStrategyTag(value: FeishuSmartAssistantDomainMountStrategy) {
  if (value === "always_control_plane") {
    return <Tag color="blue" variant="filled">内置入口</Tag>
  }
  if (value === "lazy_mcp") {
    return <Tag color="geekblue" variant="filled">按需调用</Tag>
  }
  return <Tag variant="filled">直连动作</Tag>
}

function renderTransportTag(
  value: FeishuSmartAssistantActionView["transport"] | FeishuSmartAssistantDomainView["transport"],
) {
  if (value === "control_plane") {
    return <Tag color="cyan" variant="filled">控制面 MCP</Tag>
  }
  if (value === "remote_mcp") {
    return <Tag color="blue" variant="filled">Remote MCP</Tag>
  }
  if (value === "builtin_runtime") {
    return <Tag color="purple" variant="filled">Runtime</Tag>
  }
  return <Tag variant="filled">OpenAPI / SDK</Tag>
}

function renderCredentialTag(value: FeishuSmartAssistantDomainView["credentialKind"]) {
  if (value === "user_access_token") {
    return <Tag color="green" variant="filled">UAT</Tag>
  }
  if (value === "tenant_access_token") {
    return <Tag color="gold" variant="filled">TAT</Tag>
  }
  if (value === "app_access_token") {
    return <Tag color="orange" variant="filled">App</Tag>
  }
  return <Tag variant="filled">Mixed</Tag>
}

function renderConnectionKindTag(_value: FeishuSmartAssistantConnectionProfileView["kind"]) {
  return <Tag color="green" variant="filled">智能助手 OAuth</Tag>
}

function renderContextKindTag(value: FeishuSmartAssistantContextKind) {
  if (value === "workspace") {
    return <Tag color="geekblue" variant="filled">资料上下文</Tag>
  }
  if (value === "resource_anchor") {
    return <Tag color="cyan" variant="filled">资源锚点</Tag>
  }
  if (value === "session_anchor") {
    return <Tag color="purple" variant="filled">会话锚点</Tag>
  }
  return <Tag variant="filled">查询型</Tag>
}

function renderConnectionModeTag(value: FeishuSmartAssistantConnectionProfileView["authMode"]) {
  return value === "url_only"
    ? <Tag color="blue" variant="filled">地址接入</Tag>
    : <Tag color="green" variant="filled">OAuth</Tag>
}

function renderRiskTag(value: FeishuSmartAssistantActionView["riskLevel"]) {
  if (value === "high") {
    return <Tag color="red" variant="filled">高风险</Tag>
  }
  if (value === "medium") {
    return <Tag color="orange" variant="filled">中风险</Tag>
  }
  return <Tag color="default" variant="filled">低风险</Tag>
}

function renderAuthStatusTag(state: FeishuStateView["smartAssistant"]) {
  const status = state.authStatus
  if (status === "authorized") {
    return <Tag color="green" variant="filled">已授权</Tag>
  }
  if (status === "pending") {
    return <Tag color="blue" variant="filled">等待授权</Tag>
  }
  if (status === "expired") {
    return <Tag color="orange" variant="filled">已过期</Tag>
  }
  if (status === "error") {
    return <Tag color="red" variant="filled">异常</Tag>
  }
  return <Tag variant="filled">未配置</Tag>
}

function formatAssistantTimestamp(value?: string): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function renderAutoRefreshTaskTag(task: FeishuStateView["smartAssistant"]["autoRefreshTask"]) {
  if (!task?.taskId) {
    return <Tag variant="filled">未创建</Tag>
  }
  if (task.enabled === false) {
    return <Tag color="orange" variant="filled">已停用</Tag>
  }
  if (task.status === "running") {
    return <Tag color="blue" variant="filled">执行中</Tag>
  }
  if (task.status === "queued") {
    return <Tag color="blue" variant="filled">待执行</Tag>
  }
  if (task.status === "failed" || task.status === "cancelled") {
    return <Tag color="red" variant="filled">异常</Tag>
  }
  return <Tag color="green" variant="filled">已启用</Tag>
}

function resolveAutoRefreshTaskSummary(state?: FeishuStateView["smartAssistant"] | null): string {
  if (!state?.appId) {
    return "保存配置并完成授权后自动创建"
  }
  if (!state.hasRefreshToken) {
    return "当前没有 refresh_token，暂不能自动续期"
  }
  if (!state.autoRefreshTask.taskId) {
    return "授权成功后自动创建"
  }
  if (state.autoRefreshTask.enabled === false) {
    return "任务存在但当前已停用"
  }

  const nextRunText = formatAssistantTimestamp(state.autoRefreshTask.nextRunAt)
  return nextRunText
    ? `每 60 分钟自动刷新一次，下次执行 ${nextRunText}`
    : "每 60 分钟自动刷新一次"
}

function createActionDraft(action?: FeishuSmartAssistantActionView | null): SmartAssistantActionDraft {
  if (action?.actionId === "docs.update") {
    return {
      actionId: action.actionId,
      query: "",
      docId: "",
      text: "",
      userId: "",
      userIdType: "open_id",
      chatId: "",
      messageId: "",
      threadId: "",
      replyInThread: false,
      attendeeIdsText: "",
      durationMinutes: 60,
      timezone: "",
      calendarId: "",
      startAt: "",
      endAt: "",
      baseToken: "",
      tableId: "",
      viewId: "",
      recordId: "",
      offset: 0,
      fieldsText: "",
      title: "",
      subject: "",
      markdown: "# 标题\n\n",
      root: "my_library",
      pageToken: "",
      pageSize: 20,
      limit: 10,
      fileTokensText: "",
      folderToken: "",
      fileToken: "",
      localPath: "",
      outputPath: "",
      spreadsheetToken: "",
      sheetId: "",
      range: "",
      valuesText: "",
      fileExtension: "xlsx",
      taskId: "",
      tasklistId: "",
      dueAt: "",
      wikiNodeToken: "",
      wikiNodeAction: "create",
      wikiNodeType: "",
      wikiObjType: "",
      originWikiNodeToken: "",
      wikiSpaceId: "",
      targetWikiNodeToken: "",
      targetWikiSpaceId: "",
      mailbox: "me",
      toText: "",
      ccText: "",
      bccText: "",
      meetingId: "",
      minuteToken: "",
    }
  }

  return {
    actionId: action?.actionId ?? "",
    query: "",
    docId: "",
    text: "",
    userId: "",
    userIdType: "open_id",
    chatId: "",
    messageId: "",
    threadId: "",
    replyInThread: false,
    attendeeIdsText: "",
    durationMinutes: 60,
    timezone: "",
    calendarId: "",
    startAt: "",
    endAt: "",
    baseToken: "",
    tableId: "",
    viewId: "",
    recordId: "",
    offset: 0,
    fieldsText: "",
    title: "",
    subject: "",
    markdown: "",
    root: "my_library",
    pageToken: "",
    pageSize: 20,
    limit: 10,
    fileTokensText: "",
    folderToken: "",
    fileToken: "",
    localPath: "",
    outputPath: "",
    spreadsheetToken: "",
    sheetId: "",
    range: "",
    valuesText: "",
    fileExtension: "xlsx",
    taskId: "",
    tasklistId: "",
    dueAt: "",
    wikiNodeToken: "",
    wikiNodeAction: "create",
    wikiNodeType: "",
    wikiObjType: "",
    originWikiNodeToken: "",
    wikiSpaceId: "",
    targetWikiNodeToken: "",
    targetWikiSpaceId: "",
    mailbox: "me",
    toText: "",
    ccText: "",
    bccText: "",
    meetingId: "",
    minuteToken: "",
  }
}

function splitLineOrCommaText(value: string): string[] {
  return value
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseOptionalJsonRecord(value: string, fieldName: string): Record<string, unknown> | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    throw new Error(`${fieldName} 需要填写合法的 JSON 对象`)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是 JSON 对象`)
  }

  return parsed as Record<string, unknown>
}

function parseOptionalJsonMatrix(value: string, fieldName: string): unknown[][] | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    throw new Error(`${fieldName} 需要填写合法的 JSON 数组`)
  }

  if (!Array.isArray(parsed) || parsed.some((item) => !Array.isArray(item))) {
    throw new Error(`${fieldName} 必须是二维 JSON 数组`)
  }

  return parsed as unknown[][]
}

const POLICY_COLUMNS: ColumnsType<FeishuSmartAssistantRuntimePolicyView> = [
  {
    title: "策略层",
    dataIndex: "title",
    key: "title",
    width: 180,
    render: (_value: string, item) => <Text strong>{item.title}</Text>,
  },
  {
    title: "当前方案",
    dataIndex: "decision",
    key: "decision",
    width: 220,
  },
  {
    title: "状态",
    dataIndex: "status",
    key: "status",
    width: 110,
    render: (value: FeishuSmartAssistantRuntimePolicyView["status"]) => renderLifecycleTag(value),
  },
  {
    title: "说明",
    dataIndex: "summary",
    key: "summary",
    width: 320,
  },
]

export function FeishuSmartAssistantPanel(props: Props) {
  const assistant = props.state?.smartAssistant
  const domains = assistant?.domains ?? []
  const actions = assistant?.actions ?? []
  const connectionProfiles = assistant?.connectionProfiles ?? []
  const domainModels = assistant?.domainModels ?? []
  const contextTemplates = assistant?.contextTemplates ?? []
  const policyItems = assistant?.policyItems ?? []
  const domainModelMap = useMemo(
    () => new Map(domainModels.map((item) => [item.domain, item])),
    [domainModels],
  )
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [actionDraft, setActionDraft] = useState<SmartAssistantActionDraft>(createActionDraft())
  const [executingActionId, setExecutingActionId] = useState("")
  const [pendingConfirmationActionId, setPendingConfirmationActionId] = useState("")
  const [actionExecutionError, setActionExecutionError] = useState("")
  const [actionExecutionResult, setActionExecutionResult] = useState("")
  const lastStatusNoticeRef = useRef("")
  const lastErrorNoticeRef = useRef("")
  const assistantScopes = useMemo(() => {
    const preferredScopes = props.state?.catalog.developerScopes?.length
      ? props.state.catalog.developerScopes
      : assistant?.scopes?.length
        ? assistant.scopes
        : props.state?.developer?.scopes ?? []

    return [...new Set(
      preferredScopes
      .map((item) => item.trim())
      .filter(Boolean)
    )]
  }, [assistant?.scopes, props.state?.catalog.developerScopes, props.state?.developer?.scopes])
  const assistantTenantScopes = useMemo(() => (
    [...new Set(
      (props.state?.catalog.developerTenantScopes ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
    )]
  ), [props.state?.catalog.developerTenantScopes])
  const assistantScopeJson = useMemo(() => {
    return JSON.stringify({
      scopes: {
        tenant: assistantTenantScopes,
        user: assistantScopes,
      },
    }, null, 2)
  }, [assistantScopes, assistantTenantScopes])

  useEffect(() => {
    const statusNotice = assistant?.statusNotice?.trim() ?? ""
    if (!statusNotice) {
      lastStatusNoticeRef.current = ""
      return
    }
    if (lastStatusNoticeRef.current === statusNotice) {
      return
    }

    lastStatusNoticeRef.current = statusNotice
    notifier.info(statusNotice, 3600)
  }, [assistant?.statusNotice])

  useEffect(() => {
    const lastError = assistant?.lastError?.trim() ?? ""
    if (!lastError) {
      lastErrorNoticeRef.current = ""
      return
    }
    if (lastErrorNoticeRef.current === lastError) {
      return
    }

    lastErrorNoticeRef.current = lastError
    notifier.warning(lastError, 4200)
  }, [assistant?.lastError])

  const handleCopyAssistantScopes = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      notifier.warning("当前环境不支持复制 JSON。")
      return
    }

    await navigator.clipboard.writeText(assistantScopeJson).catch(() => undefined)
    notifier.success("飞书权限 JSON 已复制")
  }, [assistantScopeJson])

  const currentAction = actions.find((item) => item.actionId === actionDraft.actionId) ?? null

  const openActionRunner = useCallback((action: FeishuSmartAssistantActionView) => {
    setActionDraft(createActionDraft(action))
    setPendingConfirmationActionId("")
    setActionExecutionError("")
    setActionExecutionResult("")
    setActionModalOpen(true)
  }, [])

  const executeCurrentAction = useCallback(async (confirmed = false) => {
    if (!props.baseUrl || !currentAction) {
      return
    }

    try {
      setExecutingActionId(currentAction.actionId)
      setPendingConfirmationActionId(confirmed ? currentAction.actionId : "")
      setActionExecutionError("")
      const fileTokens = splitLineOrCommaText(actionDraft.fileTokensText)
      const attendeeIds = splitLineOrCommaText(actionDraft.attendeeIdsText)
      const to = splitLineOrCommaText(actionDraft.toText)
      const cc = splitLineOrCommaText(actionDraft.ccText)
      const bcc = splitLineOrCommaText(actionDraft.bccText)
      const fields = parseOptionalJsonRecord(actionDraft.fieldsText, "记录字段")
      const values = parseOptionalJsonMatrix(actionDraft.valuesText, "追加行数据")
      const result = await executeFeishuSmartAssistantAction(props.baseUrl, {
        actionId: currentAction.actionId,
        confirm: confirmed ? true : undefined,
        query: actionDraft.query.trim() || undefined,
        docId: actionDraft.docId.trim() || undefined,
        text: actionDraft.text.trim() || undefined,
        userId: actionDraft.userId.trim() || undefined,
        userIdType: actionDraft.userIdType,
        chatId: actionDraft.chatId.trim() || undefined,
        messageId: actionDraft.messageId.trim() || undefined,
        threadId: actionDraft.threadId.trim() || undefined,
        replyInThread: actionDraft.replyInThread || undefined,
        attendeeIds: attendeeIds.length > 0 ? attendeeIds : undefined,
        durationMinutes: actionDraft.durationMinutes ?? undefined,
        timezone: actionDraft.timezone.trim() || undefined,
        calendarId: actionDraft.calendarId.trim() || undefined,
        startAt: actionDraft.startAt.trim() || undefined,
        endAt: actionDraft.endAt.trim() || undefined,
        baseToken: actionDraft.baseToken.trim() || undefined,
        tableId: actionDraft.tableId.trim() || undefined,
        viewId: actionDraft.viewId.trim() || undefined,
        recordId: actionDraft.recordId.trim() || undefined,
        offset: actionDraft.offset ?? undefined,
        fields,
        title: actionDraft.title.trim() || undefined,
        subject: actionDraft.subject.trim() || undefined,
        markdown: actionDraft.markdown.trim() || undefined,
        root: actionDraft.root,
        pageToken: actionDraft.pageToken.trim() || undefined,
        pageSize: actionDraft.pageSize ?? undefined,
        limit: actionDraft.limit ?? undefined,
        fileTokens: fileTokens.length > 0 ? fileTokens : undefined,
        folderToken: actionDraft.folderToken.trim() || undefined,
        fileToken: actionDraft.fileToken.trim() || undefined,
        localPath: actionDraft.localPath.trim() || undefined,
        outputPath: actionDraft.outputPath.trim() || undefined,
        spreadsheetToken: actionDraft.spreadsheetToken.trim() || undefined,
        sheetId: actionDraft.sheetId.trim() || undefined,
        range: actionDraft.range.trim() || undefined,
        values,
        fileExtension: actionDraft.fileExtension,
        taskId: actionDraft.taskId.trim() || undefined,
        tasklistId: actionDraft.tasklistId.trim() || undefined,
        dueAt: actionDraft.dueAt.trim() || undefined,
        wikiNodeToken: actionDraft.wikiNodeToken.trim() || undefined,
        wikiNodeAction: actionDraft.wikiNodeAction || undefined,
        wikiNodeType: actionDraft.wikiNodeType || undefined,
        wikiObjType: actionDraft.wikiObjType || undefined,
        originWikiNodeToken: actionDraft.originWikiNodeToken.trim() || undefined,
        wikiSpaceId: actionDraft.wikiSpaceId.trim() || undefined,
        targetWikiNodeToken: actionDraft.targetWikiNodeToken.trim() || undefined,
        targetWikiSpaceId: actionDraft.targetWikiSpaceId.trim() || undefined,
        mailbox: actionDraft.mailbox.trim() || undefined,
        to: to.length > 0 ? to : undefined,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        meetingId: actionDraft.meetingId.trim() || undefined,
        minuteToken: actionDraft.minuteToken.trim() || undefined,
      })
      setActionExecutionResult(JSON.stringify(result, null, 2))
      setPendingConfirmationActionId(result.confirmationRequired ? currentAction.actionId : "")
      if (result.executed) {
        notifier.success(`动作 ${currentAction.title} 已执行`)
      } else if (result.confirmationRequired) {
        notifier.warning(`动作 ${currentAction.title} 需要确认后才能执行`)
      } else {
        notifier.info(`动作 ${currentAction.title} 未执行`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPendingConfirmationActionId("")
      setActionExecutionError(message)
      setActionExecutionResult("")
    } finally {
      setExecutingActionId("")
    }
  }, [actionDraft, currentAction, props.baseUrl])

  const renderTextInputField = (
    label: string,
    value: string,
    placeholder: string,
    onChange: (value: string) => void,
    span: 1 | 2 = 1,
  ) => (
    <div className={`feishu-assistant-access-field${span === 2 ? " feishu-assistant-modal-grid-span-2" : ""}`}>
      <Text type="secondary">{label}</Text>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )

  const renderTextAreaField = (
    label: string,
    value: string,
    placeholder: string,
    onChange: (value: string) => void,
    rows = 4,
    span: 1 | 2 = 1,
  ) => (
    <div className={`feishu-assistant-access-field${span === 2 ? " feishu-assistant-modal-grid-span-2" : ""}`}>
      <Text type="secondary">{label}</Text>
      <Input.TextArea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )

  const renderNumberField = (
    label: string,
    value: number | null,
    min: number,
    max: number,
    onChange: (value: number | null) => void,
    span: 1 | 2 = 1,
  ) => (
    <div className={`feishu-assistant-access-field${span === 2 ? " feishu-assistant-modal-grid-span-2" : ""}`}>
      <Text type="secondary">{label}</Text>
      <InputNumber
        min={min}
        max={max}
        value={value ?? undefined}
        className="feishu-assistant-number-input"
        onChange={(nextValue) => onChange(typeof nextValue === "number" ? nextValue : null)}
      />
    </div>
  )

  const renderSelectField = (
    label: string,
    value: string,
    options: Array<{ label: string; value: string }>,
    onChange: (value: string) => void,
    span: 1 | 2 = 1,
  ) => (
    <div className={`feishu-assistant-access-field${span === 2 ? " feishu-assistant-modal-grid-span-2" : ""}`}>
      <Text type="secondary">{label}</Text>
      <Select value={value} options={options} onChange={onChange} />
    </div>
  )

  const renderSwitchField = (
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    span: 1 | 2 = 1,
  ) => (
    <div className={`feishu-assistant-access-field${span === 2 ? " feishu-assistant-modal-grid-span-2" : ""}`}>
      <Text type="secondary">{label}</Text>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )

  const renderActionFields = () => {
    if (!currentAction) {
      return null
    }

    switch (currentAction.actionId) {
      case "docs.search":
        return (
          <>
            {renderTextInputField("关键词", actionDraft.query, "例如：项目周报", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderNumberField("返回条数", actionDraft.limit, 1, 50, (value) => {
              setActionDraft((previous) => ({ ...previous, limit: value }))
            })}
          </>
        )
      case "docs.list_nodes":
        return (
          <>
            {renderSelectField("根目录", actionDraft.root, [
              { label: "我的文档库", value: "my_library" },
              { label: "当前文档", value: "document" },
            ], (value) => {
              setActionDraft((previous) => ({
                ...previous,
                root: value as FeishuDocTreeRoot,
              }))
            })}
            {renderTextInputField("父文档 ID", actionDraft.docId, "可选，留空则从根节点开始", (value) => {
              setActionDraft((previous) => ({ ...previous, docId: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 200, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
          </>
        )
      case "docs.read":
        return renderTextInputField("文档 ID", actionDraft.docId, "输入要读取的 docId", (value) => {
          setActionDraft((previous) => ({ ...previous, docId: value }))
        }, 2)
      case "docs.fetch_media":
        return renderTextAreaField("文件 Token", actionDraft.fileTokensText, "每行一个 fileToken，或使用英文逗号分隔", (value) => {
          setActionDraft((previous) => ({ ...previous, fileTokensText: value }))
        }, 4, 2)
      case "docs.update":
        return (
          <>
            {renderTextInputField("文档 ID", actionDraft.docId, "输入要更新的 docId", (value) => {
              setActionDraft((previous) => ({ ...previous, docId: value }))
            })}
            {renderTextInputField("标题", actionDraft.title, "可选，留空时沿用远端标题", (value) => {
              setActionDraft((previous) => ({ ...previous, title: value }))
            })}
            {renderTextAreaField("Markdown", actionDraft.markdown, "输入回写到飞书的 Markdown 内容", (value) => {
              setActionDraft((previous) => ({ ...previous, markdown: value }))
            }, 10, 2)}
          </>
        )
      case "docs.create":
        return (
          <>
            {renderTextInputField("标题", actionDraft.title, "可选，留空时由飞书生成默认标题", (value) => {
              setActionDraft((previous) => ({ ...previous, title: value }))
            })}
            {renderTextInputField("父文件夹 Token", actionDraft.folderToken, "可选，Drive 文件夹 Token", (value) => {
              setActionDraft((previous) => ({ ...previous, folderToken: value }))
            })}
            {renderTextInputField("Wiki 节点 Token", actionDraft.wikiNodeToken, "可选，指定知识库父节点", (value) => {
              setActionDraft((previous) => ({ ...previous, wikiNodeToken: value }))
            })}
            {renderTextAreaField("Markdown", actionDraft.markdown, "输入新文档内容", (value) => {
              setActionDraft((previous) => ({ ...previous, markdown: value }))
            }, 10, 2)}
          </>
        )
      case "docs.comments.read":
        return (
          <>
            {renderTextInputField("文档 ID", actionDraft.docId, "输入要读取评论的 docId", (value) => {
              setActionDraft((previous) => ({ ...previous, docId: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 200, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            }, 2)}
          </>
        )
      case "docs.comments.add":
        return (
          <>
            {renderTextInputField("文档 ID", actionDraft.docId, "输入要评论的 docId", (value) => {
              setActionDraft((previous) => ({ ...previous, docId: value }))
            })}
            {renderTextAreaField("评论内容", actionDraft.text, "输入要写入的全文评论", (value) => {
              setActionDraft((previous) => ({ ...previous, text: value }))
            }, 6, 2)}
          </>
        )
      case "calendar.agenda":
        return (
          <>
            {renderTextInputField("日历 ID", actionDraft.calendarId, "留空默认主日历，可填 primary", (value) => {
              setActionDraft((previous) => ({ ...previous, calendarId: value }))
            })}
            {renderTextInputField("开始时间", actionDraft.startAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, startAt: value }))
            })}
            {renderTextInputField("结束时间", actionDraft.endAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, endAt: value }))
            })}
          </>
        )
      case "calendar.find_slot":
        return (
          <>
            {renderTextAreaField("参与人 ID", actionDraft.attendeeIdsText, "每行一个 ou_ / oc_，或使用英文逗号分隔", (value) => {
              setActionDraft((previous) => ({ ...previous, attendeeIdsText: value }))
            })}
            {renderNumberField("时长（分钟）", actionDraft.durationMinutes, 1, 1440, (value) => {
              setActionDraft((previous) => ({ ...previous, durationMinutes: value }))
            })}
            {renderTextInputField("时区", actionDraft.timezone, "可选，例如 Asia/Shanghai", (value) => {
              setActionDraft((previous) => ({ ...previous, timezone: value }))
            })}
            {renderTextInputField("开始时间", actionDraft.startAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, startAt: value }))
            })}
            {renderTextInputField("结束时间", actionDraft.endAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, endAt: value }))
            })}
          </>
        )
      case "calendar.create_event":
        return (
          <>
            {renderTextInputField("日历 ID", actionDraft.calendarId, "留空默认主日历，可填 primary", (value) => {
              setActionDraft((previous) => ({ ...previous, calendarId: value }))
            })}
            {renderTextInputField("标题", actionDraft.title, "例如：项目同步会", (value) => {
              setActionDraft((previous) => ({ ...previous, title: value }))
            })}
            {renderTextInputField("开始时间", actionDraft.startAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, startAt: value }))
            })}
            {renderTextInputField("结束时间", actionDraft.endAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, endAt: value }))
            })}
            {renderTextAreaField("参与人 ID", actionDraft.attendeeIdsText, "每行一个 ou_ / oc_ / omm_，或使用英文逗号分隔", (value) => {
              setActionDraft((previous) => ({ ...previous, attendeeIdsText: value }))
            }, 4, 2)}
            {renderTextAreaField("描述", actionDraft.markdown, "可选，当前会直接作为日程 description 提交", (value) => {
              setActionDraft((previous) => ({ ...previous, markdown: value }))
            }, 6, 2)}
          </>
        )
      case "messenger.search":
        return (
          <>
            {renderTextInputField("关键词", actionDraft.query, "可选，按消息内容检索", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderTextInputField("会话 Chat ID", actionDraft.chatId, "可选，限定某个群聊/会话", (value) => {
              setActionDraft((previous) => ({ ...previous, chatId: value }))
            })}
            {renderTextInputField("消息 ID", actionDraft.messageId, "可选，按消息锚点检索", (value) => {
              setActionDraft((previous) => ({ ...previous, messageId: value }))
            })}
            {renderTextInputField("线程 ID", actionDraft.threadId, "可选，限定线程", (value) => {
              setActionDraft((previous) => ({ ...previous, threadId: value }))
            })}
            {renderTextInputField("开始时间", actionDraft.startAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, startAt: value }))
            })}
            {renderTextInputField("结束时间", actionDraft.endAt, "YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, endAt: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 100, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
          </>
        )
      case "messenger.send":
        return (
          <>
            {renderTextInputField("Chat ID", actionDraft.chatId, "chat_id，可与用户 ID 二选一", (value) => {
              setActionDraft((previous) => ({ ...previous, chatId: value }))
            })}
            {renderTextInputField("用户 ID", actionDraft.userId, "open_id，可与 Chat ID 二选一", (value) => {
              setActionDraft((previous) => ({ ...previous, userId: value }))
            })}
            {renderTextAreaField("消息内容", actionDraft.text, "输入要发送的文本消息", (value) => {
              setActionDraft((previous) => ({ ...previous, text: value }))
            }, 6, 2)}
          </>
        )
      case "messenger.reply":
        return (
          <>
            {renderTextInputField("消息 ID", actionDraft.messageId, "输入要回复的消息 ID", (value) => {
              setActionDraft((previous) => ({ ...previous, messageId: value }))
            })}
            {renderSwitchField("在线程内回复", actionDraft.replyInThread, (checked) => {
              setActionDraft((previous) => ({ ...previous, replyInThread: checked }))
            })}
            {renderTextAreaField("回复内容", actionDraft.text, "输入要发送的回复文本", (value) => {
              setActionDraft((previous) => ({ ...previous, text: value }))
            }, 6, 2)}
          </>
        )
      case "drive.search":
        return (
          <>
            {renderTextInputField("关键词", actionDraft.query, "例如：合同模板", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 100, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            }, 2)}
          </>
        )
      case "drive.upload":
        return (
          <>
            {renderTextInputField("本地文件路径", actionDraft.localPath, "输入本机绝对路径", (value) => {
              setActionDraft((previous) => ({ ...previous, localPath: value }))
            }, 2)}
            {renderTextInputField("目标文件夹 Token", actionDraft.folderToken, "可选，Drive 文件夹 Token", (value) => {
              setActionDraft((previous) => ({ ...previous, folderToken: value }))
            })}
            {renderTextInputField("文件标题", actionDraft.title, "可选，留空沿用本地文件名", (value) => {
              setActionDraft((previous) => ({ ...previous, title: value }))
            })}
          </>
        )
      case "drive.download":
        return (
          <>
            {renderTextInputField("文件 Token", actionDraft.fileToken, "输入要下载的 fileToken", (value) => {
              setActionDraft((previous) => ({ ...previous, fileToken: value }))
            })}
            {renderTextInputField("输出路径", actionDraft.outputPath, "可选，留空则写入受控下载目录", (value) => {
              setActionDraft((previous) => ({ ...previous, outputPath: value }))
            }, 2)}
          </>
        )
      case "base.list_tables":
        return (
          <>
            {renderTextInputField("Base Token", actionDraft.baseToken, "输入 Base Token，例如 app_xxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, baseToken: value }))
            })}
            {renderNumberField("返回表数量", actionDraft.limit, 1, 100, (value) => {
              setActionDraft((previous) => ({ ...previous, limit: value }))
            })}
          </>
        )
      case "base.query_records":
        return (
          <>
            {renderTextInputField("Base Token", actionDraft.baseToken, "app_xxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, baseToken: value }))
            })}
            {renderTextInputField("Table ID", actionDraft.tableId, "tblxxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, tableId: value }))
            })}
            {renderTextInputField("View ID", actionDraft.viewId, "可选，vewxxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, viewId: value }))
            })}
            {renderNumberField("偏移量", actionDraft.offset, 0, 100000, (value) => {
              setActionDraft((previous) => ({ ...previous, offset: value }))
            })}
            {renderNumberField("返回条数", actionDraft.limit, 1, 200, (value) => {
              setActionDraft((previous) => ({ ...previous, limit: value }))
            })}
          </>
        )
      case "base.upsert_records":
        return (
          <>
            {renderTextInputField("Base Token", actionDraft.baseToken, "app_xxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, baseToken: value }))
            })}
            {renderTextInputField("Table ID", actionDraft.tableId, "tblxxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, tableId: value }))
            })}
            {renderTextInputField("Record ID", actionDraft.recordId, "可选，留空则创建新记录", (value) => {
              setActionDraft((previous) => ({ ...previous, recordId: value }))
            })}
            {renderTextAreaField("字段 JSON", actionDraft.fieldsText, "{\n  \"字段名\": \"值\"\n}", (value) => {
              setActionDraft((previous) => ({ ...previous, fieldsText: value }))
            }, 8, 2)}
          </>
        )
      case "sheets.read":
        return (
          <>
            {renderTextInputField("Spreadsheet Token", actionDraft.spreadsheetToken, "shtcnxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, spreadsheetToken: value }))
            })}
            {renderTextInputField("Sheet ID", actionDraft.sheetId, "可选，例如 sheet_1", (value) => {
              setActionDraft((previous) => ({ ...previous, sheetId: value }))
            })}
            {renderTextInputField("读取范围", actionDraft.range, "可选，例如 A1:D20", (value) => {
              setActionDraft((previous) => ({ ...previous, range: value }))
            }, 2)}
          </>
        )
      case "sheets.append_rows":
        return (
          <>
            {renderTextInputField("Spreadsheet Token", actionDraft.spreadsheetToken, "shtcnxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, spreadsheetToken: value }))
            })}
            {renderTextInputField("Sheet ID", actionDraft.sheetId, "可选，例如 sheet_1", (value) => {
              setActionDraft((previous) => ({ ...previous, sheetId: value }))
            })}
            {renderTextInputField("追加范围", actionDraft.range, "可选，例如 A1:D20", (value) => {
              setActionDraft((previous) => ({ ...previous, range: value }))
            }, 2)}
            {renderTextAreaField("行数据 JSON", actionDraft.valuesText, "[\n  [\"A列\", \"B列\"]\n]", (value) => {
              setActionDraft((previous) => ({ ...previous, valuesText: value }))
            }, 8, 2)}
          </>
        )
      case "sheets.export":
        return (
          <>
            {renderTextInputField("Spreadsheet Token", actionDraft.spreadsheetToken, "shtcnxxxxxxxx", (value) => {
              setActionDraft((previous) => ({ ...previous, spreadsheetToken: value }))
            })}
            {renderTextInputField("Sheet ID", actionDraft.sheetId, "可选，例如 sheet_1", (value) => {
              setActionDraft((previous) => ({ ...previous, sheetId: value }))
            })}
            {renderSelectField("导出格式", actionDraft.fileExtension, [
              { label: "xlsx", value: "xlsx" },
              { label: "csv", value: "csv" },
            ], (value) => {
              setActionDraft((previous) => ({
                ...previous,
                fileExtension: value as "xlsx" | "csv",
              }))
            })}
            {renderTextInputField("输出路径", actionDraft.outputPath, "可选，留空则保存在受控下载目录", (value) => {
              setActionDraft((previous) => ({ ...previous, outputPath: value }))
            })}
          </>
        )
      case "tasks.create":
        return (
          <>
            {renderTextInputField("标题", actionDraft.title, "例如：跟进客户回访", (value) => {
              setActionDraft((previous) => ({ ...previous, title: value }))
            })}
            {renderTextInputField("负责人用户 ID", actionDraft.userId, "可选，open_id", (value) => {
              setActionDraft((previous) => ({ ...previous, userId: value }))
            })}
            {renderTextInputField("任务清单 ID", actionDraft.tasklistId, "可选，tasklist token", (value) => {
              setActionDraft((previous) => ({ ...previous, tasklistId: value }))
            })}
            {renderTextInputField("截止时间", actionDraft.dueAt, "可选，YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, dueAt: value }))
            })}
            {renderTextAreaField("描述", actionDraft.markdown, "可选，任务描述或补充说明", (value) => {
              setActionDraft((previous) => ({ ...previous, markdown: value }))
            }, 8, 2)}
          </>
        )
      case "tasks.complete":
        return renderTextInputField("任务 ID", actionDraft.taskId, "输入要完成的 taskId", (value) => {
          setActionDraft((previous) => ({ ...previous, taskId: value }))
        }, 2)
      case "wiki.search":
        return (
          <>
            {renderTextInputField("关键词", actionDraft.query, "可选，按知识库标题或内容检索", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderTextInputField("Wiki 节点 Token", actionDraft.wikiNodeToken, "可选，直接读取指定节点", (value) => {
              setActionDraft((previous) => ({ ...previous, wikiNodeToken: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 100, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
          </>
        )
      case "wiki.manage_nodes":
        return (
          <>
            {renderSelectField("节点动作", actionDraft.wikiNodeAction, [
              { label: "创建", value: "create" },
              { label: "移动", value: "move" },
              { label: "重命名", value: "rename" },
            ], (value) => {
              setActionDraft((previous) => ({
                ...previous,
                wikiNodeAction: value as SmartAssistantActionDraft["wikiNodeAction"],
              }))
            })}
            {renderTextInputField("节点 Token", actionDraft.wikiNodeToken, "父节点或当前节点 token", (value) => {
              setActionDraft((previous) => ({ ...previous, wikiNodeToken: value }))
            })}
            {renderTextInputField("知识空间 ID", actionDraft.wikiSpaceId, "创建时可直接指定 spaceId", (value) => {
              setActionDraft((previous) => ({ ...previous, wikiSpaceId: value }))
            })}
            {renderTextInputField("目标节点 Token", actionDraft.targetWikiNodeToken, "移动时可选", (value) => {
              setActionDraft((previous) => ({ ...previous, targetWikiNodeToken: value }))
            })}
            {renderTextInputField("目标知识空间 ID", actionDraft.targetWikiSpaceId, "移动时可选", (value) => {
              setActionDraft((previous) => ({ ...previous, targetWikiSpaceId: value }))
            })}
            {renderTextInputField("标题", actionDraft.title, "创建或重命名时填写", (value) => {
              setActionDraft((previous) => ({ ...previous, title: value }))
            })}
            {renderSelectField("节点类型", actionDraft.wikiNodeType || "origin", [
              { label: "origin", value: "origin" },
              { label: "shortcut", value: "shortcut" },
            ], (value) => {
              setActionDraft((previous) => ({
                ...previous,
                wikiNodeType: value as SmartAssistantActionDraft["wikiNodeType"],
              }))
            })}
            {renderSelectField("对象类型", actionDraft.wikiObjType || "docx", [
              { label: "doc", value: "doc" },
              { label: "docx", value: "docx" },
              { label: "sheet", value: "sheet" },
              { label: "mindnote", value: "mindnote" },
              { label: "bitable", value: "bitable" },
              { label: "file", value: "file" },
              { label: "slides", value: "slides" },
            ], (value) => {
              setActionDraft((previous) => ({
                ...previous,
                wikiObjType: value as SmartAssistantActionDraft["wikiObjType"],
              }))
            })}
            {renderTextInputField("原始节点 Token", actionDraft.originWikiNodeToken, "创建 shortcut 时可选", (value) => {
              setActionDraft((previous) => ({ ...previous, originWikiNodeToken: value }))
            }, 2)}
          </>
        )
      case "contact.search_user":
        return (
          <>
            {renderTextInputField("关键词", actionDraft.query, "例如：张三 / 邮箱 / 手机号", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 200, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选，继续翻页时填写", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            }, 2)}
          </>
        )
      case "contact.get_profile":
        return (
          <>
            {renderTextInputField("用户 ID", actionDraft.userId, "可选，留空则读取当前授权用户", (value) => {
              setActionDraft((previous) => ({ ...previous, userId: value }))
            })}
            {renderSelectField("ID 类型", actionDraft.userIdType, [
              { label: "open_id", value: "open_id" },
              { label: "union_id", value: "union_id" },
              { label: "user_id", value: "user_id" },
            ], (value) => {
              setActionDraft((previous) => ({
                ...previous,
                userIdType: value as FeishuUserIdType,
              }))
            })}
          </>
        )
      case "mail.search":
        return (
          <>
            {renderTextInputField("邮箱标识", actionDraft.mailbox, "默认 me，也可填邮箱地址", (value) => {
              setActionDraft((previous) => ({ ...previous, mailbox: value }))
            })}
            {renderTextInputField("关键词", actionDraft.query, "可选，例如：付款提醒", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderTextInputField("开始时间", actionDraft.startAt, "可选，YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, startAt: value }))
            })}
            {renderTextInputField("结束时间", actionDraft.endAt, "可选，YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, endAt: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            })}
            {renderNumberField("返回条数", actionDraft.limit, 1, 50, (value) => {
              setActionDraft((previous) => ({ ...previous, limit: value }))
            })}
          </>
        )
      case "mail.send":
        return (
          <>
            {renderTextInputField("邮箱标识", actionDraft.mailbox, "默认 me，也可填邮箱地址", (value) => {
              setActionDraft((previous) => ({ ...previous, mailbox: value }))
            })}
            {renderTextInputField("邮件主题", actionDraft.subject, "输入邮件主题", (value) => {
              setActionDraft((previous) => ({ ...previous, subject: value }))
            })}
            {renderTextAreaField("To", actionDraft.toText, "每行一个邮箱地址，或使用英文逗号分隔", (value) => {
              setActionDraft((previous) => ({ ...previous, toText: value }))
            }, 4, 2)}
            {renderTextAreaField("Cc", actionDraft.ccText, "可选，每行一个邮箱地址，或使用英文逗号分隔", (value) => {
              setActionDraft((previous) => ({ ...previous, ccText: value }))
            }, 3, 2)}
            {renderTextAreaField("Bcc", actionDraft.bccText, "可选，每行一个邮箱地址，或使用英文逗号分隔", (value) => {
              setActionDraft((previous) => ({ ...previous, bccText: value }))
            }, 3, 2)}
            {renderTextAreaField("正文文本", actionDraft.text, "输入纯文本正文", (value) => {
              setActionDraft((previous) => ({ ...previous, text: value }))
            }, 6, 2)}
            {renderTextAreaField("Markdown 正文", actionDraft.markdown, "可选，不填则使用上面的纯文本正文", (value) => {
              setActionDraft((previous) => ({ ...previous, markdown: value }))
            }, 6, 2)}
          </>
        )
      case "meetings.search_records":
        return (
          <>
            {renderTextInputField("关键词", actionDraft.query, "可选，按会议标题或纪要内容检索", (value) => {
              setActionDraft((previous) => ({ ...previous, query: value }))
            })}
            {renderTextInputField("参与人用户 ID", actionDraft.userId, "可选，按参与人筛选", (value) => {
              setActionDraft((previous) => ({ ...previous, userId: value }))
            })}
            {renderTextInputField("开始时间", actionDraft.startAt, "可选，YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, startAt: value }))
            })}
            {renderTextInputField("结束时间", actionDraft.endAt, "可选，YYYY-MM-DD 或 ISO 8601", (value) => {
              setActionDraft((previous) => ({ ...previous, endAt: value }))
            })}
            {renderTextInputField("分页游标", actionDraft.pageToken, "可选", (value) => {
              setActionDraft((previous) => ({ ...previous, pageToken: value }))
            })}
            {renderNumberField("分页大小", actionDraft.pageSize, 1, 30, (value) => {
              setActionDraft((previous) => ({ ...previous, pageSize: value }))
            })}
          </>
        )
      case "meetings.read_minutes":
        return (
          <>
            {renderTextInputField("会议 ID", actionDraft.meetingId, "可选，传 meetingId 时会先补充纪要元数据", (value) => {
              setActionDraft((previous) => ({ ...previous, meetingId: value }))
            })}
            {renderTextInputField("Minute Token", actionDraft.minuteToken, "可选，与会议 ID 二选一", (value) => {
              setActionDraft((previous) => ({ ...previous, minuteToken: value }))
            })}
          </>
        )
      default:
        return (
          <Alert
            showIcon
            type="info"
            message={`当前动作 ${currentAction.actionId} 暂未补专用表单，可直接走对话调用或后续补参数面板。`}
          />
        )
    }
  }

  const domainColumns: ColumnsType<FeishuSmartAssistantDomainView> = [
    {
      title: "域能力",
      dataIndex: "title",
      key: "title",
      width: 240,
      render: (_value: string, item) => {
        const model = domainModelMap.get(item.key)
        const canEnterWorkbench = model?.workbenchKind === "docs_workspace"

        return (
          <div className="feishu-assistant-table-copy">
            <div className="feishu-assistant-table-title-row">
              <Text strong>{item.title}</Text>
              {canEnterWorkbench ? (
                <Button
                  type="link"
                  size="small"
                  className="feishu-assistant-table-enter-button"
                  icon={<FolderOpenOutlined />}
                  disabled={!props.canOpenDocsWorkspace}
                  onClick={props.onOpenDocsWorkspace}
                >
                  进入
                </Button>
              ) : null}
            </div>
            <Text type="secondary" className="feishu-assistant-table-copy-subtle">{item.key}</Text>
          </div>
        )
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (value: FeishuSmartAssistantDomainView["status"]) => renderLifecycleTag(value),
    },
    {
      title: "连接方式",
      key: "connections",
      width: 220,
      render: (_value, item) => {
        const model = domainModelMap.get(item.key)
        if (!model) {
          return <Text type="secondary">-</Text>
        }

        return (
          <Space size={6} wrap>
            {model.supportedConnectionKinds.map((connectionKind) => (
              <span key={`${item.key}:${connectionKind}`}>
                {renderConnectionKindTag(connectionKind)}
              </span>
            ))}
          </Space>
        )
      },
    },
    {
      title: "使用上下文",
      key: "association",
      width: 280,
      render: (_value, item) => {
        const model = domainModelMap.get(item.key)
        if (!model) {
          return <Text type="secondary">-</Text>
        }

        return (
          <div className="feishu-assistant-table-copy">
            <Space size={6} wrap>
              {renderContextKindTag(model.contextKind)}
            </Space>
            <Text type="secondary" className="feishu-assistant-table-copy-subtle">
              {model.associationLabel}
            </Text>
          </div>
        )
      },
    },
    {
      title: "执行入口",
      key: "entry",
      width: 220,
      render: (_value, item) => (
        <Space size={6} wrap>
          {renderMountStrategyTag(item.mountStrategy)}
          {renderTransportTag(item.transport)}
        </Space>
      ),
    },
    {
      title: "动作",
      key: "actions",
      width: 88,
      render: (_value, item) => `${item.readyActionCount}/${item.totalActionCount}`,
    },
    {
      title: "说明",
      dataIndex: "summary",
      key: "summary",
      width: 320,
    },
  ]

  const actionColumns: ColumnsType<FeishuSmartAssistantActionView> = [
    {
      title: "动作",
      dataIndex: "title",
      key: "title",
      width: 220,
      render: (_value: string, item) => (
        <div className="feishu-assistant-table-copy">
          <Text strong>{item.title}</Text>
          <Text type="secondary" className="feishu-assistant-table-copy-subtle">{item.actionId}</Text>
        </div>
      ),
    },
    {
      title: "域",
      dataIndex: "domain",
      key: "domain",
      width: 120,
      render: (value: FeishuSmartAssistantActionView["domain"]) =>
        domains.find((item) => item.key === value)?.title ?? value,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (value: FeishuSmartAssistantActionView["status"]) => renderLifecycleTag(value),
    },
    {
      title: "接入",
      key: "entry",
      width: 240,
      render: (_value, item) => (
        <Space size={6} wrap>
          {renderMountStrategyTag(item.mountStrategy)}
          {renderTransportTag(item.transport)}
        </Space>
      ),
    },
    {
      title: "凭证",
      dataIndex: "credentialKind",
      key: "credentialKind",
      width: 110,
      render: (value: FeishuSmartAssistantActionView["credentialKind"]) => renderCredentialTag(value),
    },
    {
      title: "风险",
      dataIndex: "riskLevel",
      key: "riskLevel",
      width: 110,
      render: (value: FeishuSmartAssistantActionView["riskLevel"]) => renderRiskTag(value),
    },
    {
      title: "说明",
      dataIndex: "summary",
      key: "summary",
      width: 320,
    },
    {
      title: "操作",
      key: "operation",
      width: 136,
      render: (_value, item) => (
        <Button
          size="small"
          icon={<PlayCircleOutlined />}
          disabled={item.status !== "ready"}
          onClick={() => openActionRunner(item)}
        >
          试运行
        </Button>
      ),
    },
  ]

  const profileColumns: ColumnsType<FeishuSmartAssistantConnectionProfileView> = [
    {
      title: "连接方式",
      dataIndex: "title",
      key: "title",
      width: 220,
      render: (_value, item) => (
        <div className="feishu-assistant-table-copy">
          <Text strong>{item.title}</Text>
          <Text type="secondary" className="feishu-assistant-table-copy-subtle">
            {item.kind}
          </Text>
        </div>
      ),
    },
    {
      title: "模式",
      key: "authMode",
      width: 140,
      render: (_value, item) => renderConnectionModeTag(item.authMode),
    },
    {
      title: "当前状态",
      key: "configured",
      width: 160,
      render: (_value, item) => {
        if (item.kind === "developer_oauth") {
          return assistant ? renderAuthStatusTag(assistant) : <Tag variant="filled">未配置</Tag>
        }

        return item.configured
          ? <Tag color="green" variant="filled">已配置</Tag>
          : <Tag variant="filled">未配置</Tag>
      },
    },
    {
      title: "支持域",
      key: "supportedDomains",
      width: 260,
      render: (_value, item) => (
        <Space size={6} wrap>
          {item.supportedDomains.map((domainKey) => (
            <Tag key={`${item.kind}:${domainKey}`} bordered={false}>
              {domains.find((domain) => domain.key === domainKey)?.title ?? domainKey}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "说明",
      key: "summary",
      width: 360,
      render: (_value, item) => (
        <div className="feishu-assistant-table-copy">
          <Text>{item.summary}</Text>
          {item.notes.map((note, index) => (
            <Text key={`${item.kind}:note:${index}`} type="secondary" className="feishu-assistant-table-copy-subtle">
              {note}
            </Text>
          ))}
        </div>
      ),
    },
  ]

  const contextColumns: ColumnsType<FeishuSmartAssistantContextTemplateView> = [
    {
      title: "域",
      dataIndex: "domain",
      key: "domain",
      width: 160,
      render: (_value, item) => (
        <div className="feishu-assistant-table-copy">
          <Text strong>{domains.find((domain) => domain.key === item.domain)?.title ?? item.domain}</Text>
          <Text type="secondary" className="feishu-assistant-table-copy-subtle">
            {item.title}
          </Text>
        </div>
      ),
    },
    {
      title: "上下文类型",
      key: "contextKind",
      width: 140,
      render: (_value, item) => renderContextKindTag(item.contextKind),
    },
    {
      title: "上下文字段",
      key: "fields",
      width: 420,
      render: (_value, item) => (
        <div className="feishu-assistant-table-copy">
          {item.fields.map((field) => (
            <Text key={`${item.domain}:${field.key}`} className="feishu-assistant-table-copy-subtle">
              {field.label}
              {field.required ? " · 必填" : " · 可选"}
              {` · ${field.description}`}
            </Text>
          ))}
        </div>
      ),
    },
    {
      title: "推荐动作",
      key: "recommendedActionIds",
      width: 260,
      render: (_value, item) => (
        <Space size={6} wrap>
          {item.recommendedActionIds.map((actionId) => (
            <Tag key={`${item.domain}:${actionId}`} bordered={false}>
              {actionId}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "说明",
      key: "summary",
      width: 360,
      render: (_value, item) => (
        <div className="feishu-assistant-table-copy">
          <Text>{item.summary}</Text>
          {item.notes.map((note, index) => (
            <Text key={`${item.domain}:note:${index}`} type="secondary" className="feishu-assistant-table-copy-subtle">
              {note}
            </Text>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className="feishu-module-panel">
      <div className="feishu-module-stack feishu-assistant-layout-shell">
        <div className="feishu-assistant-layout">
          <aside className="feishu-assistant-sidebar">
            <section className="feishu-assistant-access-strip">
              <form
                className="feishu-assistant-access-form"
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault()
                }}
              >
                <div className="feishu-assistant-access-field">
                  <Text strong>智能助手应用 App ID</Text>
                  <Input
                    size="large"
                    className="feishu-assistant-access-input"
                    value={props.assistantAppId}
                    placeholder="输入飞书智能助手应用 App ID"
                    autoComplete="username"
                    spellCheck={false}
                    onChange={(event) => props.onAssistantAppIdChange(event.target.value)}
                  />
                </div>
                <div className="feishu-assistant-access-field">
                  <Text strong>智能助手应用 App Secret</Text>
                  <Input.Password
                    size="large"
                    className="feishu-assistant-access-input"
                    value={props.assistantAppSecret}
                    placeholder={assistant?.hasAppSecret ? "已保存，如需更新请重新输入" : "输入飞书智能助手应用 App Secret"}
                    autoComplete="new-password"
                    onChange={(event) => props.onAssistantAppSecretChange(event.target.value)}
                  />
                </div>
                <div className="feishu-assistant-access-field">
                  <Text strong>OAuth 回调地址</Text>
                  <Input
                    size="large"
                    className="feishu-assistant-access-input"
                    value={props.assistantRedirectUri}
                    readOnly
                    spellCheck={false}
                  />
                </div>
              </form>

              <div className="feishu-assistant-access-actions">
                <div className="feishu-assistant-access-action-grid">
                  <Button
                    size="large"
                    className="feishu-assistant-access-action-button is-third-row"
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={props.saving}
                    onClick={props.onSave}
                  >
                    保存配置
                  </Button>
                  <Button
                    size="large"
                    className="feishu-assistant-access-action-button is-third-row"
                    icon={<LinkOutlined />}
                    loading={props.authorizing}
                    disabled={!assistant?.appId || !assistant.hasAppSecret}
                    onClick={props.onAuthorize}
                  >
                    发起授权
                  </Button>
                  <Popconfirm
                    title="确认重置飞书智能助手配置？"
                    okText="重置"
                    cancelText="取消"
                    onConfirm={props.onClear}
                  >
                    <Button
                      size="large"
                      danger
                      className="feishu-assistant-access-action-button is-third-row"
                      icon={<DeleteOutlined />}
                      loading={props.clearing}
                    >
                      重置配置
                    </Button>
                  </Popconfirm>
                  <Button
                    size="large"
                    className="feishu-assistant-access-action-button is-half-row"
                    icon={<SyncOutlined />}
                    loading={props.refreshingToken}
                    disabled={assistant?.authStatus !== "authorized" || !assistant?.hasRefreshToken}
                    onClick={props.onRefreshToken}
                  >
                    续费授权
                  </Button>
                  <Button
                    size="large"
                    className="feishu-assistant-access-action-button is-half-row"
                    icon={<ReloadOutlined />}
                    onClick={props.onRefresh}
                  >
                    检查状态
                  </Button>
                </div>
              </div>

              <div className="feishu-assistant-access-meta">
                <div className="feishu-assistant-access-metrics">
                  <div className="feishu-assistant-access-metric">
                    <Text type="secondary">授权状态</Text>
                    {assistant ? renderAuthStatusTag(assistant) : <Tag variant="filled">未配置</Tag>}
                  </div>
                  <div className="feishu-assistant-access-metric">
                    <Text type="secondary">应用配置</Text>
                    <Text>{assistant?.appId ? "已保存" : "未保存"}</Text>
                  </div>
                  <div className="feishu-assistant-access-metric">
                    <Text type="secondary">自动续期任务</Text>
                    {assistant ? renderAutoRefreshTaskTag(assistant.autoRefreshTask) : <Tag variant="filled">未配置</Tag>}
                    <Text type="secondary">{resolveAutoRefreshTaskSummary(assistant)}</Text>
                  </div>
                  <div className="feishu-assistant-access-metric">
                    <Text type="secondary">文档域接入</Text>
                    <Text>
                      {assistant?.authStatus === "authorized"
                        ? (assistant?.docsMcp?.mcpId ? "文档工作区已就绪" : "OAuth 已授权")
                        : "未就绪"}
                    </Text>
                  </div>
                </div>

                <div className="feishu-assistant-access-scope-box">
                  <div className="feishu-assistant-access-scope-head">
                    <Text type="secondary">权限 JSON</Text>
                    <Button
                      size="small"
                      className="feishu-assistant-access-scope-copy"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        void handleCopyAssistantScopes()
                      }}
                    >
                      复制 JSON
                    </Button>
                  </div>
                  <Input.TextArea
                    readOnly
                    autoSize={false}
                    className="feishu-assistant-access-scope-json"
                    value={assistantScopeJson}
                    spellCheck={false}
                  />
                </div>
              </div>
            </section>
          </aside>

          <section className="feishu-assistant-directory">
            <Tabs
              defaultActiveKey="domains"
              className="feishu-assistant-tabs"
              items={[
                {
                  key: "domains",
                  label: `域能力 (${domains.length})`,
                  children: (
                    <div className="feishu-assistant-tab-panel">
                      <AppTableCard
                        className="feishu-assistant-table-card feishu-assistant-table-card-domain"
                        rowKey={(item) => item.key}
                        columns={domainColumns}
                        items={domains}
                        loading={false}
                        loadingText="正在加载域能力..."
                        emptyDescription="当前没有可显示的域能力。"
                        scrollX={true}
                        tableProps={{
                          className: "feishu-assistant-table",
                        }}
                      />
                    </div>
                  ),
                },
                {
                  key: "actions",
                  label: `动作目录 (${actions.length})`,
                  children: (
                    <div className="feishu-assistant-tab-panel">
                      <AppTableCard
                        className="feishu-assistant-table-card feishu-assistant-table-card-action"
                        rowKey={(item) => item.actionId}
                        columns={actionColumns}
                        items={actions}
                        loading={false}
                        loadingText="正在加载动作目录..."
                        emptyDescription="当前没有可显示的动作。"
                        scrollX={true}
                        tableProps={{
                          className: "feishu-assistant-table",
                        }}
                      />
                    </div>
                  ),
                },
                {
                  key: "profiles",
                  label: `连接方式 (${connectionProfiles.length})`,
                  children: (
                    <div className="feishu-assistant-tab-panel">
                      <AppTableCard
                        className="feishu-assistant-table-card feishu-assistant-table-card-profile"
                        rowKey={(item) => item.kind}
                        columns={profileColumns}
                        items={connectionProfiles}
                        loading={false}
                        loadingText="正在加载连接方式..."
                        emptyDescription="当前没有可显示的连接方式。"
                        scrollX={true}
                        tableProps={{
                          className: "feishu-assistant-table",
                        }}
                      />
                    </div>
                  ),
                },
                {
                  key: "contexts",
                  label: `上下文模板 (${contextTemplates.length})`,
                  children: (
                    <div className="feishu-assistant-tab-panel">
                      <AppTableCard
                        className="feishu-assistant-table-card feishu-assistant-table-card-context"
                        rowKey={(item) => item.domain}
                        columns={contextColumns}
                        items={contextTemplates}
                        loading={false}
                        loadingText="正在加载上下文模板..."
                        emptyDescription="当前没有上下文模板。"
                        scrollX={true}
                        tableProps={{
                          className: "feishu-assistant-table",
                        }}
                      />
                    </div>
                  ),
                },
                {
                  key: "policies",
                  label: `运行策略 (${policyItems.length})`,
                  children: (
                    <div className="feishu-assistant-tab-panel">
                      <AppTableCard
                        className="feishu-assistant-table-card feishu-assistant-table-card-policy"
                        rowKey={(item) => item.key}
                        columns={POLICY_COLUMNS}
                        items={policyItems}
                        fillHeight={false}
                        loading={false}
                        loadingText="正在加载运行策略..."
                        emptyDescription="当前没有运行策略项。"
                        scrollX={true}
                        tableProps={{
                          className: "feishu-assistant-table",
                        }}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>
      </div>

      <Modal
        rootClassName="feishu-assistant-action-modal-dialog"
        open={actionModalOpen}
        title={currentAction ? `试运行动作 · ${currentAction.title}` : "试运行动作"}
        okText={
          pendingConfirmationActionId === currentAction?.actionId
            ? "确认执行"
            : "执行动作"
        }
        cancelText="关闭"
        confirmLoading={executingActionId === currentAction?.actionId}
        width={760}
        onOk={() => {
          void executeCurrentAction(pendingConfirmationActionId === currentAction?.actionId)
        }}
        onCancel={() => {
          setPendingConfirmationActionId("")
          setActionModalOpen(false)
        }}
      >
        {currentAction ? (
          <div className="feishu-assistant-action-modal">
            <div className="feishu-assistant-action-meta">
              <Space size={8} wrap>
                {renderMountStrategyTag(currentAction.mountStrategy)}
                {renderTransportTag(currentAction.transport)}
                {renderRiskTag(currentAction.riskLevel)}
              </Space>
              <Text type="secondary">{currentAction.summary}</Text>
            </div>

            <div className="feishu-assistant-modal-grid">
              {renderActionFields()}
            </div>

            {pendingConfirmationActionId === currentAction.actionId ? (
              <Alert
                showIcon
                type="warning"
                message="该动作已返回高风险确认预览。确认内容无误后，再点击右下角“确认执行”。"
              />
            ) : null}

            {actionExecutionError ? (
              <Alert showIcon type="error" message={actionExecutionError} />
            ) : null}

            {actionExecutionResult ? (
              <div className="feishu-assistant-result-shell">
                <Text strong>执行结果</Text>
                <pre className="feishu-assistant-result-pre">{actionExecutionResult}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
