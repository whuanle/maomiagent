# MaomiKernel Runtime Sessions

`runtime/sessions` 承载 run 的跨边界编排。

当前阶段已落内容：

- `CompactionCoordinator`
- `SessionHost`
- `RunLifecycleService`
- `RunResumeService`

后续计划模块：

- 暂无新增计划模块，后续按 Phase 6 / Phase 7 继续扩展

当前边界：

- 这里只负责 runtime 侧边界协调
- 不反向接管 kernel 内部 turn / processor 状态机
- compaction 的算法和 artifact 生成仍在 `support/context`
