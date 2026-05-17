# MaomiKernel Host

`host/` 承载 Maomi 自己的宿主装配与治理。

职责边界：

- 把 Maomi 世界的 agent、tools、context、policy 汇总成 kernel 可消费输入
- 承担 run 的边界编排与宿主职责
- 消费顶层 `ai/` 提供的 route、turn port、execution profile policy
- 在 host boundary 后，把统一领域结构交给 application 层

应放在这里的内容：

- agent registry / policy
- tool federation / visibility policy
- context contributor registry
- session host / run lifecycle / run resume
- compaction coordinator
- interaction bridge
- child session 之上的 task runtime

不应放在这里的内容：

- AI route resolver / execution profile catalog / provider dispatch
- AI SDK 细节
- vendor payload 结构
- 存储底层实现
- stream processor 的核心状态转换
- 把现有系统直接改成走新内核

当前阶段约束：

- 新 host 独立建设，不影响当前系统使用
- 在正式切换前，这里不接入现有生产链路
- host 只能装配和治理，不能反向接管 kernel 的核心状态机
- AI 相关模块固定留在 `kernel/ai/`，host 只消费这些合同与实现

当前已落模块：

- `host/agents`
- `host/application`：已落 `ConversationTurnOutputLoader / ConversationRuntimeService / conversation message protocol`
- `host/tools`
- `host/context`
- `host/interactions`：已落 `PendingInteractionHost`
- `host/sessions`：已落 `SessionExecutionCoordinator / WorkspaceRuntimeHealthPolicy`
- `host/tasks`
- `host/workspace`
- `host/turn-input-assembler.ts`
