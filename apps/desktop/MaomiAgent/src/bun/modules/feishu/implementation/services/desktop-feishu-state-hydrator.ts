import type {
  FeishuConnectionProfileKind,
  FeishuSmartAssistantActionRiskLevel,
  FeishuSmartAssistantActionStatus,
  FeishuSmartAssistantActionTransport,
  FeishuSmartAssistantActionView,
  FeishuSmartAssistantConnectionProfileView,
  FeishuSmartAssistantContextKind,
  FeishuSmartAssistantContextTemplateFieldView,
  FeishuSmartAssistantContextTemplateView,
  FeishuSmartAssistantCredentialKind,
  FeishuSmartAssistantDomainKey,
  FeishuSmartAssistantDomainModelView,
  FeishuSmartAssistantDomainMountStrategy,
  FeishuSmartAssistantDomainStatus,
  FeishuSmartAssistantDomainView,
  FeishuSmartAssistantRuntimePolicyView,
  FeishuSmartAssistantWorkbenchKind,
  FeishuStateView,
  FeishuSupportedTool,
} from "../../../../../shared/desktop-feishu";
import {
  normalizeDesktopFeishuRedirectUri,
  resolveDesktopFeishuOAuthCallbackOrigin,
} from "../../../../../shared/desktop-feishu-oauth";

const DEFAULT_DEVELOPER_SCOPES = [
  "offline_access",
  "calendar:calendar:readonly",
  "calendar:calendar.event:read",
  "calendar:calendar.free_busy:read",
  "calendar:calendar.event:create",
  "calendar:calendar.event:update",
  "base:field:read",
  "base:record:create",
  "base:table:read",
  "base:record:update",
  "base:view:read",
  "base:record:read",
  "contact:user:search",
  "contact:contact.base:readonly",
  "contact:user.base:readonly",
  "docs:document.media:download",
  "docs:document.comment:read",
  "docs:document.comment:create",
  "docs:document.comment:write_only",
  "board:whiteboard:node:read",
  "board:whiteboard:node:create",
  "search:docs:read",
  "docx:document:readonly",
  "docx:document:create",
  "docx:document:write_only",
  "docx:document.block:convert",
  "wiki:wiki:readonly",
  "wiki:node:read",
  "wiki:node:create",
  "search:message",
  "drive:file:upload",
  "drive:file:download",
  "docs:document.media:upload",
  "task:task:read",
  "task:task:write",
  "task:task:writeonly",
  "im:chat:read",
  "im:message:readonly",
  "sheets:spreadsheet:read",
  "sheets:spreadsheet:write_only",
  "mail:user_mailbox.message:readonly",
  "mail:user_mailbox.message.subject:read",
  "mail:user_mailbox.message.body:read",
  "mail:user_mailbox.message:send",
  "mail:user_mailbox.message:modify",
  "vc:meeting.search:read",
  "vc:note:read",
  "minutes:minutes:readonly",
  "minutes:minutes.artifacts:read",
  "wiki:node:update",
] as const;

const DEFAULT_DEVELOPER_TENANT_SCOPES = [
  "im:message",
  "im:message:send_as_bot",
  "im:message:send",
] as const;

const DEFAULT_DEVELOPER_ALLOWED_TOOLS = [
  "search-doc",
  "fetch-doc",
  "create-doc",
  "update-doc",
] as const;

const DEFAULT_SUPPORTED_TOOLS: readonly FeishuSupportedTool[] = [
  {
    name: "search-doc",
    description: "Search Feishu docs and wiki nodes.",
    permissions: ["docx:document:readonly"],
    supportedModes: ["personal", "developer"],
  },
  {
    name: "fetch-doc",
    description: "Read Feishu doc content and tree metadata.",
    permissions: ["docx:document:readonly"],
    supportedModes: ["personal", "developer"],
  },
  {
    name: "create-doc",
    description: "Create Feishu docs or draft content from the workspace.",
    permissions: ["docx:document:readonly"],
    supportedModes: ["developer"],
  },
  {
    name: "update-doc",
    description: "Update Feishu doc content and comments through the assistant runtime.",
    permissions: ["docx:document:readonly"],
    supportedModes: ["developer"],
  },
] as const;

