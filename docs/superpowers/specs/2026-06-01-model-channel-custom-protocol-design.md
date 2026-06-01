# 模型渠道协议绑定与 AI SDK Provider 设计

Date: 2026-06-01
Status: Draft for review
Owner: Codex

## 背景

当前模型渠道体系存在两个结构性问题：

1. 新建渠道强依赖预置 `provider` 目录。
   - 用户先选 `提供商`
   - 表单字段来自 provider catalog
   - 渠道保存后主要依赖 `providerType`

2. 运行时对“这条渠道到底该按什么协议、用哪个 SDK provider 处理”没有统一显式模型。
   - 某些渠道天然对应 `OpenAI Responses`
   - 某些渠道更适合 `OpenAI Chat Completions`
   - 某些渠道本质走 `Anthropic Messages`
   - `Gemini` 需要 `@ai-sdk/google`
   - 同一个内置提供商未来还可能支持多种协议

如果继续只依赖 `providerType` 推导运行时，会带来两个问题：

- 会不断出现对 `Kimi`、`MiMo` 这类内置渠道的特判
- 当一个渠道支持多种协议时，用户无法知道系统默认按哪种方式调用，也无法修正

因此本次设计把重点从“新增一个自定义协议入口”升级为：

- 渠道显式记录运行时绑定
- 内置渠道和自定义渠道统一进入同一套协议绑定模型
- UI 明确展示并允许调整协议格式
- 运行时基于 AI SDK provider，而不是手写厂商原始响应协议解析

## 目标

- 保留现有 `预置提供商` 渠道模式。
- 保留并完善 `自定义协议` 渠道模式。
- 自定义协议首批支持：
  - `OpenAI Responses`
  - `OpenAI Chat Completions`
  - `Anthropic Messages`
  - `Gemini Generate Content`
- `Ollama` 不作为独立协议入口；如需接入，统一走 `OpenAI Chat Completions`。
- 所有渠道统一在 `channel.metadata` 中保存：
  - `providerBindingId`
  - `protocolFamily`
  - `apiStyle`
  - `config`
  - `headers`
- 内置渠道在表单中显式显示：
  - `协议格式`，可编辑
  - `SDK Provider`，只读联动展示
- 运行时不再根据 `providerType` 猜协议，而是优先信任 `channel.metadata`。
- `Gemini` 改为通过 `@ai-sdk/google` 接入。
- 自定义渠道支持多组任意 `Header Key / Header Value`。

## 非目标

- 本次不开放任意 `custom/custom` 协议组合。
- 本次不让用户直接选择任意 SDK 包名。
- 本次不把 `Ollama` 作为独立协议类型暴露。
- 本次不重做整个 AI runtime 为完全统一的 AI SDK 主干；只建立统一绑定模型，并先落到当前渠道/运行时边界。
- 本次不处理“内置渠道如何在多条渠道之间自动分配使用策略”的高阶路由问题。

## 方案选择

### 方案 A：继续按 `providerType` 推导运行时

即：

- 内置渠道由 provider catalog 隐式决定运行时
- 自定义渠道单独走另一套逻辑

优点：

- 现有代码改动最小。

缺点：

- `providerType` 与“实际协议”耦合过深。
- 同一 provider 支持多协议时，用户无法感知也无法修正。
- 会持续诱导特判实现。

### 方案 B：只在 provider catalog 上记录默认 SDK/provider 信息

即：

- catalog 提供默认绑定
- channel 不保存运行时绑定
- 每次运行时都重新推导

优点：

- 比方案 A 更规范。

缺点：

- 用户修改后的协议格式无法稳定固化到 channel。
- 历史数据、运行时、编辑态都仍依赖二次推导。
- 不适合“同一 providerType 的不同渠道可以走不同协议”的未来场景。

### 方案 C：在 `channel` 上显式保存运行时绑定，并允许内置渠道修改协议格式

即：

- `channel.metadata` 保存 `providerBindingId + protocolFamily + apiStyle`
- 内置渠道首次从 catalog 推导默认值
- 用户可在表单中调整 `协议格式`
- 保存后运行时永远优先读取 channel binding

优点：

- 绑定关系清晰且稳定。
- 内置渠道与自定义渠道进入统一模型。
- 彻底弱化 `providerType` 对运行时的控制力。
- 支持多协议渠道和兼容网关场景。

缺点：

- 需要扩展表单、metadata 和运行时解析逻辑。

## 结论

采用方案 C。

这是当前最稳的方案，因为它同时解决：

- 自定义协议直连创建
- 内置渠道协议透明且可调
- 运行时不再依赖 `providerType` 猜测
- 后续多协议、多网关兼容的扩展空间

