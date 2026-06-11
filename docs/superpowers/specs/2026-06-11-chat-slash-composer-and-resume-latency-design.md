# Chat Slash Composer And Resume Latency Design

Date: 2026-06-11

## Goal

优化 AI 对话页两个直接影响体感的问题：

1. `/` 触发的技能命令列表不要嵌进输入框内部，已选命令也不要继续占据输入框内容区。
2. 同一会话内需要多轮推进时，第一轮结束后进入第二轮的等待感要明显缩短，至少让界面尽快进入“继续执行中”的可感知状态。

## User-approved interaction direction

已经确认的交互约束：

- `/` 命令列表显示在输入框外部
- 命令列表不需要背景和卡片容器边框
- 选中命令后，已选命令显示为输入框上方的一行紧凑命令条/标签
- 不再把大组件塞进输入框内部

对命令列表的默认实现假设：

- 命令列表采用输入框外的悬浮层
- 不挤压 textarea 内部内容区
- 允许继续使用键盘上下选择、Enter 或 Tab 选中、Esc 关闭

## Confirmed findings

### Slash command behavior

当前 `direct-session-composer` 的 `/` 列表渲染在 `chat-direct-composer-input-stage` 内部，和 `Input.TextArea` 共享同一输入区视觉层级。

当前选中命令的方式仍然是：

- 用 `applyDirectSessionComposerSlashCommand` 把 `/command` 文本直接写回草稿
- 把光标放到插入后的命令后方

这意味着：

- 命令列表虽然是单独节点，但视觉上仍占据输入框内部空间
- 命令选择结果仍是“把命令文本写进草稿”
- 后续若要展示 richer 命令 UI，就会继续和输入文本冲突

### Second-turn wait behavior

已确认不是“恢复时把整段上下文都重新塞给模型”导致的主要等待：

- managed resume packet 只带最近 4 条可见消息预览
- 因此上下文规模不是目前最可疑的大头

更可疑的链路是同步等待叠加：

1. 服务端 `answerInteraction` / `rejectInteraction`
   - `interactionBridge.answer/reject`
   - `runResumeService.resume`
   - `loadRunOutput`
   - `loadSessionDetail`
2. 前端在交互答复成功后
   - `applySessionDetail`
   - 串行 `reloadSessions`
   - 串行 `reloadComposerAgents`
   - 串行 `reloadComposerModels`

另外，普通 `sendMessage` 在请求发出前会立刻标记 `sendingSessionIds` 并启动 fallback polling，但 `answerInteraction` / `rejectInteraction` 没有对“续跑中的第二轮”设置同等级别的早期发送态，因此用户更容易感知为“卡了一段时间才开始下一轮”。

## Non-goals

- 本次不改动 slash command 的数据来源和技能发现机制
- 本次不引入新的页面级 dashboard、说明卡或侧边状态面板
- 本次不改动核心 conversation runtime 协议
- 本次不做 provider 层的模型性能优化
- 本次不重做消息列表或 interaction dock 的整体结构

## Recommended approach

推荐采用“前端独立命令选择态 + 续跑路径提前进入进行中状态”的组合方案。

核心原则：

- 输入框只承载自然语言正文，不承载命令 UI 容器
- 已选命令从草稿文本中抽离为独立状态
- 交互续跑先保证用户尽快看到“继续执行中”，再异步补齐次要数据刷新

## Design

### 1. Composer command model

把 slash command 从“草稿文本的一部分”调整为“composer 独立选择态”。

新增一个轻量的已选命令视图模型：

- `selectedSlashCommand?: ChatSlashCommandOption`

它只存在于 composer 层和发送组装层，不写入 session detail，也不改动历史消息存储结构。

结果是：

- 输入框正文继续由 `draft` 维护
- 命令选择由单独状态维护
- 渲染和提交都不必再依赖把 `/command` 字符串写进 textarea

### 2. Slash match and apply behavior

`resolveDirectSessionComposerSlashMatch` 继续负责在用户输入 `/` 时给出匹配列表。

但 `applyDirectSessionComposerSlashCommand` 的行为改为：

- 从草稿里移除当前激活的 slash token
- 保存选中的 command 到独立状态
- 把光标放回清理后的正文位置
- 不再把 `/command` 文本写回草稿

如果用户已经选择了命令，再次输入 `/`：

- 允许重新打开列表并替换当前命令
- 不允许在同一条消息中累积多个命令标签

这个约束更符合“输入框上方一行紧凑命令条”的已确认方向。

### 3. Composer layout changes

`DirectSessionComposer` 布局调整为三层：

1. 附件区
2. 已选命令条
3. 输入框区

