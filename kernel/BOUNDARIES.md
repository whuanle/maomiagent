# Kernel Boundaries

这个文件定义 kernel 包的正式公共面，目标是让未来的新系统只依赖稳定边界，而不是依赖源码深路径或产品端约定。

## 1. 稳定核心入口

- `@maomiagent/kernel`
- `@maomiagent/kernel/core`

这些入口只承载通用合同、领域模型与执行引擎。

## 2. 顶层模块入口

- `@maomiagent/kernel/ioc`
- `@maomiagent/kernel/ai`
- `@maomiagent/kernel/ai/execution-profiles`

这些入口和 `src` 并列，不允许重新塞回 `kernel/src`。

## 3. 显式宿主入口

- `@maomiagent/kernel/host`
- `@maomiagent/kernel/host/agents`
- `@maomiagent/kernel/host/application`
- `@maomiagent/kernel/host/context`
- `@maomiagent/kernel/host/interactions`
- `@maomiagent/kernel/host/sessions`
- `@maomiagent/kernel/host/tasks`
- `@maomiagent/kernel/host/tools`
- `@maomiagent/kernel/host/turn-input-assembler`
- `@maomiagent/kernel/host/workspace`

这些入口属于可复用宿主编排层，但不进入根入口，避免调用方在不知情的情况下把整层 host 一起耦合进来。

## 4. 显式适配器入口

- `@maomiagent/kernel/adapters`
- `@maomiagent/kernel/adapters/events`
- `@maomiagent/kernel/adapters/tools`
- `@maomiagent/kernel/adapters/persistence/sqlite`

这些路径承载具体技术实现，但不允许重新汇总到根入口。

## 5. Provider 落点

- vendor / provider-specific adapter、codec、credential resolver 不允许留在 kernel 包内
- 这类实现必须放在宿主侧 AI module，或者独立 provider 包里
- kernel 只保留 AI 合同、routing、execution profile 与共享 helper

## 6. Host 与 Adapters 规则

- `@maomiagent/kernel/host` 只暴露宿主编排能力，不吸收具体存储或 provider 实现
- `@maomiagent/kernel/adapters` 只暴露通用可复用适配器，不在根入口重新导出
- storage、network helper 一律走明确子路径，不走 root 或 host 根入口

## 7. AI 规则

- `@maomiagent/kernel/ai` 只暴露 AI 合同
- AI route resolver、turn port router、execution profile catalog / policy 必须固定在 `ai/` 目录下
- shared helper 通过 `@maomiagent/kernel/ai/channels` 与 `@maomiagent/kernel/ai/codecs` 暴露
- provider-specific adapter / codec 必须放在 kernel 之外的宿主 AI module 或独立 provider 包

## 8. 宿主职责

下面这些职责不应该塞回 kernel 根层：

- 业务数据模型与业务流程编排
- 具体 workspace 生命周期和产品态路由
- 数据库连接创建与释放策略
- AI 凭证、endpoint、租户级配置装配
- 动态工具来源发现、权限裁剪、执行沙箱策略
- 前端投影、事件分发、UI 协议细节

## 9. 维护规则

- 新增公共 API 时，先决定它属于 root、host、adapters，还是宿主侧 provider module
- 如果一个能力需要带 provider / storage / vendor 前缀，默认不进入根入口
- 根入口不能重新导出 `ioc`、`ai`、`host`、`adapters`、`persistence` 之类的实现层
- `core` 不能依赖 `host` 或 `adapters`
- `ai` 不能依赖 `host` 或 `adapters`
- `adapters` 不能依赖 `host`
- 禁止重新新增 `src/ai`、`src/ioc`
- 禁止重新新增 `src/kernel`、`src/runtime`、`src/support` 旧目录
- 禁止重新把 `ai/channels/openai`、`ai/codecs/openai` 这类 provider 目录塞回 kernel
- 修改 `package.json` exports 或目录边界后，必须重新运行 `node verify-public-api.mjs` 与 `typecheck`

这些规则由 `verify-public-api.mjs` 执行校验。