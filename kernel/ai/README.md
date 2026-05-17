# MaomiKernel AI Module

`ai/` 直接承载新的 AI 渠道模块边界。

这里负责：

- AI 渠道实现的抽象入口
- 具体渠道 adapter 的注册与适配接口
- 后续 SDK 或 `fetch` 的具体封装位置

当前主入口：

- `ai/channels/*`
- `ai/codecs/*`
- `ai/contracts`

这里不负责：

- session state machine
- channel route policy
- application projection
