# 模型渠道自定义协议设计

Date: 2026-06-01
Status: Draft for review
Owner: Codex

## 背景

当前模型页的新建渠道弹窗完全依赖预置 `provider` 目录：

- 用户先从 `提供商` 下拉中选择一个 provider
- 表单字段来自 provider catalog 的 `configSchema`
- 渠道保存时以 `providerType + channelId` 作为主键

这条路径适合预置提供商，但不适合下面这类需求：

- 用户希望直接按协议新建渠道，而不是依赖预置 provider
- 用户需要显式区分 `OpenAI Responses` 和 `OpenAI Chat Completions`
- 用户希望配置 `Claude`、`Gemini`、`Ollama` 这类协议入口，即使当前运行时未全部实现

当前桌面端已有的协议能力边界如下：

- 已实现运行时：
  - `openai / responses`
  - `openai / chat-completions`
  - `anthropic / messages`
- 已建模但未实现运行时：
  - `google / generate-content`
  - `ollama / ollama-chat`

因此本次设计的重点不是重写渠道存储，而是在现有渠道体系里增加一条“自定义协议”入口，让用户可以直接创建协议型渠道，并且明确展示哪些协议当前可运行、哪些暂时只能配置。

## 目标

- 在模型页新建渠道弹窗中增加 `自定义协议` 模式。
- 保留现有 `预置提供商` 模式，不破坏已有渠道和现有 provider catalog 逻辑。
- 支持直接创建以下自定义协议渠道：
  - `OpenAI Responses`
  - `OpenAI Chat Completions`
  - `Anthropic Messages`
  - `Gemini Generate Content`
  - `Ollama Chat`
- 自定义协议渠道不依赖预置 provider 列表。
- 渠道继续复用现有存储结构和服务接口，不新建独立数据表。
- 在列表和编辑态中清楚区分“预置提供商渠道”和“自定义协议渠道”。
- 对未实现运行时的协议保持“可保存、不可会话调用”的明确状态。

## 非目标

- 本次不实现 `Gemini Generate Content` 运行时 adapter。
- 本次不实现 `Ollama Chat` 运行时 adapter。
- 本次不开放任意 `protocolFamily/custom`、`apiStyle/custom` 的自由组合。
- 本次不新增独立的自定义协议管理页。
- 本次不重做模型页为 dashboard 或 workbench 布局。
- 本次不引入大段引导文案、说明卡或状态面板。
- 本次不补充云厂商兼容层字段，如 `Project`、`Location`、`API Version`、自定义 Header、部署名等。

## 方案选择

### 方案 A：继续只支持预置 provider

保留现有表单结构，不新增自定义协议入口，只依赖 provider catalog 扩充下拉项。

优点：

- 改动最小。
- 服务层和前端表单都不需要新增模式分支。

缺点：

- 无法满足“直接按协议创建渠道”的核心需求。
- `OpenAI Responses` 与 `OpenAI Chat Completions` 只能隐含在 provider 推导里，用户不可见。
- `Gemini`、`Ollama` 这类协议即使被系统建模，也无法作为一等入口创建。

### 方案 B：在新建渠道弹窗中增加 `预置提供商 / 自定义协议` 双模式

顶部先选择模式；预置模式保留现有 provider 表单，自定义模式改为协议类型驱动的字段表单。

优点：

- 用户心智清晰，能明确区分“选现成 provider”和“直接按协议接入”。
- 自定义协议彻底脱离 provider 目录，不会被 provider 数据源限制。
- 现有渠道服务接口和存储结构可以继续复用。

缺点：

- 表单和编辑回填逻辑会新增一层模式判断。
- 需要补一套协议 schema 常量，而不是完全依赖 provider catalog。

### 方案 C：在 `提供商` 下拉中混入一个“自定义协议”伪 provider

保留现有“提供商”字段，但在下拉中增加一个 `自定义协议` 选项，选中后再显示协议类型下拉。

优点：

- 对表单结构改动较小。

缺点：

- “提供商”和“协议”概念混在一起，用户理解成本更高。
- 编辑态和列表态都更难解释渠道来源。
- 与“自定义协议不依赖预置提供商”的目标不一致。

## 结论

采用方案 B。

原因：

- 它最符合“可以直接新建自定义渠道，只选协议类型，不依赖预置提供商”的目标。
- 它能保留现有 provider 方案，同时为协议入口提供清晰边界。
- 它不会强迫服务层先重写主存储模型。

## 总体设计

本次设计由四部分组成：

1. `渠道创建模式`
   - 新建弹窗顶部新增 `预置提供商` 与 `自定义协议` 两种模式。
2. `协议型表单 schema`
   - 为自定义协议维护一份独立 schema 常量，定义默认 `Base URL`、配置字段、协议元数据与运行时状态。
