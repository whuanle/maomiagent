# MaomiKernel

这个目录是新的共享核心包，用来承载和业务无关的组件、框架、运行时装配与基础能力。后续无论做 Web、桌面、Sidecar，还是别的宿主，都应该优先围绕这里扩展，而不是把框架能力散落回产品端。

当前定位：

- kernel 只承载通用能力，不承载具体业务逻辑
- 宿主通过 ports、routes、projection、tool source 等边界接入
- storage 这类基础设施实现可以存在于显式子路径；provider concrete 必须放在宿主 AI module 或独立 provider 包，不进入 kernel

目录边界：

- ioc：容器、token、module loader
- ai：AI contract、execution profile catalog / policy、shared channel helpers、shared codec helper
- src/core：统一领域模型、ports、状态机、执行引擎、核心算法
- src/host：运行时装配、context assembly、session orchestration、application handoff
- src/adapters：事件、工具、时钟、id generator、sqlite 持久化等具体实现

公共入口规则：

- 根入口 `@maomiagent/kernel` 只暴露 `core` 合同
- IOC 必须通过 `@maomiagent/kernel/ioc` 显式导入
- AI 必须通过 `@maomiagent/kernel/ai` 与 `@maomiagent/kernel/ai/*` 显式导入
- host 与 adapters 必须通过 `@maomiagent/kernel/host/*`、`@maomiagent/kernel/adapters/*` 显式导入
- provider-specific 能力必须留在宿主侧 AI module 或独立 provider 包，通过 kernel contracts / shared helper 接入
- sqlite 这类基础设施适配器必须通过 `@maomiagent/kernel/adapters/persistence/sqlite` 显式导入

当前明确保留的 concrete seam：

- src/adapters/persistence/sqlite

这些 concrete seam 可以继续复用，但它们不是根 API 的一部分；新的宿主如果有自己的 provider、存储、工具执行器，应该优先通过 kernel contract 接入。

建议的引用面：

- 核心合同：`@maomiagent/kernel`
- IOC：`@maomiagent/kernel/ioc`
- AI 合同：`@maomiagent/kernel/ai`
- AI execution profile：`@maomiagent/kernel/ai/execution-profiles`
- Core 合同：`@maomiagent/kernel/core`
- 宿主编排：`@maomiagent/kernel/host`
- 宿主细分能力：`@maomiagent/kernel/host/tools`、`@maomiagent/kernel/host/application` 等
- 通用技术适配器：`@maomiagent/kernel/adapters`
- sqlite 持久化：`@maomiagent/kernel/adapters/persistence/sqlite`

边界细则见 `BOUNDARIES.md`。当前包仍是源码包；如果后续需要发布或单独构建，再补 build pipeline。