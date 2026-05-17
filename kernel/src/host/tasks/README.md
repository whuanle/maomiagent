# MaomiKernel Runtime Tasks

`runtime/tasks` 承载建立在 child session 之上的任务运行时。

当前阶段包含：

- `TaskRuntime`
- `TodoRuntime`
- `CheckpointRuntime`

这里不负责：

- child session 的底层执行
- kernel 内部 turn / processor 状态机