## 核心模型

### 统一渠道绑定

每条渠道统一保存以下字段：

- `providerType`
  - 表示渠道来源于哪个 provider catalog 条目
  - 自定义协议渠道使用 `custom-*` 稳定前缀

- `providerBindingId`
  - 表示运行时应该选择哪个 AI SDK provider 工厂

- `protocolFamily`
  - 表示对外协议家族

- `apiStyle`
  - 表示具体协议风格

### 推荐的首批 binding 枚举

- `providerBindingId`
  - `openai`
  - `anthropic`
  - `google`

- `protocolFamily / apiStyle`
  - `openai / responses`
  - `openai / chat-completions`
  - `anthropic / messages`
  - `google / generate-content`

### 字段职责边界

- `providerType`
  - 只负责“来源”和 catalog 展示，不直接决定运行时

- `providerBindingId`
  - 只负责“用哪个 AI SDK provider 工厂创建运行时”

- `protocolFamily + apiStyle`
  - 只负责“按什么协议语义编码消息、配置工具、处理结构化输出、做返回归一化”

## 页面与交互设计

### 新建渠道模式

保留两个模式：

- `预置提供商`
- `自定义协议`

表单仍保持资源管理页面的一列式结构，不新增 dashboard、说明卡、右侧详情区或状态面板。

### 预置提供商模式

字段顺序调整为：

1. `提供商`
2. `渠道ID`
3. `渠道名称`
4. `Base URL`
5. `协议格式`
6. `SDK Provider`
7. `参数填写说明`
8. provider 参数字段
9. `创建后立即启用`

其中：

- `协议格式` 是可编辑下拉
- `SDK Provider` 是只读展示

### `协议格式` 展示值

首批支持：

- `OpenAI Responses`
- `OpenAI Chat Completions`
- `Anthropic Messages`
- `Gemini Generate Content`

### `SDK Provider` 联动展示值

由 `协议格式` 自动映射：

- `OpenAI Responses` -> `@ai-sdk/openai`
- `OpenAI Chat Completions` -> `@ai-sdk/openai`
- `Anthropic Messages` -> `@ai-sdk/anthropic`
- `Gemini Generate Content` -> `@ai-sdk/google`

用户不可直接修改 `SDK Provider`，避免和协议格式冲突。

### 内置渠道联动规则

新建时：

- 系统先根据 provider catalog 自动带出默认 `协议格式`
- `SDK Provider` 自动联动显示

用户修改 `协议格式` 时：

- 自动重算：
  - `providerBindingId`
  - `protocolFamily`
  - `apiStyle`
- 不清空 `渠道ID / 渠道名称 / Base URL`
- 只按协议需要重置相关默认配置字段

编辑旧渠道时：

- 优先读 `channel.metadata.providerBindingId + protocolFamily + apiStyle`
- 若缺失，再从 catalog 推导默认值
- 保存后写回 metadata 固化

### 自定义协议模式

自定义协议继续作为一级入口，字段顺序为：

1. `协议类型`
2. `渠道ID`
3. `渠道名称`
4. `Base URL`
5. 协议参数字段
6. `自定义 Header`
7. `创建后立即启用`

首批协议类型：

- `OpenAI Responses`
- `OpenAI Chat Completions`
- `Anthropic Messages`
- `Gemini Generate Content`

不单列 `Ollama`。

### 自定义 Header

- 支持多行 `Header Key / Header Value` 动态增删
- 空行不保存
- 保存前去首尾空白
- 存入 `metadata.headers`

## 数据模型设计

### 复用现有 channel 存储

继续复用 `DesktopModelChannelItem`，不新建独立表。

### metadata 扩展

在 `channel.metadata` 中统一约定：

- `source = "provider" | "protocol"`
- `providerBindingId`
- `protocolFamily`
- `apiStyle`
- `deploymentKind`
- `discoveryKind`
- `runtimeSupport`
- `config`
- `headers`

### providerType 约定

预置提供商渠道：

- 保留原 providerType

自定义协议渠道：

- 使用稳定前缀：
  - `custom-openai-responses`
  - `custom-openai-chat-completions`
  - `custom-anthropic-messages`
  - `custom-google-generate-content`

## 默认推导与兼容

### catalog 到 channel 的默认推导

内置渠道首次创建时，根据 catalog 推导默认绑定：

- `package = "@ai-sdk/openai"` -> `providerBindingId = "openai"`
- `package = "@ai-sdk/anthropic"` -> `providerBindingId = "anthropic"`
- `package = "@ai-sdk/google"` -> `providerBindingId = "google"`

