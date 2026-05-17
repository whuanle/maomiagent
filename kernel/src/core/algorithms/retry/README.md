# MaomiKernel Support Retry

`support/retry/` 承载 AI 渠道 / transport 侧通用的 retry 支撑逻辑。

职责边界：

- 解析底层响应里的 retry 相关 header
- 提供可复用的 backoff 计算
- 提供可复用的 retry decision helper

不应放在这里的内容：

- runtime 侧策略装配
- 某个具体渠道 adapter 的完整 HTTP 实现
- kernel 内部 turn / run 状态机

当前阶段约束：

- 这一层只提供支撑能力，不直接决定业务策略
- AI 渠道 adapter 可以选择性接入，不要求默认启用
