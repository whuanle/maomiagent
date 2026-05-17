# MaomiKernel Runtime Context

`runtime/context` 负责 runtime 侧的上下文贡献与汇总。

当前阶段包含：

- `ContextContributorRegistry`
- `InstructionContextContributor`
- `RuntimeContextAssembler`
- `WorkspaceContextContributor`
- `WorkspaceContextContributor` 默认依赖 `runtime/workspace` 薄层解析绑定与策略

这里不负责：

- 历史可见性裁剪
- compaction 算法本身

当前补充：

- `RuntimeContextAssembler` 负责把 contributors、output mode、runtime policies 汇总成 turn input 里的 context 侧装配结果
- `RuntimeTurnInputAssembler` 只继续负责 agent、execution profile、tool catalog 与最终 `TurnInputContext` 组合
