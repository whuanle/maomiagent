# Chat Execution Bundle Border Simplification Design

## Background

聊天消息在“执行摘要 / 查看过程”展开后，会展示已完成的步骤、思考片段、工具调用片段和文件变更片段。

当前这一块虽然信息完整，但视觉上存在明显的“卡片套卡片”问题：

- 最外层 execution bundle 有边框和容器感
- 内部 reasoning/tool trace 自己也有边框、圆角和浅背景
- 展开后层层盒子叠在一起，阅读时会显得重、挤、碎

用户希望先做一轮最小调整：

- 仅最外层保留一圈边框
- 外层不需要背景色
- 内部层级只保留分隔线
- 内部不再使用边框和背景色

## Problem Statement

当前执行过程区域的主要问题不是信息密度不够，而是容器层级过多：

1. 外层 bundle 和内层 execution rows 同时使用盒子视觉，导致嵌套感太强。
2. reasoning/tool trace 的 summary/body 也继续使用卡片式表达，使展开后的内容像多个面板拼接。
3. 用户注意力会被重复的边框和底色打断，而不是自然顺着步骤往下读。

## Goals

- 保留最外层 execution bundle 的边界感，确保整块内容仍然有独立区域。
- 去掉内部 reasoning/tool trace 的卡片感。
- 内部步骤和层级只通过分隔线、留白和缩进来表达。
- 不改动执行摘要的文案、信息结构和交互逻辑。

## Non-Goals

- 不改聊天区其他消息块的边框风格。
- 不改普通工具 trace 在 bundle 外的展示样式。
- 不改组件结构和渲染逻辑。
- 不在这一轮重做图标、字体或整体色板。

## Scope

只调整“对话完成后底部的执行摘要 / 查看过程”这一块。

重点目标是：

- `details.chat-direct-message-execution-bundle`
- 其内部展开后的 `execution-row / execution-summary / execution-body`

不扩散到：

- 普通消息正文
- bundle 外单独出现的 reasoning/tool trace
- 其他聊天辅助面板

## Proposed Approach

推荐采用最小样式改造方案。

### 1. 外层 bundle 保留唯一边框

`chat-direct-message-execution-bundle` 继续保留：

- 圆角
- 外边框
- 基本内边距

但移除：

- 外层背景色
- 额外阴影或面板化强调

目标效果是：

- 整块内容有边界
- 但不会像“浅色卡片底上再放小卡片”

### 2. 内部 execution rows 去卡片化

展开后的每个 reasoning/tool row：

- 去掉自身边框
- 去掉背景色
- 去掉圆角

改成：

- 相邻 row 之间仅用 `border-top` 分隔
- 通过上下留白维持呼吸感

### 3. summary / body 仅用线条表达层级

每个 row 内部的 summary 和 body：

- 去掉 box background
- 去掉独立边框

只保留：

- summary 与 body 之间一条轻分隔线
- 合理的垂直间距

这样可以保留“标题在上、内容在下”的层级，同时避免重复盒子。

## Visual Rules

最终视觉规则如下：

- 外层：一圈边框，无背景
- 内层 step：无线框、无背景、无圆角
- step 与 step 之间：一条细分隔线
- step header 与 step body 之间：一条更轻的细分隔线
- 层级表达依靠缩进、排版和线条，不依靠面板堆叠

## Implementation Notes

本轮优先只改样式，不改 DOM 结构。

预计主要改动点：

- `apps/desktop/MaomiAgent/src/mainview/modules/chat/chat-page.css`
- 如确有必要，只对 `direct-session-message.tsx` 做极小 className 收口，但默认不动结构

优先调整这些样式段：

- `.chat-direct-message-execution-bundle`
- `.chat-direct-message-execution-bundle > .chat-direct-message-execution-summary`
- `.chat-direct-message-execution-bundle > .chat-direct-message-execution-body`
- `.chat-direct-message-execution-row`
- `.chat-direct-message-execution-summary`
- `.chat-direct-message-execution-body`

## Testing Strategy

至少验证以下场景：

1. 执行摘要收起态
   - 外层仍有边界
   - 没有额外背景块

2. 执行摘要展开态
   - 内部步骤之间改为线条分隔
   - 不再出现多层边框盒子

3. reasoning + tool trace 混合内容
   - 不会因为去掉内边框导致层级完全糊掉

4. 文件修改区仍能自然衔接在 bundle 内部

## Success Criteria

- 展开后的“查看过程”不再像卡片套卡片。
- 最外层仍然清楚地包住整个执行摘要区域。
- 内部步骤阅读更顺，不再被重复边框和背景打断。
- 不影响现有展开/收起交互和内容结构。
