# MaomiKernel Runtime Interactions

`runtime/interactions` 负责把内核里的 `InteractionRecord` 暴露给运行时，并承接外部答复。

当前阶段职责：

- 查询某个 run 上待处理的 interaction
- 维护 session / workspace 维度的 pending interaction host
- 把 answer / reject 写回内核
- 对 permission interaction 维护 session 级 governance，并联动结算同 scope 的待处理项
- 产出后续 resume 描述，供未来的 `run-resume-service` / `session-host` 消费

当前阶段不负责：

- 直接恢复 run 执行
- 接入 UI、HTTP、IPC 或其它 transport
- 重新实现 blocked / resume 状态机

当前已落地补充：

- `PendingInteractionHost` 负责把 `ConversationRuntimeService` 的输出与 `InteractionReplyService` 的即时答复统一投影成 run / session / workspace 三级 pending 状态
- `InteractionBridge` 在有 host 时优先走 host 查询，没有 host 时再回退到 store 的 run 级查询
- `InteractionReplyService` 会把 session 级 permission 决策写入 session metadata，并对当前 session 内同 scope 的 pending permission 做联动 answer / reject

设计约束：

- blocked / answered / rejected 的状态迁移仍在 `kernel/interaction`
- `runtime/interactions` 只做桥接和运行时编排，不反向侵入 kernel
- linked permission 的实际 run 恢复仍由外层 runtime 决定；当前阶段只显式返回 linked resume 描述，不在此处直接驱动 run-resume
