# MaomiKernel Support Persistence

`support/persistence/` 承载新内核的持久化适配实现。

当前阶段目标：

- 先建立稳定目录入口
- 预留 sqlite 实现位置
- 不接入现有运行时数据库

后续将放在这里的内容：

- `SessionStorePort` adapter
- `RunStorePort` adapter
- `TurnStorePort` adapter
- `MessageStorePort` adapter
- `ToolCallStorePort` adapter
- `InteractionStorePort` adapter
- `ContextCheckpointStorePort` adapter
- `UnitOfWorkPort` adapter

当前已落地：

- sqlite store adapters 第一批
- `SqliteUnitOfWorkAdapter`

当前约束：

- 这里只做新内核自己的存储层
- 不复用现有运行时的数据表和服务命名
- 不接入主链，不修改当前系统数据库行为
