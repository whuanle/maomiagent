# Kernel Package Naming

这个包只讨论 kernel 自己的命名和边界，不再围绕任何具体产品端目录组织。

固定目录：

- kernel/ioc
- kernel/ai
- kernel/src/core
- kernel/src/host
- kernel/src/adapters

固定原则：

- `core` 表示业务无关的共享核心，不放具体业务词汇
- `ioc` 和 `ai` 是和 `src` 并列的顶层模块，不再塞回 `kernel/src`
- `host` 表示围绕一次会话执行、上下文装配、交互桥接和应用投影的宿主编排层
- `adapters` 表示具体技术实现，例如事件发布、工具执行、持久化、时钟与 id 生成器
- 根入口只保留核心合同；ioc、ai、host、adapters、provider-specific 能力统一走显式子路径
- concrete 命名必须放进自己的域里，例如 `ai/channels/openai`、`adapters/persistence/sqlite`
- 新增跨端能力时，优先加在 kernel 包或宿主适配层，避免重新长出产品端耦合
- 具体宿主实现继续通过 ports、adapters、routes、metadata 边界接入