3. `渠道 metadata 扩展`
   - 在现有 channel `metadata` 中记录来源、协议、发现方式、运行时支持和配置字段。
4. `列表与编辑兼容`
   - 列表中明确显示自定义渠道的协议；编辑态可从 metadata 或 `custom-*` providerType 回填。

## 页面与交互设计

### 新建弹窗结构

新建渠道弹窗继续保持单列表单结构，不增加概览卡、说明卡、右侧详情区或额外状态面板。

字段顺序如下：

1. `创建方式`
2. `提供商` 或 `协议类型`
3. `渠道ID`
4. `渠道名称`
5. `Base URL`
6. 协议或 provider 参数字段
7. `创建后立即启用`

弹窗继续遵循当前窗口避让规则：

- 顶部避让标题栏
- 整体高度上限 `80vh`
- 仅内部内容区滚动

### 预置提供商模式

当选择 `预置提供商` 时：

- 展示现有 `提供商` 下拉
- 继续使用 provider catalog 中的 `configSchema`
- 继续显示 provider 文档链接
- 保持现有创建、编辑和保存语义

### 自定义协议模式

当选择 `自定义协议` 时：

- 隐藏 `提供商` 下拉
- 展示 `协议类型` 下拉
- 协议类型固定为：
  - `OpenAI Responses`
  - `OpenAI Chat Completions`
  - `Anthropic Messages`
  - `Gemini Generate Content`
  - `Ollama Chat`
- 根据协议切换字段 schema 和默认 `Base URL`
- 对当前未实现运行时的协议，在协议选择区域附近显示最小提示：
  - `当前可保存，暂不支持会话调用`

该提示只描述当前状态，不解释内部机制。

## 自定义协议字段设计

### 公共字段

所有自定义协议都使用以下公共表单字段：

- `渠道ID`
- `渠道名称`
- `Base URL`
- 协议配置字段
- `创建后立即启用`

### OpenAI Responses

- 默认 `Base URL`：`https://api.openai.com/v1`
- 配置字段：
  - `API Key`，必填，`secret`
  - `Organization`，可选，`text`
- 元数据：
  - `protocolFamily = "openai"`
  - `apiStyle = "responses"`
  - `deploymentKind = "direct"`
  - `discoveryKind = "openai-models"`

### OpenAI Chat Completions

- 默认 `Base URL`：`https://api.openai.com/v1`
- 配置字段：
  - `API Key`，必填，`secret`
  - `Organization`，可选，`text`
- 元数据：
  - `protocolFamily = "openai"`
  - `apiStyle = "chat-completions"`
  - `deploymentKind = "direct"`
  - `discoveryKind = "openai-models"`

### Anthropic Messages

- 默认 `Base URL`：`https://api.anthropic.com/v1`
- 配置字段：
  - `API Key`，必填，`secret`
- 元数据：
  - `protocolFamily = "anthropic"`
  - `apiStyle = "messages"`
  - `deploymentKind = "direct"`
  - `discoveryKind = "manual"`

### Gemini Generate Content

- 默认 `Base URL`：`https://generativelanguage.googleapis.com/v1beta`
- 配置字段：
  - `API Key`，必填，`secret`
- 元数据：
  - `protocolFamily = "google"`
  - `apiStyle = "generate-content"`
  - `deploymentKind = "direct"`
  - `discoveryKind = "manual"`

### Ollama Chat

- 默认 `Base URL`：`http://127.0.0.1:11434`
- 配置字段：
  - 无必填密钥字段
- 元数据：
  - `protocolFamily = "ollama"`
  - `apiStyle = "ollama-chat"`
  - `deploymentKind = "local-native"`
  - `discoveryKind = "ollama-tags"`

## 数据模型设计

### 复用现有渠道存储

本次不新增自定义渠道专用表，继续复用现有 `DesktopModelChannelItem` 存储。

自定义协议渠道仍然使用现有服务接口：

- `createChannel(providerType, input)`
- `updateChannel(providerType, channelId, input)`

### metadata 扩展

在 channel `metadata` 中约定以下字段：

- `source = "provider" | "protocol"`
- `protocolFamily`
- `apiStyle`
- `deploymentKind`
- `discoveryKind`
- `runtimeSupport`
- `config`

其中：

- `config` 继续保存可序列化配置值
- `runtimeSupport` 保存当前解析后的支持状态，便于列表和编辑态直接展示

### providerType 约定

预置提供商渠道：

- `providerType` 继续使用原 provider catalog 中的 providerType

自定义协议渠道：

- 使用稳定前缀命名，例如：
  - `custom-openai-responses`
  - `custom-openai-chat-completions`
  - `custom-anthropic-messages`
  - `custom-google-generate-content`
  - `custom-ollama-chat`

这样做的目的：

- 不破坏现有服务层主键结构
- 让旧接口仍能区分不同协议渠道
- 允许编辑态在 metadata 缺失时按 `custom-*` 兜底识别

