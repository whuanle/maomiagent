# 飞书模块拆分与智能助手重构设计

说明：

- 文中历史共享层与历史 runtime 层的代码指针，仅用于说明当时的耦合点。
- 当前桌面主线请以 `apps/desktop/MaomiAgent` 为准；如果要落实现，请先把这些旧路径映射到现行模块结构。

## 1. 目标

将当前偏「飞书文档 MCP + 开发者模式」的实现，重构为三个独立子模块：

1. `个人文档 MCP`
2. `飞书机器人`
3. `飞书智能助手`

其中：

- `个人文档 MCP` 只保留终端用户自助配置的个人远程 MCP 文档能力。
- `飞书机器人` 保持当前机器人消息收发与会话绑定能力。
- `飞书智能助手` 承接原“开发者模式”能力，但不再限定为文档场景，而是作为更广义的飞书能力编排入口。

本次设计的核心目标不是“把所有飞书能力一次性做成一个超大 MCP”，而是建立一套：

- 小而稳定的 AI 控制面
- 可扩展的飞书域能力注册表
- 按需挂载的域级工具集
- 受控的 OpenAPI / SDK 执行通道

## 1.1 当前确认版约束

下面这些约束已经确认，不再回退：

- `飞书智能助手` 接入完成后，用户心智就是“在对话里直接用”，不是“先在左侧绑定某个工作区再用”。
- `飞书文档工作区` 只负责文档落本地、草稿同步、手工编辑协作；它不是智能助手接入的前置条件。
- `按域挂载 / 下一轮注入 / registry_only` 这些都属于 runtime 内部实现细节，不应该变成设置页主交互。
- 授权形态本身不是当前能力规划的阻塞项；本次文档重点只放在能力接入主链路。

## 2. 当前问题

### 2.1 模型与页面结构耦合过深

当前共享状态仍以 `mode: "none" | "personal" | "developer"` 为核心，见：

- 历史共享层的 Feishu 模型定义
- 历史 runtime 层的 Feishu service

这会导致几个问题：

- “开发者模式”被误建模成“文档模块的一个模式”
- 文档能力与非文档能力无法自然拆分
- `managedMcp` 被默认理解成一个统一飞书入口，不利于未来按域拆分

### 2.2 远程 MCP 不能承担全部飞书能力

官方公开文档当前明确说明：

- 远程 MCP 当前支持重点仍是「云文档」场景
- 后续可能增加更多场景，但不能按“已经覆盖全飞书”来设计
- `X-Lark-MCP-Allowed-Tools` 不传时，AI 无法发现和调用任何工具

公开文档可见：

- 开发者远程 MCP：<https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server>
- 个人远程 MCP：<https://open.feishu.cn/document/mcp_open_tools/end-user-call-remote-mcp-server>

因此不能把“飞书智能助手”简单等同于“把更多功能硬塞进一个常驻远程 MCP”。

### 2.3 AI 工具上下文膨胀风险是真问题

如果把 Calendar、IM、Docs、Drive、Base、Sheets、Tasks、Wiki、Contact、Mail、Meetings 全量暴露给模型：

- 工具列表会变得很大
- 提示词与工具描述会显著膨胀
- 模型更容易选错工具
- 权限、身份、风险边界更难收敛

你担心“大功能都做 MCP 提供给 AI 使用会导致上下文非常庞大”，这个判断是对的，而且和飞书官方在个人 MCP 文档里提示“建议按需选择工具以避免超出上下文限制”是一致的。

## 3. 参考项目给出的启发

参考项目 `E:\opensoure\cli-main` 的价值不在于复用 CLI，而在于它的产品拆分方式是对的：

- 按业务域拆分：`calendar / im / doc / drive / base / sheets / task / wiki / contact / mail / vc`
- 按身份拆分：`user` 与 `bot`
- 按动作组织：高频动作、快捷命令、能力说明

这说明我们自己的 `飞书智能助手` 也应该采用“域能力 + 身份 + 动作”的建模方式，而不是继续沿用“文档页面里附带一个 developer 模式”。

## 4. 目标结构

### 4.1 模块拆分

推荐把飞书模块重构为以下结构：

#### A. 个人文档 MCP

职责：

- 管理个人远程 MCP URL
- 仅面向个人文档工具
- 保留个人用户对文档 MCP 的最轻量配置与使用方式

不负责：

- 开发者 OAuth
- 多业务域能力管理
- Bot / TAT / OpenAPI 编排

#### B. 飞书机器人

职责：