type DomainCatalogDefinition = {
  key: FeishuSmartAssistantDomainKey;
  title: string;
  summary: string;
  status: FeishuSmartAssistantDomainStatus;
  mountStrategy: FeishuSmartAssistantDomainMountStrategy;
  transport: Extract<FeishuSmartAssistantActionTransport, "remote_mcp" | "openapi_sdk" | "builtin_runtime">;
  credentialKind: FeishuSmartAssistantCredentialKind;
  primaryConnectionKind: FeishuConnectionProfileKind;
  supportedConnectionKinds: FeishuConnectionProfileKind[];
  contextKind: FeishuSmartAssistantContextKind;
  associationLabel: string;
  workbenchKind: FeishuSmartAssistantWorkbenchKind;
  workbenchLabel: string;
  contextTitle: string;
  contextSummary: string;
  contextFields: FeishuSmartAssistantContextTemplateFieldView[];
  contextNotes: string[];
};

type ActionCatalogDefinition = {
  actionId: string;
  domain: FeishuSmartAssistantDomainKey;
  title: string;
  summary: string;
  status: FeishuSmartAssistantActionStatus;
  riskLevel: FeishuSmartAssistantActionRiskLevel;
};

const DOMAIN_CATALOG: readonly DomainCatalogDefinition[] = [
  {
    key: "docs",
    title: "云文档",
    summary: "文档树、正文、媒体、评论与草稿同步能力。",
    status: "ready",
    mountStrategy: "lazy_mcp",
    transport: "remote_mcp",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "docId / 文档树节点 / 可选本地草稿缓存",
    workbenchKind: "docs_workspace",
    workbenchLabel: "飞书文档工作区",
    contextTitle: "文档工作上下文",
    contextSummary: "围绕 docId、文档树节点和工作区缓存组织上下文。",
    contextFields: [
      {
        key: "workspaceId",
        label: "本地缓存工作区",
        valueKind: "workspace_id",
        required: false,
        description: "需要保存本地草稿、拉取或推送时填写。",
        placeholder: "repo-main",
      },
      {
        key: "resourceId",
        label: "文档 ID",
        valueKind: "resource_id",
        required: false,
        description: "可直接锚定具体 docId。",
        placeholder: "doccnxxxxxxxx",
      },
    ],
    contextNotes: ["文档能力通过智能助手 OAuth 接入。"],
  },
  {
    key: "calendar",
    title: "日历",
    summary: "日程查询、忙闲分析与创建会议能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "日历账号 + 时间范围 + 参与人",
    workbenchKind: "calendar_board",
    workbenchLabel: "日程面板",
    contextTitle: "日程时间窗口",
    contextSummary: "calendar 域以 calendarId 和时间范围为主上下文。",
    contextFields: [
      {
        key: "startAt",
        label: "开始时间",
        valueKind: "datetime",
        required: true,
        description: "支持 YYYY-MM-DD 或 ISO 8601。",
        placeholder: "2026-03-29",
      },
      {
        key: "endAt",
        label: "结束时间",
        valueKind: "datetime",
        required: false,
        description: "查询或创建日程时建议一并提供。",
        placeholder: "2026-03-30",
      },
    ],
    contextNotes: ["创建日程前建议先做忙闲查询。"],
  },
  {
    key: "messenger",
    title: "消息",
    summary: "会话检索、发消息与回复线程能力。",
    status: "ready",
    mountStrategy: "always_control_plane",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "session_anchor",
    associationLabel: "chatId / messageId / threadId / 查询关键词",
    workbenchKind: "message_thread",
    workbenchLabel: "消息线程",
    contextTitle: "消息会话锚点",
    contextSummary: "消息域优先围绕 chatId、threadId 与消息锚点建立上下文。",
    contextFields: [
      {
        key: "query",
        label: "检索关键词",
        valueKind: "query",
        required: false,
        description: "搜索消息时可直接使用自然语言关键词。",
        placeholder: "项目同步",
      },
      {
        key: "resourceId",
        label: "消息锚点",
        valueKind: "resource_id",
        required: false,
        description: "可传 chatId / messageId / threadId 作为会话锚点。",
        placeholder: "om_123456",
      },
    ],
    contextNotes: ["消息发送与回复默认走受控控制面动作。"],
  },
  {
    key: "drive",
    title: "云盘",
    summary: "文件搜索、上传、下载与元数据读取能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "folderToken / fileToken / 本地路径",
    workbenchKind: "drive_explorer",
    workbenchLabel: "云盘浏览器",
    contextTitle: "云盘资源锚点",
    contextSummary: "drive 域围绕 folderToken、fileToken 与本地路径组织上下文。",
    contextFields: [
      {
        key: "resourceId",
        label: "云盘 Token",
        valueKind: "resource_id",
        required: false,
        description: "上传时使用 folderToken，下载时使用 fileToken。",
        placeholder: "fldcnxxxxxxxx",
      },
    ],
    contextNotes: ["上传与下载动作都需要显式确认参数。"],
  },
  {
    key: "base",
    title: "多维表格",
    summary: "表清单、记录查询与记录写入能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "baseToken / tableId / viewId / recordId",
    workbenchKind: "base_workspace",
    workbenchLabel: "多维表格工作区",
    contextTitle: "多维表格上下文",
    contextSummary: "base 域围绕 baseToken、tableId 和记录主键组织上下文。",
    contextFields: [
      {
        key: "resourceId",
        label: "Base Token",
        valueKind: "resource_id",
        required: true,
        description: "执行 base 动作时建议始终提供 app token。",
        placeholder: "app_xxxxxxxxx",
      },
    ],
    contextNotes: ["写入记录时通常还需要 tableId 和字段 JSON。"],
  },
  {
    key: "sheets",
    title: "电子表格",
    summary: "读取工作表、追加行和导出表格能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "spreadsheetToken / sheetId / range",
    workbenchKind: "sheets_workspace",
    workbenchLabel: "表格工作区",
    contextTitle: "表格范围上下文",
    contextSummary: "sheets 域以 spreadsheetToken、sheetId 和 range 组织上下文。",
    contextFields: [
      {
        key: "resourceId",
        label: "Spreadsheet Token",
        valueKind: "resource_id",
        required: true,
        description: "读取、追加和导出都依赖 spreadsheetToken。",
        placeholder: "shtcnxxxxxxxx",
      },
    ],
    contextNotes: ["追加行时再补 values JSON。"],
  },
  {
    key: "tasks",
    title: "任务",
    summary: "任务创建、完成与任务清单查询能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "query_only",
    associationLabel: "taskId / tasklistId / title / dueAt",
    workbenchKind: "task_board",
    workbenchLabel: "任务面板",
    contextTitle: "任务清单上下文",
    contextSummary: "tasks 域通常围绕 tasklistId、任务标题和截止时间组织。",
    contextFields: [
      {
        key: "query",
        label: "任务检索词",
        valueKind: "query",
        required: false,
        description: "查询任务或定位待办时使用。",
        placeholder: "客户回访",
      },
    ],
    contextNotes: ["完成任务时需要 taskId。"],
  },
  {
    key: "wiki",
    title: "知识库",
    summary: "知识库节点搜索、创建和节点管理能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "wikiNodeToken / wikiSpaceId / targetWikiNodeToken",
    workbenchKind: "wiki_workspace",
    workbenchLabel: "知识库工作区",
    contextTitle: "知识库节点上下文",
    contextSummary: "wiki 域围绕节点 token 和知识空间组织上下文。",
    contextFields: [
      {
        key: "resourceId",
        label: "Wiki 节点 Token",
        valueKind: "resource_id",
        required: false,
        description: "搜索或管理节点时均可作为锚点。",
        placeholder: "wiknode_xxxxxxxx",
      },
    ],
    contextNotes: ["节点移动、重命名与创建都使用同一组锚点参数。"],
  },
  {
    key: "contact",
    title: "通讯录",
    summary: "用户检索与个人资料读取能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "query_only",
    associationLabel: "用户关键词 / userId / userIdType",
    workbenchKind: "contact_search",
    workbenchLabel: "联系人搜索",
    contextTitle: "通讯录检索上下文",
    contextSummary: "contact 域通过关键词或 userId 读取用户资料。",
    contextFields: [
      {
        key: "query",
        label: "检索词",
        valueKind: "query",
        required: false,
        description: "支持姓名、邮箱、手机号等关键字。",
        placeholder: "张三",
      },
    ],
    contextNotes: ["读取个人资料时可以直接传 userId。"],
  },
  {
    key: "mail",
    title: "邮箱",
    summary: "邮件查询与发送能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "mailbox / messageId / 收件人 / 时间范围",
    workbenchKind: "mail_inbox",
    workbenchLabel: "邮箱面板",
    contextTitle: "邮箱会话上下文",
    contextSummary: "mail 域围绕 mailbox、messageId 和收件人集合组织上下文。",
    contextFields: [
      {
        key: "resourceId",
        label: "邮箱或消息锚点",
        valueKind: "resource_id",
        required: false,
        description: "可传 mailbox 或 messageId。",
        placeholder: "me",
      },
    ],
    contextNotes: ["发送邮件前建议先确认收件人列表。"],
  },
  {
    key: "meetings",
    title: "会议",
    summary: "会议纪要检索与纪要正文读取能力。",
    status: "ready",
    mountStrategy: "registry_only",
    transport: "openapi_sdk",
    credentialKind: "user_access_token",
    primaryConnectionKind: "developer_oauth",
    supportedConnectionKinds: ["developer_oauth"],
    contextKind: "resource_anchor",
    associationLabel: "meetingId / minuteToken / 时间范围",
    workbenchKind: "meeting_hub",
    workbenchLabel: "会议中心",
    contextTitle: "会议纪要上下文",
    contextSummary: "meetings 域围绕 meetingId、minuteToken 和时间范围组织上下文。",
    contextFields: [
      {
        key: "resourceId",
        label: "会议或纪要锚点",
        valueKind: "resource_id",
        required: false,
        description: "可传 meetingId 或 minuteToken。",
        placeholder: "omt_xxxxxxxx",
      },
    ],
    contextNotes: ["读取纪要正文时优先使用 minuteToken。"],
  },
] as const;

