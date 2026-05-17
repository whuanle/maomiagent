# MaomiKernel Support Persistence SQLite

`sqlite/` 用于承载第一版持久化适配实现。

当前阶段：

- 先固定 sqlite 入口目录
- 已定义最小表名常量与 schema
- 已落地第一版 `SqliteSessionStoreAdapter`
- 已落地第一版 `SqliteRunStoreAdapter`
- 已落地第一版 `SqliteTurnStoreAdapter`
- 已落地第一版 `SqliteMessageStoreAdapter`
- 已落地第一版 `SqliteContextCheckpointStoreAdapter`
- 已落地第一版 `SqliteInteractionStoreAdapter`
- 已落地第一版 `SqliteToolCallStoreAdapter`
- 已落地第一版 `SqliteUnitOfWorkAdapter`
- 已补通用 metadata JSON mapper，供后续 store adapter 复用
- 已补通用 JSON value mapper，供 interaction / tool call 这类 unknown payload 复用
- 已补通用 KernelError JSON mapper，供 message / tool call 这类错误载荷复用
- 已补可嵌套的 sqlite transaction helper，供 `UnitOfWork` 与 message append 共用
- 已补 turn usage 行映射规则，避免产生不完整 usage record
- 已补 message parts 的 payload 编解码与 `part_order` 续写规则
- 已补 checkpoint 的 message 外键映射与按最近时间返回规则
- 已补 interaction 的 pending 过滤与按最近更新时间返回规则
- 已补 tool call 的 save / patch 分离语义与按开始时间返回规则

当前不做：

- 不创建真实数据库
- 不执行 migration
- 不连接现有系统日志库、任务库或会话库