- Bot 配置
- 会话绑定
- 消息接收与发送
- 图片、文件、卡片等机器人通道能力

这一块现有实现可基本保持独立演进。

#### C. 飞书智能助手

职责：

- 承接原开发者模式配置
- 管理开发者身份、授权状态、可用业务域
- 管理 AI 可用的飞书能力编排策略
- 作为 AI 调用飞书能力的统一入口

它不是“一个大工具列表页”，而是“飞书能力控制台”。

## 5. 飞书智能助手的推荐架构

### 5.1 不推荐：全量常驻 MCP

不建议把所有飞书域能力都做成常驻 MCP 直接提供给 AI。

原因：

- 工具规模太大，影响模型选择质量
- 很多域能力并不适合以“几十个原始工具”直接暴露
- 不同能力需要不同身份：有的适合 UAT，有的适合 TAT / bot
- 文档类适合 MCP，消息发送、媒体上传、复杂 OpenAPI 则更适合受控执行器

### 5.2 推荐：混合式架构

推荐采用：

- `小控制面 MCP`
- `动作注册表`
- `受控执行器`
- `按域挂载的可选 MCP`

也就是：

#### 常驻给 AI 的始终只有一小层控制面

例如提供少量稳定工具：

- `get_feishu_capabilities_summary`
- `list_feishu_domains`
- `list_feishu_actions`
- `mount_feishu_domain`
- `unmount_feishu_domain`
- `execute_feishu_action`

这些工具的职责不是暴露所有细节，而是帮助模型：

- 先知道当前已接通什么
- 再决定是否需要某个域
- 对高频动作直接走注册表执行

#### 高复杂度域按需挂载

适合按域挂载的场景：

- `docs`
- `base`
- `sheets`
- `calendar`

原因是这些域往往存在：

- 工具数量多
- 连续多轮操作概率高
- 需要模型反复探索对象结构

这类场景可以在下一轮 AI 执行前，根据意图把对应域 MCP 注入本轮配置。

#### 其他域优先走动作注册表

例如：

- 发送消息
- 查联系人
- 创建会议
- 查忙闲
- 搜索邮件
- 拉会议纪要

这类操作很多是“明确动作 + 明确参数”，更适合做成受控 action，而不是暴露大量底层原子工具。

### 5.3 用户心智与内部实现要分离

这里要明确区分两层：

#### 用户看到的产品心智

- 保存智能助手应用配置
- 完成授权
- 看域目录与动作目录
- 进入对话直接说“查今天日程”“搜某篇文档”“找张三”“建一个会议”

用户不需要理解：

- 当前是不是某个工作区
- 某个域有没有被挂载
- 本轮注入了哪些 MCP
- 动作是走 Remote MCP 还是 OpenAPI runtime

#### runtime 内部真实实现

- 控制面 MCP 常驻
- 高频明确动作优先走受控 runtime
- 只有在连续探索型场景出现时，才在后续轮次按域补充工具
- 文档类在需要本地草稿协作时才落到 `飞书文档工作区`

这意味着：

- “接入后直接在对话里用”与“内部仍然按轮次动态注入能力”并不冲突
- 设置页不应该再出现“选择工作区 / 当前工作区 / 挂载 / 卸载”的交互
- `workspaceId` 只该保留在运行时或高级文档协作场景，不该成为智能助手接入主模型

## 6. 为什么“按需注入”在当前仓库里可行

当前 AI 运行时并不是一次性全局固定 MCP，而是在每次完成调用前动态拼装：

- 历史 AI runtime 的 workspace-opencode-ai service

该文件内会在 `complete()` 准备阶段调用 `buildChatMcpConfig(...)`，再把结果装入本轮 `config.mcp`。

这意味着：

- 完全可以按会话、按轮次、按来源动态决定挂载哪些飞书工具
- 不需要实现“运行中途热插拔 MCP”
- 更现实的模型是：
  - 本轮识别意图
  - 更新会话侧有效飞书能力配置
  - 下一轮使用更新后的 MCP 装配

所以“AI 后续需要某个大功能时再挂载对应 MCP”这个方向，和当前代码架构并不冲突。

另外，当前仓库里已经有两个非常关键的落点：

- 历史内建 Feishu smart assistant runtime provider
- 历史 runtime 层的 Feishu service

前者负责把飞书智能助手控制面作为内建 MCP 暴露给会话 runtime，后者负责：

- 域目录
- 动作目录
- 动作执行
- 域级排除与注入策略

因此后续真正需要补的是“会话前的域选择策略”和“动作优先级策略”，而不是重新发明一套飞书接入框架。

