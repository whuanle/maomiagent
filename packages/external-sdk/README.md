# @maomiagent/external-sdk

给外部业务系统接入 MaomiAgent 对话能力用的 SDK。

目标很简单：

- 不让接入方自己手拼 `/external/v1/*` 路径
- 不让接入方自己处理 API Key、JSON 错误和 SSE 事件流解析
- 既支持 `npm install`，也支持直接复制单文件接入

## 安装

```bash
npm install @maomiagent/external-sdk
```

或者直接复制这个文件到你的项目里：

- `packages/external-sdk/copy/maomi-external-sdk.js`

## 适用范围

这份 SDK 面向 MaomiAgent 的 external conversation API：

- 模型列表
- 工作区管理
- 简单 AI completion
- 会话管理
- 同步执行
- SSE 流式执行

它不是：

- MaomiAgent 模块 SDK
- MCP SDK
- OpenCode SDK

## 前置条件

1. MaomiAgent sidecar 已启动。
2. external listener 默认地址是 `http://127.0.0.1:4199`。
3. 在 MaomiAgent 设置页的 `External API` 里创建好 API Key。

## 快速开始

### 简单 AI completion

```ts
import { createMaomiExternalClient } from "@maomiagent/external-sdk"

const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: process.env.MAOMI_API_KEY,
})

const workspace = await client.workspaces.ensure("news-site", {
  name: "News Site",
})

const result = await client.ai.complete(workspace.item.workspaceId, {
  messages: [{
    role: "user",
    content: "总结今天的销售日报，输出三点",
  }],
})

console.log(result.item.content)
```

如果你想先判断当前工作区更适合走 simple AI 还是 session execute：

```ts
const capabilities = await client.ai.capabilities(workspace.item.workspaceId)

console.log(capabilities.item.defaultModeId)
```

适用场景：

- 提示词优化
- 摘要、翻译、改写
- 文本分析、报告归纳

如果你不想自己拼 prompt，可以直接走 SDK 内置的 best-practice recipes：

```ts
const result = await client.ai.recipes.promptOptimize(workspace.item.workspaceId, {
  prompt: "你是一个代码审查助手，帮我优化这段提示词",
  userRequirement: "保留原始 Markdown 标题结构",
  selectedChannelId: "main",
  selectedModelId: "gpt-4.1",
})

console.log(result.item.content)
```

这些 recipes 只是 SDK 提供的最佳实践 prompt helpers，本质仍然调用：

- `client.ai.complete(workspaceId, payload)`

服务端没有单独的“摘要任务”“报告分析任务”路由；摘要、分析、提示词优化这类最佳实践都放在 SDK。

如果你希望直接拿到 payload，自行检查、调整或二次封装，可以使用导出的 builder：

```ts
import {
  buildTextSummarizePayload,
  createMaomiExternalClient,
} from "@maomiagent/external-sdk"

const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: process.env.MAOMI_API_KEY,
})

const payload = buildTextSummarizePayload({
  text: "这里是一段需要总结的原文",
  length: "short",
  format: "bullets",
  selectedChannelId: "main",
  selectedModelId: "gpt-4.1",
})

const result = await client.ai.complete("news-site", payload)

console.log(result.item.content)
```

### 同步调用

```ts
import { createMaomiExternalClient } from "@maomiagent/external-sdk"

const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: process.env.MAOMI_API_KEY,
})

const workspace = await client.workspaces.ensure("news-site", {
  name: "News Site",
})

const result = await client.execute(workspace.item.workspaceId, {
  title: "Generate article outline",
  content: "根据这篇中文资讯生成一个 5 点大纲",
  selectedChannelId: "main",
  selectedModelId: "gpt-4.1",
})

console.log(result.text)
console.log(result.message?.parts)
```

### 流式调用

```ts
import { createMaomiExternalClient } from "@maomiagent/external-sdk"

const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: process.env.MAOMI_API_KEY,
})

let finalText = ""

for await (const event of client.executeStream("news-site", {
  content: "把下面这篇文章标题翻译成英文",
})) {
  if (event.event === "message.delta" && event.data.part.type === "text") {
    finalText = event.data.part.text
    process.stdout.write(`\r${finalText}`)
  }

  if (event.event === "done" && !event.data.ok) {
    throw new Error(event.data.failureReason ?? "stream execution failed")
  }
}
```

### 回调式流式消费

```ts
import { createMaomiExternalClient } from "@maomiagent/external-sdk"

const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: process.env.MAOMI_API_KEY,
})

let text = ""

const summary = await client.consumeExecuteStream(
  "news-site",
  {
    content: "总结今天的销售日报",
  },
  {
    onMessageDelta(data) {
      if (data.part.type === "text") {
        text = data.part.text
      }
    },
    onResult(data) {
      console.log("final message:", data.message?.content)
    },
  },
)

console.log(summary.done?.ok, text)
```