const ACTION_CATALOG: readonly ActionCatalogDefinition[] = [
  { actionId: "docs.search", domain: "docs", title: "搜索文档", summary: "按关键词搜索文档和知识节点。", status: "ready", riskLevel: "low" },
  { actionId: "docs.list_nodes", domain: "docs", title: "列出文档树", summary: "读取当前文档树节点和分页信息。", status: "ready", riskLevel: "low" },
  { actionId: "docs.read", domain: "docs", title: "读取文档", summary: "读取指定文档正文、标题与元数据。", status: "ready", riskLevel: "low" },
  { actionId: "docs.fetch_media", domain: "docs", title: "获取媒体预览", summary: "为图片、附件和白板生成可预览地址。", status: "ready", riskLevel: "low" },
  { actionId: "docs.update", domain: "docs", title: "更新文档", summary: "保存或回写文档草稿内容。", status: "ready", riskLevel: "high" },
  { actionId: "docs.create", domain: "docs", title: "创建文档", summary: "创建新文档并写入初始内容。", status: "ready", riskLevel: "high" },
  { actionId: "docs.comments.read", domain: "docs", title: "读取评论", summary: "读取文档评论列表和分页游标。", status: "ready", riskLevel: "low" },
  { actionId: "docs.comments.add", domain: "docs", title: "添加评论", summary: "为文档追加新的全文评论。", status: "ready", riskLevel: "medium" },
  { actionId: "calendar.agenda", domain: "calendar", title: "查看日程", summary: "按时间窗口读取日程安排。", status: "ready", riskLevel: "low" },
  { actionId: "calendar.find_slot", domain: "calendar", title: "查找空闲时间", summary: "为参与人组合生成可用时间建议。", status: "ready", riskLevel: "low" },
  { actionId: "calendar.create_event", domain: "calendar", title: "创建日程", summary: "创建日程并邀请参与人。", status: "ready", riskLevel: "high" },
  { actionId: "messenger.search", domain: "messenger", title: "搜索消息", summary: "按关键词、会话或线程检索消息。", status: "ready", riskLevel: "low" },
  { actionId: "messenger.send", domain: "messenger", title: "发送消息", summary: "向会话或用户发送文本消息。", status: "ready", riskLevel: "high" },
  { actionId: "messenger.reply", domain: "messenger", title: "回复消息", summary: "针对指定消息或线程发送回复。", status: "ready", riskLevel: "high" },
  { actionId: "drive.search", domain: "drive", title: "搜索文件", summary: "按关键词或文件夹上下文检索云盘文件。", status: "ready", riskLevel: "low" },
  { actionId: "drive.upload", domain: "drive", title: "上传文件", summary: "将本地文件上传到云盘目录。", status: "ready", riskLevel: "high" },
  { actionId: "drive.download", domain: "drive", title: "下载文件", summary: "将云盘文件下载到本地或受控目录。", status: "ready", riskLevel: "medium" },
  { actionId: "base.list_tables", domain: "base", title: "列出表格", summary: "读取多维表格下的所有 table 清单。", status: "ready", riskLevel: "low" },
  { actionId: "base.query_records", domain: "base", title: "查询记录", summary: "按视图、偏移量和条数读取记录。", status: "ready", riskLevel: "low" },
  { actionId: "base.upsert_records", domain: "base", title: "写入记录", summary: "创建或更新多维表格记录。", status: "ready", riskLevel: "high" },
  { actionId: "sheets.read", domain: "sheets", title: "读取表格", summary: "读取工作表范围内容。", status: "ready", riskLevel: "low" },
  { actionId: "sheets.append_rows", domain: "sheets", title: "追加行", summary: "向工作表末尾追加多行数据。", status: "ready", riskLevel: "high" },
  { actionId: "sheets.export", domain: "sheets", title: "导出表格", summary: "将工作表导出为 xlsx 或 csv。", status: "ready", riskLevel: "medium" },
  { actionId: "tasks.create", domain: "tasks", title: "创建任务", summary: "创建新的任务或待办项。", status: "ready", riskLevel: "high" },
  { actionId: "tasks.complete", domain: "tasks", title: "完成任务", summary: "将指定任务标记为完成。", status: "ready", riskLevel: "medium" },
  { actionId: "wiki.search", domain: "wiki", title: "搜索知识库", summary: "搜索知识库节点与页面。", status: "ready", riskLevel: "low" },
  { actionId: "wiki.manage_nodes", domain: "wiki", title: "管理节点", summary: "创建、移动或重命名知识库节点。", status: "ready", riskLevel: "high" },
  { actionId: "contact.search_user", domain: "contact", title: "搜索联系人", summary: "按姓名、邮箱或手机号搜索联系人。", status: "ready", riskLevel: "low" },
  { actionId: "contact.get_profile", domain: "contact", title: "读取档案", summary: "读取当前用户或指定用户资料。", status: "ready", riskLevel: "low" },
  { actionId: "mail.search", domain: "mail", title: "搜索邮件", summary: "按邮箱、关键词和时间窗口检索邮件。", status: "ready", riskLevel: "low" },
  { actionId: "mail.send", domain: "mail", title: "发送邮件", summary: "发送一封新邮件或补全文本正文。", status: "ready", riskLevel: "high" },
  { actionId: "meetings.search_records", domain: "meetings", title: "搜索纪要", summary: "检索会议与纪要记录。", status: "ready", riskLevel: "low" },
  { actionId: "meetings.read_minutes", domain: "meetings", title: "读取纪要", summary: "读取指定会议纪要正文。", status: "ready", riskLevel: "low" },
] as const;

