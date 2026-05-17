# MaomiKernel Runtime Tools

`runtime/tools` 负责 runtime 侧的工具编目与可见性治理。

当前阶段包含：

- `DynamicToolRuntime`
- `DefaultToolVisibilityPolicy`

工具来源仍然只是 source，不反向污染 kernel。

当前新增约束：

- Tool source 需要带 `kind / sourceId / signature`
- 运行时统一把 builtin、MCP、skills、plugins、session overlays 等转换为 tool list
- 不再额外建设独立 tool gateway