若 package 不足以判断，则使用已归一化的协议字段推导：

- `protocolFamily = openai` -> 默认 `openai`
- `protocolFamily = anthropic` -> 默认 `anthropic`
- `protocolFamily = google` -> 默认 `google`

### 旧数据兼容

不做一次性迁移脚本，采用：

- 读时补全
- 写时固化

规则：

- 老渠道缺少 `providerBindingId / protocolFamily / apiStyle` 时，编辑态按 catalog 推导默认值
- 用户保存后，把推导结果正式写入 metadata

## 运行时设计

### 总体原则

运行时不再优先看 `providerType`，而是优先看：

- `providerBindingId`
- `protocolFamily`
- `apiStyle`

### 两层运行时职责

#### 1. Provider Factory

只根据 `providerBindingId` 选择 AI SDK provider 工厂。

首批：

- `openai`
- `anthropic`
- `google`

职责：

- 创建对应的 AI SDK provider/model 入口
- 注入 `apiKey`
- 注入 `baseUrl`
- 注入 `headers`

#### 2. Protocol Adapter

只根据 `protocolFamily + apiStyle` 决定协议语义。

职责：

- prompt 编码
- tool schema 映射
- structured output 配置
- response/event 归一化为内部 message/event 格式

### Gemini 的实现要求

`Gemini Generate Content` 必须改为基于 `@ai-sdk/google` 接入。

明确不采用：

- 手写 Gemini 原始 JSON 响应协议解析作为主实现

### Ollama 的处理方式

本次不为 `Ollama` 建立独立协议和独立 provider binding。

若用户要接入 Ollama：

- 通过 `OpenAI Chat Completions` 协议配置兼容 endpoint

## 模型发现

首批 discovery 策略：

- `openai / responses`
  - `openai-models`
- `openai / chat-completions`
  - `openai-models`
- `anthropic / messages`
  - `manual`
- `google / generate-content`
  - `manual`

本次不为 `Gemini` 增加专门的自动发现协议。

## 校验与保存规则

### 表单校验

- `渠道ID`：沿用现有规则
- `渠道名称`：沿用现有规则
- `Base URL`：允许为空；若填写则做 URL 格式校验
- `API Key`：仅在对应协议需要时必填

### Header 合并

运行时 header 顺序：

1. provider 内置 header
2. 用户自定义 header

若 key 冲突：

- 用户自定义 header 优先

## 测试策略

### 表单测试

- 内置渠道默认协议格式回填
- 修改协议格式时联动写入绑定字段
- 自定义 headers 保存与回填
- 自定义协议模式的 schema 切换

### 服务层测试

- `providerBindingId + protocolFamily + apiStyle` 写入与读取
- 缺失绑定字段时从 catalog 兜底推导
- `resolveRuntimeTarget` 优先读取 channel binding
- `Gemini` runtime target 走 `google`

### 运行时测试

- `providerBindingId -> provider factory`
- `protocol tuple -> protocol adapter`
- `Gemini -> @ai-sdk/google`
- 统一 message/event contract 不因渠道来源不同而变化

## 风险与缓解

### 风险 1：catalog 默认值与真实网关协议不一致

缓解：

- 在内置渠道表单中显式展示 `协议格式`
- 允许用户手动修改
- 保存后固化到 channel metadata

### 风险 2：继续依赖 `providerType` 导致隐藏特判回流

缓解：

- 运行时解析入口强制优先读取 `providerBindingId + protocolFamily + apiStyle`
- `providerType` 仅保留为 catalog 来源标识

### 风险 3：自定义 Header 覆盖认证字段导致调用异常

缓解：

- 明确采用“用户显式 header 优先”的规则
- `headers` 与 `config` 分开存储，降低角色混淆

## 验收标准

- 用户可以创建 `预置提供商` 渠道，也可以创建 `自定义协议` 渠道
- 内置渠道在 `Base URL` 下方能看到默认 `协议格式`
- 用户可以修改内置渠道的 `协议格式`
- `SDK Provider` 会随协议格式联动展示
- 渠道保存后 metadata 中会写入：
  - `providerBindingId`
  - `protocolFamily`
  - `apiStyle`
- 自定义渠道可保存多组 headers
- 运行时优先基于 channel binding 选择 provider 和协议适配器
- `Gemini` 通过 `@ai-sdk/google` 接入
- `Ollama` 不再作为独立协议出现在协议选择中

## 后续子项目边界

本次完成后，下一轮再单独处理：

- 内置渠道如何在多条候选渠道之间进行统一路由分配
- 更彻底的 AI SDK runtime 主干统一化
- 更丰富的协议自动推荐与迁移提示
