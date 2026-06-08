# UI Designer Chat Interaction Unification Design

## Goal

把 `UI 设计师` 模块里的用户交互统一收敛到 AI 对话页现有的 interaction 渲染链路，不再在 `UI 设计师` 内维护独立的表单/提问壳。`项目范围确认` 也并入同一套聊天交互机制。

## Status

这份设计替代 `2026-06-08-ui-designer-project-scope-kickoff-design.md` 中“本地固定模态 + 回填输入框”的方向。

原因：

- 用户已经明确要求 `UI 设计师` 复用 AI 对话页组件，避免再造一套核心逻辑。
- 当前仓库已经具备成熟的 `question / form / permission` interaction 渲染与提交流程。
- 继续保留 `StageDialog` 作为主交互壳，会导致 `UI 设计师` 与 AI 对话页形成两套并行交互系统。

## Problem

当前 `UI 设计师` 仍然存在两类交互分裂：

1. 聊天区负责发消息、显示 AI 回复、回答 interaction。
2. `UI 设计师` 自己又维护 `StageDialog + StageFormRenderer` 这套阶段表单机制。

这会带来几个问题：

- 同样是“让用户确认信息”，页面里出现两套不同入口与提交流程。
- 后续如果要支持更多 AI 生成表单、确认卡、阶段问答，逻辑会分散在聊天模块和 `UI 设计师` 模块两处。
- 用户心智混乱：有时在聊天里答，有时在模态里填。

## Existing reusable foundation

仓库内已经有可复用的对话交互体系：

- `question`：聊天交互问题卡
- `form`：聊天交互表单卡
- `permission`：聊天交互权限卡

其中 `form` 已支持：

- `text`
- `textarea`
- `select`
- `multiselect`
- `boolean`

并且已有现成前端组件：

- `apps/desktop/MaomiAgent/src/mainview/modules/chat/components/assistant-interaction-form-card.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/conversation-interaction-dock.tsx`

`UI 设计师` 应直接接入这套机制，而不是继续维护独立的阶段表单模态。

## Design

### 1. Interaction model

`UI 设计师` 从第一步 `项目范围确认` 开始，就统一使用聊天 interaction。

交互规则：

- 需要用户确认单个问题时，使用 `question`
- 需要用户填写结构化信息时，使用 `form`
- 需要用户批准某个敏感操作时，使用 `permission`

`项目范围确认` 使用 `form`，不再使用本地专用模态。

### 2. Entry flow

用户点击中间阶段面板的 `项目范围确认 -> 开始设计` 时：

1. 不再打开 `StageDialog`
2. 不再打开本地 `project-scope-dialog`
3. 不再自动把草稿写入输入框
4. 改为在当前 UI 设计师会话内触发一个 `form interaction`

该 interaction 由 AI 或 UI 设计师运行时生成，前端在聊天区直接渲染。

### 3. Project scope form content

`项目范围确认` 的表单结构仍保持最小必要字段：

- `projectType`：项目形态
- `businessType`：业务类型
- `targetPlatform`：目标平台
- `currentObjective`：当前目标
- `deliverySummary`：交付范围

其中前三项继续支持“推荐选项 + 可自由输入”的意图，但这次不在 `UI 设计师` 本地硬编码成另一套专用表单 UI。

建议实现方式：

- 如果现有 `form` interaction 协议足够，可将前三项先编码成 `select` 或 `multiselect + allowCustom`
- 如果现有 `form` 协议不足以表达“点击推荐项并可继续改写输入”的交互，则应扩展聊天 interaction form 渲染协议本身，再由 `UI 设计师` 复用该扩展结果

关键原则是：

- 扩展应发生在通用聊天 interaction form 体系
- 不应只在 `UI 设计师` 内做专属控件

### 4. Submission flow

用户在聊天区提交 `项目范围确认` 表单后：

1. 前端复用现有 `answerInteraction(interactionId, response)` 提交表单值
2. 后端收到表单结果，写入 `design/scope.json`
3. 刷新 `UI 设计师` 设计文件与阶段状态
4. 基于最新 `scope.json` 继续推进会话

推进方式可以是：

- 继续提出第一个关键问题
- 或进入下一阶段的结构化表单

但都必须留在同一条会话内完成，不再跳回本地模态链路。

### 5. Stage behavior

中间阶段面板保留，但职责收缩：

- 展示阶段标题、状态、摘要
- 提供“开始设计 / 重新设计”入口
- 负责切换右侧详情展示

它不再承担主要表单承载职责。

也就是说：

- 中间栏是阶段导航
- 左侧聊天区是唯一交互入口
- 右侧是当前阶段详情

### 6. Scope of change

本次重构首先覆盖：

1. `项目范围确认`
2. `UI 设计师` 现有 `StageDialog` 主链路的去中心化

后续阶段如 `技术栈确认`、`视觉与交互基线`、`组件模式确认`、`页面与模块确认` 等，也应逐步迁移到同一套聊天 interaction 机制。

## Architecture changes

### Keep

- `ConversationRail`
- 聊天会话、发送消息、停止消息、回答 interaction 的现有逻辑
- 中间阶段状态面板
- 右侧阶段详情面板
- `design/*.json` 与 `design-spec.md` 的阶段产物模型

### Replace / de-emphasize

- `UI 设计师` 专用 `StageDialog`
- `UI 设计师` 专用固定表单模态主链路
- “先回填输入框，再手动发送”作为主流程

### Reuse

- `AssistantInteractionFormCard`
- `AssistantInteractionQuestionCard`
- `ConversationSessionInteractionDock`
- `answerInteraction / rejectInteraction`
- `ConversationInteractionEntry.request.kind === "form"` 协议

## Implementation direction

### Option A: Runtime-generated interaction form

由 UI 设计师后端运行时在合适时机直接生成 `form interaction request`，前端只负责渲染和回传。

优点：

- 最符合现有 chat interaction 架构
- 前后端职责清晰
- `UI 设计师` 页面最轻

这是推荐方向。

### Option B: Frontend converts stage schema into interaction form

前端仍调用当前 `requestStageSchema`，但不是弹模态，而是把 schema 转成聊天 interaction form。

问题：

- 本质仍保留 `UI 设计师` 专属 schema 链路
- 只是换了一个表面容器
- 没有真正统一核心逻辑

不推荐。

## Error handling

- interaction 生成失败时，通过现有通知机制提示错误
- `scope.json` 写入失败时，interaction 提交不应静默成功
- 若当前没有会话或工作区不可用，不触发阶段 interaction
- 若 interaction 已存在待处理项，再次点击“开始设计”应避免生成重复 interaction

## Testing

至少覆盖以下验证：

1. `项目范围确认` 入口不再依赖本地专用模态
2. 点击 `项目范围确认` 会进入聊天 interaction 流，而不是回填输入框
3. 聊天区能渲染 `form interaction`
4. 提交 `项目范围确认` 表单后会写入 `design/scope.json`
5. 提交后会刷新中间阶段摘要与右侧详情
6. `UI 设计师` 后续阶段仍可继续复用同一 interaction 机制

## Non-goals

- 本次不重新设计整个聊天 interaction 协议之外的 UI 壳
- 本次不引入第三套 UI 设计师专属表单 DSL
- 本次不继续扩张本地固定弹窗方案
- 本次不依赖外部仓库实现作为主方案来源
