# Chat Thinking Noise Reduction Design

Date: 2026-06-14

## Goal

优化 AI 对话页在默认开启 `think` 时的执行体感，避免普通执行任务在流式过程中频繁暴露细碎 reasoning，形成“执行一点就开始想、执行一点又开始想”的割裂观感。

本次目标不是关闭 thinking，也不是隐藏复杂任务的思考过程，而是把 thinking 从“高频碎流”收束成“和任务复杂度匹配的可读过程”：

1. `think` 默认保持开启。
2. `plan`、全托管、编排类和明显复杂任务继续保留完整 thinking 可见性。
3. 普通执行任务自动降噪，减少 reasoning 对连续执行体感的打断。
4. 前后端共享同一套 thinking detail level 判定，避免 UI 和运行时各自猜测任务复杂度。

## User-approved direction

已经确认的交互和实现方向：

- `think` 默认仍然是打开的，不改默认开关。
- 普通执行任务和重任务要区分处理。
- 区分逻辑采用“两层结合”：
  - 先看 `agent / composer mode`
  - 再由任务意图做补充修正
- 降噪同时作用于两层：
  - UI 展示层减少碎 reasoning 打断
  - 运行时输出层减少细粒度 reasoning 直推

## Confirmed findings

### Current loop behavior is expected, but the presentation is too granular

当前 `MaomiAgent` 的核心执行链路本质上是标准 agent loop，而不是单轮“先想完再统一执行”的 one-shot 模式。

`KernelRunEngine.executeUntilBoundary()` 在 [kernel/src/core/turn/kernel-run-engine.ts](/e:/workspace/MaomiAgent/kernel/src/core/turn/kernel-run-engine.ts:543) 中明确采用：

1. 规划 turn
2. 执行模型流
3. 执行工具
4. 如有需要则继续下一轮

这说明“执行期间会再次进入思考”本身不是 bug，也不是和 `opencode` 的核心区别。问题更多出在：当前 reasoning 的事件粒度、投递频率和 UI 呈现方式过于直接，导致用户能持续感知到细碎的内部思考流。

### Current default makes reasoning highly visible

当前工作区默认设置里：

- `thinkingEnabled: true`
- `managedExecutionEnabled: false`

定义位于 [apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts:159)。

这意味着 reasoning 默认会进入对话可见链路，而不是像 `opencode` CLI 那样默认隐藏，只有显式开启 `--thinking` 才显示。

### Current UI renders reasoning as a first-class live block

当前 UI 在 [apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message.tsx](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message.tsx:1099) 中把 reasoning 作为一类独立消息片段渲染。

现状特点：

- 有单独的 `Reasoning / 思考` 眉标
- 流式状态下会显示 live badge
- reasoning body 在有内容时可展开或直接内联

这对 `plan` 和复杂任务是有价值的，但对普通执行任务会把模型的碎 reasoning 直接暴露成用户可感知的高频界面波动。

### Existing metadata already has good extension points

当前会话和 run metadata 已经能携带：

- `thinkingEnabled`
- `managedExecutionEnabled`
- `selectedAgentId`
- `composerMode`
- execution profile metadata

其中 [desktop-ai-conversation-runtime.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts:1948) 已经会把 `thinkingEnabled` 写回 execution profile metadata，[managed-execution.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/conversation/managed-execution.ts:16) 也已经存在基于意图的执行策略识别。

这意味着本次不需要发明全新的任务复杂度框架，而是应复用已有 agent、mode、run metadata 和意图检测入口，新增一个统一的 thinking detail level 判定层。

## Non-goals

- 本次不关闭 `think` 默认开关
- 本次不移除 reasoning 数据持久化能力
- 本次不重写 kernel turn loop 或工具调用协议
- 本次不改变 plan mode、全托管、编排类任务的完整 thinking 可见性
- 本次不优化 provider 自身的推理 token 产出策略
- 本次不引入新的 dashboard、状态面板或额外解释性页面结构

## Recommended approach

推荐采用“共享策略层 + 运行时降噪 + UI 分级展示”的组合方案。

核心原则：

- 统一先判断任务需要哪一档 thinking detail level
- 再让运行时和 UI 都消费这一档位
- 普通任务默认不再把 reasoning 当作实时正文持续刷出
- 重任务仍保留完整可见 reasoning，保证可观测性和调试能力

推荐引入三档 detail level：

- `full`
- `compact`
- `minimal`

## Design

### 1. Add a shared thinking detail level strategy

新增一个共享的 `thinking detail level` 判定函数，建议放在 `shared/conversation` 附近，作为会话策略的一部分，而不是埋进 UI 或 provider 实现细节里。

输入建议包含：

- `selectedAgentId`
- `composerMode`
- 当前会话 / run metadata
- 用户文本
- attachment count

输出为：

- `full`
- `compact`
- `minimal`

统一判定顺序：

1. **先看 agent / mode**
   - `plan` 直接 `full`
   - `managed-autopilot`、`autopilot-orchestrator`、`redblue-orchestrator`、`planner` 等托管编排与规划类 agent 默认 `full`
   - `concise`、微信轻量执行器、飞书文档助手这类以直接结果为导向的 agent 默认降档
