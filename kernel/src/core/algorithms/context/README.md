# MaomiKernel Support Context

`support/context` 承载上下文管理相关的通用实现。

第一版已落内容：

- `CompactionEngine`
- `DefaultContextViewBuilder`
- `RoughTokenEstimator`
- `checkPromptOverflow`
- `degradeMessageMedia`
- `pruneOldToolOutputs`

后续计划模块：

- `token-estimator`
- `overflow-checker`
- `compaction-engine`
- `tool-output-pruner`
- `media-degrader`

当前边界：

- 这里只实现 provider-agnostic 的上下文整理
- 不负责 runtime 的 contributor 汇总
- 不负责 provider prompt 编码
- 不直接执行 compaction 编排
