# MaomiKernel AI Execution Profiles

`ai/execution-profiles` 是 execution profile catalog 与选择策略的主宿主。

职责边界：

- 维护 execution profile catalog entries
- 基于 session / run / agent 决定 candidate execution profiles
- 为 compaction 选择合适的 execution profile

不负责：

- `channel -> executionProfile` 路由
- `executionProfile -> AiTurnPort` 选路
- AI SDK 接入细节
- provider 兼容别名

当前主模块：

- `ExecutionProfileRegistry`
- `DefaultExecutionProfilePolicyResolver`
- `DefaultCompactionExecutionProfilePolicy`

`ExecutionProfileRegistry` 的 surface 只认 `catalog entry / executionProfiles`，不再暴露 `provider / models` 旧术语。

当前 public surface 只认这三个 execution profile 主模块，不再保留旧的 provider 兼容别名。