2. **再看任务意图补充修正**
   - 明显复杂的实现、修复、排查、持续执行、多阶段任务可上调到 `full`
   - 轻问答、轻查询、一次性小操作可下调到 `minimal`
3. **最后保留显式开关兜底**
   - `thinkingEnabled === false` 时，不展示 reasoning
   - 后续如有手动“显示完整思考”的显式用户开关，也可以在这里强制提升到 `full`

推荐默认矩阵：

- `plan` / 编排 / 托管 / 明显复杂修复：`full`
- 普通执行型 primary agent：`compact`
- `concise`、轻问答、轻只读分析、单次小操作：`minimal`

这样可以保证系统行为稳定：

- 不需要 UI 自己猜“这个任务是不是复杂”
- 不需要运行时自己猜“哪些 reasoning 应该丢”
- 同一会话从创建到展示都能沿用同一档位

### 2. Persist the resolved detail level into session and run metadata

`thinking detail level` 不能只存在于一次渲染判断里，否则续跑、恢复、轮询更新和历史回放会产生不一致。

建议在会话开始或续跑时就把解析结果写入 metadata，例如：

- `conversationSettings.thinkingDetailLevel`
- 或 run-level `thinkingDetailLevel`

推荐行为：

- session-level 记录“本次会话默认 thinking 档位”
- run-level 记录“当前这轮实际使用的 thinking 档位”

这样做的好处：

- UI 加载历史消息时能知道应该用哪种展示强度
- 运行时在后续多轮里不必重复从头猜测
- 未来如需在任务执行中根据阶段升级 / 降级，也能通过 run metadata 记录真实状态

落点建议：

- [apps/desktop/MaomiAgent/src/shared/conversation/managed-execution.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/conversation/managed-execution.ts:1)
- [apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts:1948)
- 如有必要补充 `shared/desktop-conversation.ts` 类型定义

### 3. Keep full reasoning for complex work

`full` 档位不应改变现有 reasoning 基本行为。

保留内容：

- reasoning 流式事件
- live 状态
- 完整 reasoning body
- 已有的折叠 / 展开 UI

适用场景：

- `plan` 模式
- 全托管执行
- 编排 agent
- 复杂实现 / 排查 / 修复
- 用户明确要求详细分析过程

原因是这些场景里 thinking 本身就是产品价值的一部分。用户不是被它打扰，而是需要它来理解 agent 当前在做什么、为什么这样做、接下来会做什么。

### 4. Compact ordinary execution tasks at the runtime layer

对 `compact` 档位，运行时仍然允许 reasoning 存在，但不应把每个碎 delta 都立即原样推送给上层 UI。

推荐策略：

- 在 reasoning 流进入 `TextStreamProcessor` / runtime event projector 后增加短窗口合并
- 合并粒度以“阶段性块”为主，而不是字符级 / 极短文本级
- 流式过程中允许刷新一个短 preview，但不要持续扩展长正文块
- turn 完成后写入最终合并后的 reasoning part

可以理解为：

- provider 还是在吐 reasoning
- runtime 也还是在接 reasoning
- 但用户不再看到“每一小口 reasoning 都对应一次界面抖动”

这层不建议直接删除 reasoning 数据，原因是：

- 会影响复杂问题回放和内部调试
- 可能破坏某些 provider 的 interleaved reasoning 连续性预期
- 后续如果用户切换到“查看完整过程”，就没有可回放内容

因此 `compact` 的本质是**合并与节流**，不是**丢弃**。

### 5. Minimize low-value reasoning for light tasks

对 `minimal` 档位，目标是让普通轻任务“看起来像在连续执行”，而不是像在不断自言自语。

推荐运行时行为：

- 流式期间默认不向 UI 投递 reasoning 正文
- 如确有最终 reasoning，可在 turn 完成后保留一条很短的合并摘要
- 若 reasoning 为空或仅包含低价值碎片，则不必在 UI 单独表现为 reasoning 块

仍然保留的内容：

- turn 状态
- 工具执行状态
- 最终答案

这样用户会感知成：

- 正在处理
- 正在执行命令 / 工具
- 结果出来了

而不是：

- 想一句
- 做一步
- 想两句
- 再做一步

### 6. Make UI rendering depend on the resolved detail level

UI 层应消费 `thinking detail level`，而不是只根据“有没有 reasoning part”决定怎么画。

建议展示规则：

#### 6.1 `full`

保持现状：

- reasoning 作为一类独立 execution row
- live 时显示 live badge
- reasoning body 可内联或展开

#### 6.2 `compact`

流式期间：

- 只显示轻量“思考中”状态
- 最多显示一条短预览
- 不默认展开 reasoning 正文

完成后：

- 允许显示合并后的 reasoning 块
- 默认折叠
- 仅在用户查看过程时展开正文

目标是让普通执行任务的主视线仍落在：

- 当前工具在做什么
- 有没有结果
- 最终回答是什么

而不是落在 reasoning body 上。

#### 6.3 `minimal`