## 7. 建议的能力分层

### 7.1 凭证层

建议从现有 `developer` 配置中拆出统一的飞书凭证代理：

- `developer_user_token`
- `developer_tenant_token`
- `bot_tenant_token`

原则：

- token 只在 sidecar / runtime 内流转
- AI 与 MCP 工具不直接接触明文 token
- UI 只呈现授权状态与能力状态，不暴露 header 细节

### 7.2 域注册表

定义一个域目录，例如：

- `docs`
- `calendar`
- `messenger`
- `drive`
- `base`
- `sheets`
- `tasks`
- `wiki`
- `contact`
- `mail`
- `meetings`

每个域声明：

- 域标识
- 展示名称
- 支持身份
- 接入方式
- 可公开给 AI 的动作
- 是否支持挂载 MCP

建议在产品与 runtime 中统一采用下面这套主上下文抽象：

- `query_only`：只靠查询词即可工作，例如 `contact.search_user`
- `resource_anchor`：靠明确资源 ID 或范围工作，例如 `docId`、`calendarId`、`mail thread`
- `session_anchor`：靠会话或线程上下文工作，例如消息回复、历史线程延续
- `workspace_cache`：只有需要落本地或维持复杂协作缓存时才出现，例如 docs 本地草稿、后续的 base/sheets 深度协作

注意：

- `workspace_cache` 是 runtime 内部协作能力，不是智能助手设置页的主模型
- `docs` 域的主锚点应该是 `docId`，不是“先选工作区”

### 7.3 动作注册表

每个动作定义：

- `actionId`
- `domain`
- `title`
- `description`
- `transport`
- `credentialKind`
- `inputSchema`
- `riskLevel`
- `executor`

其中 `transport` 建议支持：

- `remote_mcp`
- `openapi_http`
- `sdk`
- `builtin_runtime`

### 7.4 域挂载策略

建议采用三类策略：

#### `always_control_plane`

始终挂载控制面 MCP，不挂载大域工具。

#### `lazy_mcp`

当模型或编排器明确判断需要某域时，在下一轮挂载该域 MCP。

#### `registry_only`

永远不暴露底层 MCP，仅通过动作注册表执行。

推荐初始分配：

- `docs`: `lazy_mcp`
- `base`: `lazy_mcp`
- `sheets`: `lazy_mcp`
- `calendar`: `lazy_mcp` 或 `registry_only`
- `messenger`: `registry_only`
- `contact`: `registry_only`
- `mail`: `registry_only`
- `meetings`: `registry_only`

### 7.5 当前确认版域策略

为了后续实现不跑偏，先把每个域的默认打法定死：

- `docs`
  主锚点是 `docId / 文档树节点`
  默认先走动作注册表与受控 runtime
  只有进入“本地草稿协作”时才使用文档工作区
- `calendar`
  主锚点是 `calendarId + 时间范围 + attendeeIds`
  默认全走 runtime/OpenAPI，不做工作区绑定
- `contact`
  主锚点是 `query`
  永远优先动作注册表，不需要 MCP
- `messenger`
  主锚点是 `chatId / threadId`
  先做明确动作，不暴露底层原子工具
- `drive`
  主锚点是 `folderToken / fileToken / query`
  搜索下载先做动作，上传类后续补受控文件选择与落盘
- `base`
  主锚点是 `baseToken / tableId / viewId`
  第一阶段先做结构探索动作，记录级写入放到第二阶段
- `sheets`
  主锚点是 `spreadsheetId / sheetId / range`
  先做读、追加、导出，复杂表格编辑晚一点
- `tasks`
  主锚点是 `taskListId / taskId / userId / dueAt`
  典型 registry-only
- `wiki`
  主锚点是 `spaceId / nodeToken`
  先做结构查询和文档入口，不先做大规模编辑
- `mail`
  主锚点是 `folder / threadId / query`
  搜索、读取、回复优先，发信和草稿后补
- `meetings`
  主锚点是 `meetingId / recordId / time range`
  先做纪要、录制和检索动作

## 8. 对现有实现的直接改造建议

### 8.1 状态模型重构

把当前：

- `mode`
- `personal`
- `developer`
- `managedMcp`

改成三个独立子状态：

- `personalDocs`
- `bot`
- `smartAssistant`

其中 `smartAssistant` 内再细分：

- `auth`
- `domains`
- `actions`
- `domainRuntimeState`
- `runtimePolicy`

### 8.2 UI 迁移边界

建议迁移方式：

#### 个人文档 MCP

迁移现有“个人配置页面与代码”。

