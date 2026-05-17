# MaomiKernel Support Events

`support/events/` 承载 kernel event 的通用支撑实现。

职责边界：

- 提供 event 构造 helper
- 提供基础 event sink 实现
- 为测试和轻量接入提供最小可用事件能力

不应放在这里的内容：

- runtime 级 projector
- UI / transport 事件桥接
- 领域状态机本身

当前阶段约束：

- 这里提供的是基础事件支撑，不替代 runtime projection
- 默认行为应保持无副作用，可选接入