const POLICY_ITEMS: readonly FeishuSmartAssistantRuntimePolicyView[] = [
  {
    key: "control_plane",
    title: "控制面",
    decision: "小控制面常驻",
    summary: "默认暴露统一智能助手入口，不把整套飞书工具直接注入上下文。",
    status: "ready",
  },
  {
    key: "domain_mounting",
    title: "域装配",
    decision: "按域目录声明能力",
    summary: "目录、连接方式和上下文模板统一由 runtime 提供。",
    status: "ready",
  },
  {
    key: "action_execution",
    title: "动作执行",
    decision: "registry 优先",
    summary: "智能助手动作统一进入域动作注册表，再由具体 handler 分发。",
    status: "ready",
  },
  {
    key: "credential_proxy",
    title: "凭证代理",
    decision: "Token 仅在 runtime 组装",
    summary: "UI 不直接持有 Authorization Header。",
    status: "ready",
  },
] as const;

function normalizeUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function cloneContextField(field: FeishuSmartAssistantContextTemplateFieldView): FeishuSmartAssistantContextTemplateFieldView {
  return {
    ...field,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
  };
}

function cloneConnectionProfile(profile: FeishuSmartAssistantConnectionProfileView): FeishuSmartAssistantConnectionProfileView {
  return {
    ...profile,
    supportedDomains: [...profile.supportedDomains],
    notes: [...profile.notes],
  };
}

