# UI Designer Project Scope Kickoff Design

## Goal

只改造 UI 设计师模块的第一个步骤“项目范围确认”，把当前点击后后台自动等待 AI 的体验改成“先本地确认项目范围，再将首条消息草稿写入输入框，由用户手动发送”。

## Scope

本次只覆盖 `projectScope` 阶段。

- 点击 `项目范围确认` 的“开始设计”或“重新设计”时，不再直接触发后台 kickoff。
- 新增固定的“项目范围确认”模态表单。
- 当已有 `scope.json` 内容时，先让用户选择“沿用已有范围”或“重新选择范围”。
- 提交后先保存 `design/scope.json`，再把整理后的首条消息草稿写入聊天输入框。
- 不改造其他阶段的 AI 表单、阶段结果生成、对话发送和预览逻辑。

## Problem

当前 UI 设计师模块存在两个体验问题：

1. 用户点击“开始设计”后，系统会走后台 kickoff 链路并等待 AI，用户看起来像“点了没反应”，最后容易超时。
2. 项目范围信息没有在第一步通过稳定表单收敛，导致 AI 的第一个问题缺少明确边界，用户也看不到系统实际发送了什么。

## Design

### 1. Entry behavior

`projectScope` 阶段的入口改为本地驱动：

- 如果当前 `scope.json` 为空，直接打开“项目范围确认”模态。
- 如果当前 `scope.json` 已有内容，先弹出一个轻量选择框：
  - `沿用已有范围`
  - `重新选择范围`
- 选择 `沿用已有范围` 时，不需要再打开表单，直接基于当前 scope 生成首条草稿并回填输入框。
- 选择 `重新选择范围` 时，打开“项目范围确认”模态，让用户重新填写。

### 2. Project scope modal

项目范围确认不再依赖 AI 动态生成 schema，而是使用固定表单，字段保持最小必要集：

- `projectType`：项目形态
- `businessType`：业务类型
- `targetPlatform`：目标平台
- `currentObjective`：当前目标
- `deliverySummary`：交付范围

其中：

- `projectType` 需要提供明确选项，至少包含：`Web`、`桌面程序`、`后台系统`、`博客/内容站`、`其他`
- 其余字段可使用简洁输入控件，不增加解释性废话文案
- 模态遵循现有窗口避让规则，使用已有对话框样式体系

### 3. Persistence

用户确认项目范围后，前端先把表单值整理成统一 JSON 结构，保存到 `design/scope.json`。

推荐结构：

```json
{
  "projectType": "Web",
  "businessType": "后台管理系统",
  "targetPlatform": "桌面浏览器优先",
  "currentObjective": "先确定整体信息架构和首批页面",
  "deliverySummary": "输出第一版 UI 方案并引导后续问题"
}
```

本次不引入新的设计文件，也不改动其他阶段文件格式。

### 4. Draft generation

保存成功后，系统只生成首条聊天草稿并回填到左侧输入框，不自动发送消息。

草稿内容由两部分组成：

1. 项目范围摘要
2. 一句固定指令：请 AI 基于以上范围提出第一个最关键的问题，不要一次问很多

示例形态：

```text
项目范围确认：
- 项目形态：Web
- 业务类型：后台管理系统
- 目标平台：桌面浏览器优先
- 当前目标：先确定整体信息架构和首批页面
- 交付范围：输出第一版 UI 方案并引导后续问题

请基于以上范围，先提出第一个最关键的问题，不要一次问很多。
```

用户看到草稿后自行决定是否补充，再点击发送。

### 5. Interaction boundaries

本次交互边界如下：

- `projectScope` 不再调用现有 AI stage schema 生成逻辑
- `projectScope` 也不再在入口动作里直接发送任何消息
- 其他阶段仍保留现有 `openStageDialog -> requestStageSchema -> requestStageResult` 流程
- 左侧聊天区继续复用现有输入框与发送逻辑，只新增“由项目范围确认回填 draft”的能力

## Components

建议新增或调整以下职责：

- `use-ui-designer-shell-state.ts`
  - 增加 `projectScope` 专用入口分支
  - 增加“沿用/重选”状态
  - 增加根据 scope 内容生成草稿并写入 `draftMessage` 的能力
  - 保留其他阶段现有行为
- `components/project-scope-dialog.tsx`
  - 固定项目范围表单
- `components/project-scope-reuse-dialog.tsx`
  - 轻量确认弹窗，用于已有范围时的“沿用/重选”
- `components/workspace-shell.tsx`
  - 挂载新增两个弹窗

如果实现时发现复用现有 `StageDialog` 更稳，也可以不拆完整新文件，但仍需保持“项目范围确认”为固定表单而不是 AI schema。

## Error handling

- 读取或解析 `scope.json` 失败时，按“无已有范围”处理，并允许用户重新填写
- 保存 `scope.json` 失败时，使用现有 `message`/通知能力提示错误，不回填草稿
- 若当前没有工作区或会话不可用，不执行范围确认入口逻辑

## Testing

至少覆盖以下验证：

1. `scope.json` 为空时，点击 `项目范围确认` 进入固定表单，而不是请求 AI schema。
2. `scope.json` 已有内容时，先出现“沿用/重选”。
3. 选择“沿用已有范围”后，会回填首条草稿，但不会自动发送。
4. 提交项目范围表单后，会保存 `scope.json` 并回填首条草稿。
5. 非 `projectScope` 阶段仍走现有 stage dialog 流程。

## Non-goals

- 不改造技术栈、主题、组件模式、布局、页面、规格整理阶段
- 不改造 UI 设计师智能体提示词
- 不改造聊天发送协议、流式响应、超时重试策略
- 不在本次加入更复杂的范围字段、附件分析或模板推荐