流式期间：

- 不显示 reasoning 正文块
- 只显示执行中状态或工具过程

完成后：

- 如果存在高价值 reasoning 摘要，可附在完成执行 bundle 或折叠块内
- 如果没有高价值摘要，则不额外渲染 reasoning row

### 7. Prefer completed execution bundles over live reasoning for ordinary tasks

当前消息列表已经存在“完成执行 bundle”的展示思路。对于 `compact` 和 `minimal` 档位，应进一步强化这一原则：

- 普通任务优先突出“做了哪些事、最后完成了什么”
- 不优先突出“中途每一段 reasoning 文本”

具体来说：

- 如果一条 assistant message 同时包含 reasoning、tool traces 和 final answer
- 对 `compact` / `minimal` 档位，应尽量把 reasoning 收进 bundle 或折叠区
- 让用户首先看到 final answer 和已完成步骤摘要

这样更符合“执行连续性”的感知目标。

### 8. Reuse existing intent detection instead of inventing a new classifier

当前 [managed-execution.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/conversation/managed-execution.ts:16) 已存在一组面向执行意图的正则和策略判断：

- `EXECUTION_INTENT_RE`
- `ORCHESTRATION_INTENT_RE`
- `PROJECT_SCAFFOLDING_RE`
- `QUESTION_FRAMING_RE`
- `ACTION_REQUEST_RE`

本次不建议再独立造一份“thinking 复杂度分类器”。更好的做法是：

- 复用现有意图判断的输入结构
- 只在需要时补充轻任务 / 重任务的分层规则
- 确保托管执行、普通执行、轻问答三者的分界标准尽可能一致

这样能减少未来策略漂移。

### 9. Keep explicit opt-out behavior intact

当前已有 `thinkingEnabled === false` 的路径，特殊模式如 UI Designer 也已有关闭 thinking 的局部配置。

这些行为必须保持不变：

- 如果会话 / 工作区明确关闭 thinking，则所有 detail level 都应退化为“不展示 reasoning”
- `full / compact / minimal` 只在 `thinkingEnabled !== false` 时生效

避免引入新的隐式 override，把用户已有明确设置冲掉。

## Error handling

- 如果 metadata 中缺失 `thinkingDetailLevel`，UI 和运行时都应回退到按当前输入重新判定，而不是报错
- 如果 detail level 值非法，应回退到 `compact`
- 如果 `thinkingEnabled === false`，UI 不得因为 detail level 为 `full` 又重新显示 reasoning
- 如果 provider 持续输出 reasoning，但运行时合并窗口异常失败，应回退为安全的完整投递，而不是丢失 turn 内容
- 如果历史消息中 reasoning 结构不完整，`compact` / `minimal` 模式仍应能安全渲染已有文本，不依赖新增 metadata 才能工作

## Testing

至少覆盖以下验证：

1. 普通问答会话
   - `think` 默认开启
   - 流式过程中不再刷长 reasoning 正文
   - 仍能正常得到最终回答

2. 普通执行任务
   - 工具过程仍可见
   - reasoning 不高频打断主视线
   - 完成后可查看合并后的过程摘要

3. `plan` 模式
   - 继续显示完整 reasoning
   - 不误降噪为 `compact` 或 `minimal`

4. 全托管 / 编排类 agent
   - reasoning 仍完整可见
   - run metadata 和 UI 表现一致

5. `concise` / 轻问答场景
   - 自动进入更低噪声档位
   - 不出现明显的 reasoning 刷屏

6. `thinkingEnabled = false`
   - 不论 agent / intent 如何，reasoning 都不显示

7. 历史会话回放
   - 缺少 `thinkingDetailLevel` 的旧会话仍能正常显示
   - 不会因为新策略导致旧消息结构崩坏

8. 特殊模式回归
   - UI Designer
   - Feishu 文档助手
   - 微信轻量执行器
   - 这些模式的现有 thinking 行为不被误伤

## Risks and trade-offs

- 如果只在 UI 侧做降噪，底层 reasoning 事件仍会高频产生，token 和状态波动问题仍在
- 如果运行时过度合并 reasoning，可能影响复杂问题的可观测性和排障
- agent / intent 规则如果写得过宽，普通修复任务可能被错判为轻任务，导致 thinking 过度压缩
- 引入 detail level 后，session、run、UI 三层都要理解这一字段，若命名或来源不统一，容易再次产生策略漂移

## Affected surfaces

核心建议影响面：

- `apps/desktop/MaomiAgent/src/shared/conversation/managed-execution.ts`
- `apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts`
- `kernel/src/core/processor/text-stream-processor.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message-reasoning.ts`
- 如需要补充历史兼容，也可能涉及 runtime event projection 相关文件

## Rollout notes

- 第一阶段优先把 detail level 和 UI 展示路径打通，确保普通任务先降噪
- 第二阶段再把运行时 reasoning 合并和节流收紧到更合适的粒度
- 若上线后仍出现“普通任务 reasoning 过多”，应优先继续调节 detail level 判定和 compact 合并窗口，而不是立即关闭 think 默认开关