function buildConnectionProfiles(state: FeishuStateView): FeishuSmartAssistantConnectionProfileView[] {
  const oauthConfigured = Boolean(
    state.smartAssistant.appId?.trim()
      || state.developer?.appId?.trim(),
  );

  const profiles: FeishuSmartAssistantConnectionProfileView[] = [
    {
      kind: "developer_oauth",
      title: "智能助手 OAuth",
      summary: "通过智能助手专用 OAuth 获取 user_access_token，承接多域飞书能力。",
      status: "ready",
      authMode: "oauth",
      configured: oauthConfigured,
      supportedDomains: DOMAIN_CATALOG.map((item) => item.key),
      notes: ["这套 OAuth 配置独立于飞书机器人应用配置。"],
    },
  ];

  return profiles.map(cloneConnectionProfile);
}

function buildDomainModels(): FeishuSmartAssistantDomainModelView[] {
  return DOMAIN_CATALOG.map((item) => ({
    domain: item.key,
    title: item.title,
    primaryConnectionKind: item.primaryConnectionKind,
    supportedConnectionKinds: [...item.supportedConnectionKinds],
    contextKind: item.contextKind,
    associationLabel: item.associationLabel,
    workbenchKind: item.workbenchKind,
    workbenchLabel: item.workbenchLabel,
  }));
}

