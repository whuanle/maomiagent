# Chat Context Compaction Status Hint Design

Date: 2026-06-05

## Goal

在 AI 对话触发上下文压缩时，为用户提供一个轻量、即时、非侵入式的状态提示，避免压缩期间看起来像“卡住”或“卡死”。

本设计只补足输入区附近的运行中提示，不改变消息流结构，不把压缩过程渲染成一条聊天消息，也不新增新的页面级状态面板。

## Problem Statement

当前聊天链路已经具备上下文压缩能力，但压缩发生时，用户前端感知不足：

- 压缩不是一条用户可见消息
- 压缩期间流式正文可能短暂停顿
- 用户只能看到界面还停在发送中的状态，容易误以为应用卡死

这不是压缩机制本身错误，而是压缩阶段缺少靠近输入区的即时反馈。

## Confirmed Constraints

- 提示只能放在输入区附近，不能进入消息流。
- 提示必须保持轻量，不能干扰流式正文和消息结构。
- 压缩完成或失败后，提示应自动消失。
- 页面文案遵守最小必要原则，只描述当前状态，不解释内部机制。

## Non-Goals

- 不新增聊天消息类型。
- 不修改 timeline、checkpoint、message schema 或会话持久化结构。
- 不在本轮引入“压缩完成”或“压缩失败”的额外结果文案。
- 不单独为压缩新增按钮、浮层、右侧详情区或全局提示条。
- 不调整发送、停止、继续执行等现有交互语义。

## Recommended Approach

推荐在现有 composer 底部状态区增加一条轻量 `contextCompressionStatus` 提示，并使用“runtime event 立即点亮、session detail 最终校准”的双源策略。

这样可以同时满足两个目标：

- 压缩一开始就让用户看见，不必等待 detail reload
- 最终状态仍由 session detail 校准，避免事件乱序导致残留提示

## User Experience

### Placement

提示放在输入区附近，复用 composer 底部已有的状态信息区域，与当前 token/context 预算信息同层级展示。

不进入消息列表，不占用首屏主要视觉焦点，不生成独立卡片或横幅。

### Copy

仅显示最小必要提示：

- 中文：`正在压缩上下文`
- 英文：`Compacting context`

不展示内部术语，不说明实现原理，不输出“系统正在如何工作”的解释文案。

### Lifecycle

- 压缩开始时显示
- 压缩进行中持续显示
- 压缩完成时立即消失
- 压缩失败时立即消失

不保留“已自动压缩”“压缩失败”等收尾结果文案，避免把内部过程放大成额外视觉负担。

## State Sources

### Primary source: runtime events

前端应优先使用 runtime event 作为“立即出现”的来源：

- `compaction.started`：立刻显示提示
- `compaction.completed`：立刻清除提示
- `compaction.failed`：立刻清除提示

这样可以消除“压缩已经开始，但 detail reload 还没回来”的空窗期。

### Fallback source: session detail

session detail 继续作为状态兜底和校准来源。

只要满足以下任一条件，也应判定为压缩中：

- 最新 run 的 `boundary.kind === "awaiting_compaction"`
- `currentContextBudget.compaction.status === "running"`

如果最新 detail 已经不满足上述条件，则应清除提示，即使之前本地曾收到过旧的 `compaction.started`。

### Consistency rule

状态优先级固定为：

1. runtime event 负责即时切换
2. session detail 负责最终校准

这个顺序是设计约束，不能反过来只依赖 reload，否则仍会出现“看起来卡住”的体验问题。

## Frontend Integration

### Data flow

推荐沿用当前聊天页状态链路：

`runtime event -> workspace pane state -> session detail / transient session UI state -> pane controller -> composer props -> input-area hint`

压缩提示应作为独立的前端展示态存在，不依赖消息内容推断。

### State placement

最小改动范围放在现有 chat workspace pane 状态树内，和下列状态同层管理：

- selected session detail
- sending / stopping flags
- runtime event merge
- active detail reload fallback

不要为此新开页面级 store，也不要把压缩态偷偷编码进消息数据。

### View placement

composer 视图层只负责展示一个轻量状态对象，例如：

```ts
type ContextCompressionStatus = {
  tone: "warning"
  label: string
  title: string
}
```

但在本设计里，展示时只需要“压缩中”这一种可见状态。完成和失败不需要额外展示态。

## Runtime Event Merge Behavior

当前前端对 compaction 相关 runtime event 更偏向“标记需要 reload”。本设计要求补上一层本地即时状态合并能力。

### Required behavior

- 收到 `compaction.started` 后，本地立即进入压缩中
- 收到 `compaction.completed` 或 `compaction.failed` 后，本地立即退出压缩中
- 如果随后 detail reload 返回的状态与本地临时状态冲突，以更新的 detail 为准

### Allowed fallback

如果某些 compaction 事件当前仍需要触发 detail reload 来更新完整会话细节，仍可保留 reload 行为；但提示出现和消失不能完全依赖那次 reload。

也就是说：

- reload 可以保留
- 但提示的可见性不能再只靠 reload 驱动

## Edge Cases

### Event reordering

如果旧的 `compaction.started` 晚于新的非压缩态 detail 到达，应以后到达的最新 detail 为准，不重新点亮提示。

### Reload failure

如果已经收到 `compaction.started`，但一次 detail reload 失败，提示不应因为这次 reload 失败而提前消失。

### Fast compaction

如果压缩开始和结束非常接近，提示允许短暂闪现后消失，不引入额外的最短展示时长。

### Session switching

提示严格绑定当前选中会话：

- 切换到其他会话时，不带出前一个会话的压缩提示
- 切回原会话时，重新根据该会话的最新本地状态和 detail 决定是否显示

### Stop action coexistence

压缩提示只是说明“当前仍在处理”，不改变停止按钮和发送区的既有语义。如果当前 run 仍处于 active，原有停止路径继续有效。

## Error Handling

- compaction 提示属于辅助 UX，不得影响真实会话执行路径
- 前端本地压缩态合并失败时，必须安全回退到现有 detail-driven 行为
- 不允许因为提示逻辑异常而阻断消息发送、停止、交互回复或 detail reload

## Testing

至少补充以下回归覆盖：

1. 收到 `compaction.started` 时，输入区附近出现提示
2. 收到 `compaction.completed` 时，提示自动消失
3. 收到 `compaction.failed` 时，提示自动消失
4. 当 detail 显示 `awaiting_compaction` 或 `compaction.status === "running"` 时，即使事件缺失也能显示提示
5. 事件乱序时，不会残留旧提示
6. 切换会话时，提示不会串会话
7. 提示不进入消息流，不影响现有 streaming message 渲染测试

## Rollout Notes

- 这是一次聊天体验补强，不改变压缩机制本身
- 目标是减少“像卡死”的误判，而不是把压缩做成显眼的新交互
- 如果后续验证仍觉得太隐蔽，可以在下一轮评估更明显的输入区状态条，但不在本设计内

## Success Criteria

- 触发上下文压缩时，用户能在输入区附近及时看到“正在压缩上下文”
- 提示不会进入消息流，也不会改变消息结构
- 压缩完成或失败后，提示自动消失
- 即使 detail reload 稍慢，用户也不会在压缩阶段误以为界面完全卡死