## API 概览

```ts
const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: "<your-key>",
})
```

支持的方法：

- `client.health()`
- `client.models.list()`
- `client.workspaces.list(query?)`
- `client.workspaces.create(input?)`
- `client.workspaces.ensure(workspaceId, input?)`
- `client.workspaces.get(workspaceId)`
- `client.workspaces.remove(workspaceId)`
- `client.ai.capabilities(workspaceId, query?)`
- `client.ai.recipes.promptOptimize(workspaceId, input)`
- `client.ai.recipes.summarizeText(workspaceId, input)`
- `client.ai.recipes.analyzeReport(workspaceId, input)`
- `buildPromptOptimizePayload(input)`
- `buildTextSummarizePayload(input)`
- `buildReportAnalyzePayload(input)`
- `client.ai.complete(workspaceId, payload)`
- `client.ai.completeStream(workspaceId, payload)`
- `client.ai.consumeCompleteStream(workspaceId, payload, consumer?)`
- `client.sessions.list(workspaceId, query?)`
- `client.sessions.create(workspaceId, input?)`
- `client.sessions.get(workspaceId, sessionId)`
- `client.sessions.remove(workspaceId, sessionId)`
- `client.sessions.messages.list(workspaceId, sessionId)`
- `client.execute(workspaceId, payload)`
- `client.executeStream(workspaceId, payload)`
- `client.consumeExecuteStream(workspaceId, payload, consumer?)`

## 能力边界

- `client.ai.complete(...)` / `client.ai.completeStream(...)` 是最底层、最稳定的 simple AI transport API。
- `client.ai.recipes.*` 是 SDK 内置的最佳实践 helpers，用来生成 prompt 并直接调用 `client.ai.complete(...)`。
- `buildPromptOptimizePayload(...)`、`buildTextSummarizePayload(...)`、`buildReportAnalyzePayload(...)` 会把最佳实践 prompt 直接暴露成 payload，方便你审查、修改或自行二次封装。
- `client.execute(...)` / `client.executeStream(...)` 才是带 session、连续追问、agent、工具链的复杂执行能力。

## 常用接入建议

### 1. 只做“问一次拿结果”

直接使用：

- `client.workspaces.ensure(...)`
- `client.ai.capabilities(...)`
- `client.ai.recipes.promptOptimize(...)`
- `client.ai.recipes.summarizeText(...)`
- `client.ai.recipes.analyzeReport(...)`
- `client.ai.complete(...)`

这已经够做摘要、翻译、改写、提示词优化、文本问答这类业务。

如果你希望对最佳实践 prompt 有显式控制权，优先使用：

- `buildPromptOptimizePayload(...)`
- `buildTextSummarizePayload(...)`
- `buildReportAnalyzePayload(...)`

然后把返回结果交给 `client.ai.complete(...)`。

### 2. 要做连续追问

第一次执行时不要传 `sessionId`，拿到响应里的 `sessionId` 后，后续继续：

```ts
const first = await client.execute("news-site", {
  content: "先给我一个提纲",
})

const second = await client.execute("news-site", {
  sessionId: first.sessionId,
  content: "把第 2 点展开",
})
```

### 3. 要显式走会话执行

如果你需要保留 session、连续追问，或者希望接入 agent / 工具链，再使用：

```ts
await client.execute("news-site", {
  content: "先给我一个提纲",
})
```

### 4. 要自动挂默认 agent

如果工作区已经配置了默认 agent，可以传：

```ts
await client.execute("research-site", {
  content: "抓取最近一周的行业动态并总结",
  useDefaultAgent: true,
})
```

## 错误处理

SDK 在 HTTP 非 2xx 时会抛出 `MaomiExternalApiError`：

```ts
import {
  MaomiExternalApiError,
  createMaomiExternalClient,
} from "@maomiagent/external-sdk"

const client = createMaomiExternalClient({
  baseUrl: "http://127.0.0.1:4199",
  apiKey: process.env.MAOMI_API_KEY,
})

try {
  await client.models.list()
} catch (error) {
  if (error instanceof MaomiExternalApiError) {
    console.error(error.status, error.code, error.message, error.data)
  }
  throw error
}
```

## 低层协议

当前仓库不再单独维护 external API 文档。

如果你需要看低层协议，以 SDK 源码和 tests 为准；如果你只是在业务系统里接入 MaomiAgent，对接时优先用 SDK，不要直接手写 SSE 解析器。
