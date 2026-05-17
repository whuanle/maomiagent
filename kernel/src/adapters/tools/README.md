# MaomiKernel Support Tools

`support/tools/` 负责提供通用的工具执行实现。

职责边界：

- 实现 `ToolExecutorPort`
- 执行工具输入 schema 校验
- 处理工具 timeout / cancel
- 归一化工具输出

当前第一版实现：

- `LocalToolExecutor`
- `validateToolInputSchema`
- `runToolWithTimeout`
- `normalizeToolOutput`

当前不做：

- tool federation
- MCP / skills / builtin 的来源装配
- product-level permission policy