function buildContextTemplates(): FeishuSmartAssistantContextTemplateView[] {
  return DOMAIN_CATALOG.map((item) => ({
    domain: item.key,
    title: item.contextTitle,
    contextKind: item.contextKind,
    summary: item.contextSummary,
    fields: item.contextFields.map(cloneContextField),
    recommendedActionIds: ACTION_CATALOG
      .filter((action) => action.domain === item.key)
      .slice(0, 2)
      .map((action) => action.actionId),
    notes: [...item.contextNotes],
  }));
}

function buildActions(): FeishuSmartAssistantActionView[] {
  const domainByKey = new Map(DOMAIN_CATALOG.map((item) => [item.key, item]));
  return ACTION_CATALOG.map((item) => {
    const domain = domainByKey.get(item.domain);
    if (!domain) {
      throw new Error(`Unknown Feishu smart assistant domain: ${item.domain}`);
    }

    return {
      actionId: item.actionId,
      domain: item.domain,
      title: item.title,
      summary: item.summary,
      status: item.status,
      transport: domain.transport,
      mountStrategy: domain.mountStrategy,
      credentialKind: domain.credentialKind,
      riskLevel: item.riskLevel,
    };
  });
}

function buildDomains(actions: readonly FeishuSmartAssistantActionView[]): FeishuSmartAssistantDomainView[] {
  return DOMAIN_CATALOG.map((item) => {
    const domainActions = actions.filter((action) => action.domain === item.key);
    return {
      key: item.key,
      title: item.title,
      summary: item.summary,
      status: item.status,
      mountStrategy: item.mountStrategy,
      transport: item.transport === "builtin_runtime" ? "openapi_sdk" : item.transport,
      credentialKind: item.credentialKind,
      readyActionCount: domainActions.filter((action) => action.status === "ready").length,
      totalActionCount: domainActions.length,
    };
  });
}

function buildStatusNotice(
  authStatus: FeishuStateView["smartAssistant"]["authStatus"],
  hasRefreshToken: boolean,
  existing?: string,
) {
  if (existing?.trim()) {
    return existing;
  }
  if (authStatus === "authorized" && !hasRefreshToken) {
    return "当前未保存 refresh_token，请确认应用已开通 offline_access 权限。";
  }
  return undefined;
}

function mergeDocsCapabilities(
  state: FeishuStateView,
) {
  if (state.smartAssistant.docsMcp) {
    return state.smartAssistant.docsMcp;
  }
  return null;
}