## 列表与编辑设计

### 列表展示

模型渠道列表做两个调整：

- `提供商` 列对自定义协议渠道显示 `自定义`
- 新增或改造一列显示 `协议`

协议列显示用户可读名称，例如：

- `OpenAI Responses`
- `OpenAI Chat Completions`
- `Anthropic Messages`
- `Gemini Generate Content`
- `Ollama Chat`

这样用户可以同时看到：

- 该渠道来源是预置还是自定义
- 该渠道实际走的协议是什么

### 编辑回填

编辑渠道时按以下规则识别模式：

1. `metadata.source === "protocol"` 时，按自定义协议回填
2. 若 `metadata.source` 缺失，但 `providerType` 命中 `custom-*`，仍按自定义协议回填
3. 其它情况默认按预置提供商模式回填

如果遇到异常数据：

- 能从 metadata 恢复的，优先恢复
- 无法安全识别协议的，进入保守回退，不自动覆盖原数据

## 运行时与模型发现

### 运行时支持状态

以下协议保存后标记为已实现运行时：

- `OpenAI Responses`
- `OpenAI Chat Completions`
- `Anthropic Messages`

以下协议保存后标记为未实现运行时：

- `Gemini Generate Content`
- `Ollama Chat`

未实现运行时的协议行为：

- 允许保存
- 允许出现在渠道列表
- 允许进入后续模型管理链路
- 在会话调用相关链路中继续显示为未实现，不伪装成可用

### 模型发现

- `OpenAI Responses` 与 `OpenAI Chat Completions`：
  - 使用 `openai-models`
- `Anthropic Messages`：
  - 使用 `manual`
- `Gemini Generate Content`：
  - 使用 `manual`
- `Ollama Chat`：
  - 使用 `ollama-tags`

首版不为 `Anthropic` 与 `Gemini` 自定义协议提供远端模型自动发现。

## 校验与状态切换

### 表单校验

- `渠道ID` 沿用现有规则
- `渠道名称` 沿用现有规则
- `Base URL` 可为空；为空时使用协议默认占位提示
- 若填写 `Base URL`，执行基本 URL 格式校验
- 密钥字段仅在对应协议需要时必填

### 模式切换

从 `预置提供商` 切换到 `自定义协议` 时：

- 重置 provider 相关字段
- 清空旧 provider config
- 回填自定义协议的默认字段

从一个自定义协议切换到另一个协议时：

- 重置协议配置字段
- 回填新协议的默认 `Base URL` 和 schema 默认值

这样可以避免 schema 残留导致错误保存。

## 实现范围

### 前端

- 调整 [ChannelFormModal.tsx](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/models/components/ChannelFormModal.tsx)
- 为模型页补充自定义协议 schema 常量与表单映射
- 补充模型页列表协议列展示
- 补充新增文案与校验文案

### 服务层

- 扩展渠道 metadata 写入与读取
- 兼容 `custom-*` providerType
- 在列表、编辑和运行时解析时优先读取自定义协议信息

### 测试

- 表单测试：
  - 模式切换
  - 协议切换
  - 默认值回填
  - 未实现协议提示
- 页面测试：
  - 自定义渠道创建
  - 列表协议列展示
  - 编辑回填
- 服务层测试：
  - metadata 写入
  - `custom-*` 兼容识别
  - runtimeSupport 与 discovery 元数据解析

## 风险与缓解

### 风险 1：自定义协议与 provider catalog 语义冲突

缓解：

- 明确区分 `source = provider | protocol`
- 自定义协议使用独立 schema 常量，不复用 provider catalog 字段定义

### 风险 2：老数据或异常数据在编辑时被误识别

缓解：

- 优先依赖 `metadata.source`
- `custom-*` 只作为兜底
- 无法可靠识别时使用保守回退，不自动覆盖原数据

### 风险 3：用户误以为 Gemini 与 Ollama 已经可在会话中调用

缓解：

- 在协议选择区给出最小提示
- 列表与运行时链路继续保留未实现状态显示

## 验收标准

- 用户可以在新建渠道弹窗中选择 `预置提供商` 或 `自定义协议`
- 用户可以直接创建五种预定义协议渠道
- 自定义协议渠道保存后能正确写入 metadata
- 自定义协议渠道在列表中能显示 `自定义` 来源和正确的协议名
- 已保存自定义协议渠道可正确进入编辑态并回填对应模式与字段
- `Gemini Generate Content` 与 `Ollama Chat` 在首版中明确为“可保存、暂不支持会话调用”

## 开放问题

当前无阻塞性开放问题。

后续可能的增量方向：

- 为 `Gemini Generate Content` 增加正式运行时 adapter
- 为 `Ollama Chat` 增加正式运行时 adapter
- 在自定义协议中逐步增加兼容云厂商所需的扩展字段
