# Runtime Application Hooks

这个目录是 kernel 到应用层的 handoff seam，不是 UI 细节层，也不是 AI vendor adapter 层。

职责：

- 消费统一的 `ConversationTurnOutput`、`ConversationRunSnapshot`、`ConversationRuntimeEvent`
- 为 application projection、delivery、frontend bridge 提供标准扩展点
- 为 startup / restore-state / workspace activation 提供 warmup hook

不负责：

- 直接调用 AI SDK 或厂商 HTTP 协议
- 直接管理数据库驱动或具体持久化 ownership
- 直接承载页面状态机或组件级逻辑

推荐分层：

- AI provider 模块：把 vendor adapter 装成 `AiTurnPort`，不要把 SDK contract 带进 application hook
- application conversation 模块：注册 projection、delivery、snapshot、runtime-event hook
- frontend shell 模块：注册前端桥接 hook 和 warmup hook，处理首屏恢复、流式订阅、view-model 同步

推荐 IOC 挂法：

- `CONVERSATION_OUTPUT_PROJECTION_HOOK`
- `CONVERSATION_OUTPUT_DELIVERY_HOOK`
- `CONVERSATION_SNAPSHOT_PROJECTION_HOOK`
- `CONVERSATION_SNAPSHOT_DELIVERY_HOOK`
- `CONVERSATION_RUNTIME_EVENT_PROJECTION_HOOK`
- `CONVERSATION_RUNTIME_EVENT_DELIVERY_HOOK`
- `CONVERSATION_WARMUP_HOOK`

这些 token 允许多个模块同时注册，最终通过 `buildConversationApplicationPorts(container)` 组合成 fanout 端口。

推荐时序：

1. IOC module 在 `configureServices()` 里注册 hook
2. 宿主从 container 调用 `buildConversationApplicationPorts(...)`
3. conversation runtime 使用组合后的 projection / delivery / warmup 端口
4. frontend shell 在 module host 的 `onStart()` 里触发 warmup 或附加桥接