保留：

- 个人 MCP Server URL
- 过期提示
- 工具发现结果

移除：

- 开发者 OAuth
- 开发者工具白名单
- 开发者模式文案

#### 飞书智能助手

迁入现有开发者模式配置，但要改造为：

- 开发者应用配置
- 授权状态
- 域能力总览
- AI 使用策略
- 动作目录

不要继续以“允许哪些文档工具”作为页面中心。

### 8.3 开发者工具白名单需要补齐并降级为实现细节

当前 `runtime-feishu-service.ts` 中的 `FEISHU_SUPPORTED_TOOLS` 落后于公开文档，至少缺少：

- `create-doc`
- `get-comments`
- `add-comments`

但更关键的是，这个白名单以后不该再直接暴露成页面主模型，而应变成：

- `docs` 域远程 MCP 能力的一部分实现细节

### 8.4 Header 持久化方式需要收敛

当前实现把远程 MCP 头部语义直接映射到了持久化配置与 `managedMcp` 草稿。

后续建议改为：

- UI 保存的是“授权状态、域开关、能力策略”
- 运行时在 sidecar 内部临时组装：
  - `X-Lark-MCP-UAT` / `X-Lark-MCP-TAT`
  - `X-Lark-MCP-Allowed-Tools`

这样才能避免把底层协议细节暴露到 UI 与共享模型。

## 9. 分阶段实施

### Phase 0：结构拆分

- 页面拆成三个子模块
- `个人文档 MCP` 只保留个人配置
- 开发者配置迁入 `飞书智能助手`
- 共享模型从 `mode` 迁移到三个独立子状态

### Phase 1：智能助手最小可用版本

- 建立 `smartAssistant` 配置模型
- 补齐 docs 域公开 MCP 工具清单
- 增加小控制面 MCP
- 先提供少量动作注册表能力

当前状态：

- 三个子模块已经拆开
- 智能助手有独立应用配置，不再与机器人共用配置
- 智能助手页面已去掉工作区绑定交互
- docs / contact / calendar / base 已有受控 runtime 动作雏形

建议先做：

- 文档搜索 / 读取 / 创建 / 更新 / 评论
- 联系人搜索
- 基础消息发送

### Phase 2：域能力编排

- 补“会话前意图判断 -> 选择域 -> 注入本轮能力”的策略层
- 控制面 MCP 只保留目录、计划与执行入口
- 为 `docs / base / sheets` 增加按轮次补充工具的能力
- 明确“动作优先，域工具兜底”的选择顺序

这阶段的目标不是把所有域都变成 MCP，而是让 AI：

- 优先选动作
- 动作信息不足时，再请求更深一层域能力
- 下一轮会话再带上该域能力，而不是在同一轮里热插拔

### Phase 3：更多 OpenAPI / SDK 域

- `mail`
- `meetings`
- `tasks`
- `wiki`
- `drive`
- `messenger`

这阶段再扩能力，不要一开始就追求全覆盖。

### Phase 4：深度协作工作区

只有在下面这些场景稳定后，才值得补“工作区化”的深度协作层：

- docs 本地草稿协作
- base 结构探索后的批量改写
- sheets 长表编辑与导出

这层是高级能力，不是智能助手接入主链路。

## 9.1 下一批具体落地项

接下来最值得做的不是继续加页面，而是补下面这几件：

1. `动作选择器`
   在会话请求进入 runtime 前，先基于用户问题判断优先走哪个 action/domain。

2. `动作结果摘要器`
   动作执行后先做结构化摘要，避免把 OpenAPI 原始大载荷直接塞给模型。

3. `域注入计划`
   当动作失败或信息不足时，由控制面返回“下一轮建议补哪个域”，而不是让模型自己乱猜。

4. `高风险动作确认`
   对 `calendar.create_event`、后续 `mail.send`、`messenger.send` 之类动作增加显式确认策略。

5. `聊天入口的飞书提示词`
   系统提示中明确告诉模型：
   先查动作目录，能走动作就不要展开整域工具。

## 10. 最终结论

`飞书智能助手` 最合适的定位不是“原飞书文档 MCP 开发者模式改个名字”，而是：

- 一个飞书能力编排中心
- 一个 AI 可控使用飞书能力的入口
- 一个小控制面 MCP + 动作注册表 + 按域挂载的混合系统

简化成一句话：

不要把所有飞书能力永久挂给 AI；只把控制面永久挂给 AI，把大域能力按轮次按需注入，把高频明确动作走受控执行器，而用户只看到“接入后在对话里直接使用”。