export function hydrateDesktopFeishuStateView(state: FeishuStateView): FeishuStateView {
  const actions = buildActions();
  const domains = buildDomains(actions);
  const domainModels = buildDomainModels();
  const contextTemplates = buildContextTemplates();
  const developerScopes = normalizeUniqueStrings(
    state.catalog.developerScopes.length > 0
      ? state.catalog.developerScopes
      : DEFAULT_DEVELOPER_SCOPES,
  );
  const developerTenantScopes = normalizeUniqueStrings(
    state.catalog.developerTenantScopes.length > 0
      ? state.catalog.developerTenantScopes
      : DEFAULT_DEVELOPER_TENANT_SCOPES,
  );
  const developerAllowedTools = normalizeUniqueStrings(
    state.catalog.developerAllowedTools.length > 0
      ? state.catalog.developerAllowedTools
      : DEFAULT_DEVELOPER_ALLOWED_TOOLS,
  );
  const supportedTools = state.catalog.supportedTools.length > 0
    ? state.catalog.supportedTools.map((item) => ({
        ...item,
        permissions: [...item.permissions],
        supportedModes: [...item.supportedModes],
      }))
    : DEFAULT_SUPPORTED_TOOLS.map((item) => ({
        ...item,
        permissions: [...item.permissions],
        supportedModes: [...item.supportedModes],
      }));

  const smartAssistantScopes = normalizeUniqueStrings(
    state.smartAssistant.scopes.length > 0
      ? state.smartAssistant.scopes
      : developerScopes,
  );
  const smartAssistantAllowedTools = normalizeUniqueStrings(
    state.smartAssistant.allowedTools.length > 0
      ? state.smartAssistant.allowedTools
      : developerAllowedTools,
  );
  const smartAssistantRedirectUri = normalizeDesktopFeishuRedirectUri(
    state.smartAssistant.redirectUri || state.developer?.redirectUri,
  );
  const smartAssistantRedirectOrigin = resolveDesktopFeishuOAuthCallbackOrigin(
    smartAssistantRedirectUri,
  );
  const developer = state.developer
    ? (() => {
        const developerRedirectUri = normalizeDesktopFeishuRedirectUri(
          state.developer.redirectUri || state.smartAssistant.redirectUri,
        );
        const developerRedirectOrigin = resolveDesktopFeishuOAuthCallbackOrigin(
          developerRedirectUri,
        );
        return {
          ...state.developer,
          redirectUri: developerRedirectUri,
          redirectOrigin: developerRedirectOrigin,
          scopes: normalizeUniqueStrings(
            state.developer.scopes.length > 0
              ? state.developer.scopes
              : developerScopes,
          ),
          allowedTools: normalizeUniqueStrings(
            state.developer.allowedTools.length > 0
              ? state.developer.allowedTools
              : developerAllowedTools,
          ),
          ...(buildStatusNotice(
            state.developer.authStatus,
            state.developer.hasRefreshToken,
            state.developer.statusNotice,
          )
            ? {
                statusNotice: buildStatusNotice(
                  state.developer.authStatus,
                  state.developer.hasRefreshToken,
                  state.developer.statusNotice,
                ),
              }
            : {}),
        };
      })()
    : null;
  return {
    ...state,
    smartAssistant: {
      ...state.smartAssistant,
      redirectUri: smartAssistantRedirectUri,
      redirectOrigin: smartAssistantRedirectOrigin,
      scopes: smartAssistantScopes,
      allowedTools: smartAssistantAllowedTools,
      statusNotice: buildStatusNotice(
        state.smartAssistant.authStatus,
        state.smartAssistant.hasRefreshToken,
        state.smartAssistant.statusNotice,
      ),
      runtimePolicy: {
        ...state.smartAssistant.runtimePolicy,
        controlPlane: "ready",
        domainMounting: "lazy_by_domain",
        actionExecution: "registry_first",
      },
      docsMcp: mergeDocsCapabilities(state),
      connectionProfiles: buildConnectionProfiles(state),
      domainModels,
      contextTemplates,
      policyItems: POLICY_ITEMS.map((item) => ({ ...item })),
      domains,
      actions,
    },
    developer,
    catalog: {
      developerScopes,
      developerTenantScopes,
      developerAllowedTools,
      supportedTools,
    },
  };
}