slash 命令列表从输入框内部移出，作为 composer 外层的悬浮层显示，视觉上挂靠输入框，但不进入 textarea 内容盒。

布局要求：

- 已选命令条在输入框上方，单行、紧凑、高度稳定
- 命令列表悬浮在输入区上方或下方均可，但必须位于输入框外部
- 列表不使用卡片底色和边框容器
- hover 和 active 状态用轻量底色区分即可

### 4. Selected command tag behavior

已选命令条展示最小必要信息：

- `/{insertText}`
- `label`
- 移除按钮

默认不展示长描述，避免把“紧凑标签”重新做成大块面板。

交互规则：

- 点击移除按钮后，清空已选命令，焦点回到输入框
- 发送成功后，已选命令状态清空
- 草稿清空不自动移除已选命令，除非用户主动删掉或消息已发出

### 5. Message assembly on submit

提交时在前端发送层组装最终文本：

- 如果存在已选命令，则按 `/{insertText}` 加正文拼接
- 如果正文为空，则只发送 `/{insertText}`
- 如果两者都存在，则发送 `/{insertText}\n\n{draft}`

这样可以保持后端兼容性：

- 当前后端仍然接收普通文本 prompt
- 不需要立刻改 conversation runtime 的消息协议
- slash command 最终仍能以文本命令形式进入模型上下文

### 6. Resume latency optimization

本次只处理“第二轮开始慢”的最直观路径，不扩散到 provider 深层优化。

#### 6.1 Frontend early sending state for interaction resume

当用户提交 `answerInteraction` 或 `rejectInteraction` 时，前端应像 `sendMessage` 一样尽早设置当前 session 的 sending 标记，并启动 fallback polling。

目标：

- 用户点击答复后立即看到会话重新进入运行态
- 消除“点击后没反应，过一阵才开始第二轮”的空窗

#### 6.2 Decouple non-critical reloads from the first visible continuation

交互答复成功后，前端不应把以下刷新作为阻塞第二轮体感的关键路径：

- `reloadSessions`
- `reloadComposerAgents`
- `reloadComposerModels`

处理方式：

- 先 `applySessionDetail(response.detail)` 并清除或维持正确的 sending 状态
- 把上述 reload 改成非阻塞 follow-up
- 优先保证消息流和运行状态先更新到界面

如需保守实现，可至少把这三个 reload 并行化，而不是继续串行执行。

#### 6.3 Keep current backend resume contract, but avoid misdiagnosis

本次不重写 backend `answerInteraction -> resume -> loadRunOutput` 主链路。

原因：

- 当前证据不足以证明主要耗时来自上下文膨胀
- 续跑包只带 4 条最近消息预览，暂不支持“上下文过大是主因”的判断
- 先改善前端早期可见反馈和后置刷新串行等待，收益更确定

如果这一轮优化后仍有明显等待，再继续追加更细粒度的后端时序诊断。

## Error handling

- 命令列表匹配为空时，直接关闭列表，不显示空面板
- 若已选命令因数据变更失效，发送前应忽略该命令并清空本地选择态
- 交互续跑失败时，sending 状态必须正确回滚
- 非关键 reload 失败只通过现有通知能力提示，不影响本轮消息已经更新到界面
- fallback polling 停止逻辑必须与成功、失败、停止路径保持一致，避免残留轮询

## Testing

至少补以下回归覆盖：

1. 输入 `/pla` 时，命令列表仍能正常匹配并打开
2. 选中命令后，不再把 `/command` 文本写回草稿
3. 选中命令后，会出现输入框上方的紧凑标签
4. 移除已选命令后，标签消失且可继续输入正文
5. 提交时会把已选命令和正文正确组装成最终文本
6. 交互答复发出后，session 会立即进入 sending/active 感知状态
7. `answerInteraction` / `rejectInteraction` 成功后，非关键 reload 不阻塞主消息更新
8. 失败路径下 sending 状态和 polling 都能正确清理

## Risks and trade-offs

- 已选命令从草稿里抽离后，composer 会新增一份局部状态，需要保证和外部 `draft` 生命周期不打架
- 如果未来需要一条消息支持多个命令，本次“单命令标签”模型需要再扩展
- 非阻塞 reload 会让 agent/model 下拉的数据在极短时间内稍晚刷新，但这是可接受的次级代价

## Rollout notes

- 这是一次以交互体感为目标的前端优先优化
- 用户可见变化应当是：
  - slash 命令更干净
  - 输入框更纯粹
  - 第二轮开始得更快、更明确
- 如果发布后仍有人反馈第二轮慢，再基于现有链路追加服务端 resume 分段耗时诊断
