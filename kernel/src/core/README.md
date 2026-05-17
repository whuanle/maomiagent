# MaomiKernel Kernel

`kernel/` 承载新的内核执行闭环本体。

职责边界：

- 定义领域模型
- 定义状态机
- 定义 ports
- 定义 turn planning / run execution / stream processing 的核心协议

应放在这里的内容：

- `Session / Run / Turn`
- `Message / ToolCall / Interaction / ContextCheckpoint`
- `ContextView / PromptEnvelope`
- `TurnPlanner`
- `KernelRunEngine`
- `StreamProcessor`
- `AiTurnPort`
- `ToolExecutorPort`
- store ports / event ports

不应放在这里的内容：

- AI channel / provider SDK 适配
- sqlite 或其它存储实现
- workspace / MCP / skills / task 这些运行时语义
- 现有系统模块装配
- UI / sidecar / server / route

新增边界约束：

- `kernel` 只依赖统一 AI 抽象接口
- `kernel` 不感知 channel
- `kernel` 不感知 `AI SDK`
- `kernel` 不直接负责把结果交给前端；它只产出统一领域结构
- `kernel/ai.ts` 是唯一 AI 合同主路径；旧 `kernel/model/*` 与 `ModelGatewayPort` 兼容层已移除

当前阶段约束：

- 先做 contract 和骨架
- 不接入现有系统运行链路
- 不复用旧产品侧的容器、事件总线和模块组织方式
