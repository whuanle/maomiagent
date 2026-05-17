# MaomiKernel Runtime Workspace

`runtime/workspace/` 承载 runtime 侧最薄的一层工作区语义。

职责边界：

- 从 session / run metadata 解析工作区绑定
- 提供工作区上下文可见性与访问策略
- 为 runtime context / session host 等上层模块提供统一 workspace 入口

不应放在这里的内容：

- workspace 文件系统实现
- git / patch / revert / archive
- 现有系统主链里的 workspace service

当前阶段约束：

- 这里只做薄层 contract 和策略，不接入现有系统主链
- 不把复杂 workspace 语义提前塞进 kernel
