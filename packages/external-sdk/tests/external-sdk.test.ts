import { describe, expect, it } from "bun:test"
import {
  MaomiExternalApiError,
  buildPromptOptimizePayload,
  buildReportAnalyzePayload,
  buildTextSummarizePayload,
  createMaomiExternalClient,
} from "../copy/maomi-external-sdk.js"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  })
}

function sseResponse(chunks: string[], init?: ResponseInit) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
    },
    ...init,
  })
}

describe("@maomiagent/external-sdk", () => {
  it("adds auth headers and executes sync requests against external v1", async () => {
    const requests: Array<{
      url: string
      method: string
      authorization: string | null
      body: string | null | undefined
    }> = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      apiKey: "maomi_ext_secret",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("Authorization"),
          body: typeof init?.body === "string" ? init.body : null,
        })

        return jsonResponse({
          workspaceId: "news-site",
          sessionId: "ses-001",
          sessionCreated: true,
          session: {
            sessionId: "ses-001",
            workspaceId: "news-site",
            title: "Generate article outline",
            memoryEnabled: true,
            messageCount: 2,
            status: "idle",
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
            messages: [],
          },
          userMessageId: "msg-user-1",
          assistantMessageId: "msg-assistant-1",
          message: {
            messageId: "msg-assistant-1",
            sessionId: "ses-001",
            role: "assistant",
            status: "complete",
            content: "outline ready",
            parts: [{
              type: "text",
              partId: "text-1",
              text: "outline ready",
            }],
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
          text: "outline ready",
          usedUpstream: true,
        })
      },
    })

    const response = await client.execute("news-site", {
      title: "Generate article outline",
      content: "Generate a short outline",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })

    expect(response.text).toBe("outline ready")
    expect(requests).toEqual([{
      url: "http://127.0.0.1:4199/external/v1/workspaces/news-site/execute",
      method: "POST",
      authorization: "Bearer maomi_ext_secret",
      body: JSON.stringify({
        title: "Generate article outline",
        content: "Generate a short outline",
        selectedChannelId: "main",
        selectedModelId: "gpt-4.1",
      }),
    }])
  })

  it("calls the stateless simple ai completion endpoint", async () => {
    const requests: Array<{
      url: string
      method: string
      body: string | null | undefined
    }> = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : null,
        })

        return jsonResponse({
          item: {
            content: "summary ready",
            usedUpstream: true,
            resolvedChannelId: "main",
            resolvedModelId: "gpt-4.1",
          },
        })
      },
    })

    const response = await client.ai.complete("news-site", {
      messages: [{
        role: "user",
        content: "总结这份日报",
      }],
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })

    expect(response.item.content).toBe("summary ready")
    expect(requests).toEqual([{
      url: "http://127.0.0.1:4199/external/v1/workspaces/news-site/ai/completion",
      method: "POST",
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: "总结这份日报",
        }],
        selectedChannelId: "main",
        selectedModelId: "gpt-4.1",
      }),
    }])
  })

  it("fetches stateless simple ai capability metadata", async () => {
    const requests: string[] = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async (url) => {
        requests.push(String(url))
        return jsonResponse({
          item: {
            workspaceId: "news-site",
            available: true,
            defaultModeId: "simple_completion",
            resolvedChannelId: "main",
            resolvedModelId: "gpt-4.1",
            modes: [{
              modeId: "simple_completion",
              label: "Simple Completion",
              description: "Stateless direct AI.",
              requiresSession: false,
              supportsStreaming: true,
              supportsFollowUp: false,
              supportsAgentExecution: false,
              recommended: true,
            }],
          },
        })
      },
    })

    const response = await client.ai.capabilities("news-site", {
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })

    expect(response.item.defaultModeId).toBe("simple_completion")
    expect(requests).toEqual([
      "http://127.0.0.1:4199/external/v1/workspaces/news-site/ai/capabilities?selectedChannelId=main&selectedModelId=gpt-4.1",
    ])
  })

  it("builds best-practice payloads for simple ai recipes", async () => {
    const optimize = buildPromptOptimizePayload({
      prompt: "优化一下这段提示词",
      userRequirement: "保留原始结构",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })
    const summarize = buildTextSummarizePayload({
      text: "第一段\n\n第二段",
      length: "short",
      format: "bullets",
    })
    const report = buildReportAnalyzePayload({
      report: "收入下降 10%，退款率上升。",
      focus: "风险和建议动作",
      outputFormat: "sections",
    })

    expect(optimize.selectedChannelId).toBe("main")
    expect(optimize.selectedModelId).toBe("gpt-4.1")
    expect(optimize.messages[0]?.role).toBe("system")
    expect(optimize.messages[1]?.content).toContain("优化一下这段提示词")
    expect(summarize.messages[1]?.content).toContain("Length: short")
    expect(summarize.messages[1]?.content).toContain("Format: bullets")
    expect(report.messages[1]?.content).toContain("Focus: 风险和建议动作")
    expect(report.messages[1]?.content).toContain("Output format: sections")
  })

  it("executes prompt optimization recipes through simple ai completion", async () => {
    const requests: Array<{
      url: string
      method: string
      body: string | null | undefined
    }> = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : null,
        })

        return jsonResponse({
          item: {
            taskKind: "prompt_optimize",
            content: "优化后的提示词",
            source: "ai",
            usedUpstream: true,
            resolvedChannelId: "main",
            resolvedModelId: "gpt-4.1",
          },
        })
      },
    })

    const response = await client.ai.recipes.promptOptimize("news-site", {
      prompt: "优化一下这段提示词",
      userRequirement: "保留原始结构",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })

    expect(response.item.content).toBe("优化后的提示词")
    expect(requests).toEqual([{
      url: "http://127.0.0.1:4199/external/v1/workspaces/news-site/ai/completion",
      method: "POST",
      body: JSON.stringify(buildPromptOptimizePayload({
        prompt: "优化一下这段提示词",
        userRequirement: "保留原始结构",
        selectedChannelId: "main",
        selectedModelId: "gpt-4.1",
      })),
    }])
  })

  it("executes summarize and report analysis recipes through simple ai completion", async () => {
    const requests: Array<{
      url: string
      method: string
      body: string | null | undefined
    }> = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : null,
        })

        return jsonResponse({
          item: {
            content: "best practice result",
            usedUpstream: true,
            resolvedChannelId: "main",
            resolvedModelId: "gpt-4.1",
          },
        })
      },
    })

    const summarizeResponse = await client.ai.recipes.summarizeText("news-site", {
      text: "第一段\n\n第二段",
      length: "short",
      format: "bullets",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })

    const analyzeResponse = await client.ai.recipes.analyzeReport("news-site", {
      report: "收入下降 10%，退款率上升。",
      focus: "风险与建议动作",
      outputFormat: "sections",
      selectedChannelId: "main",
      selectedModelId: "gpt-4.1",
    })

    expect(summarizeResponse.item.content).toBe("best practice result")
    expect(analyzeResponse.item.content).toBe("best practice result")
    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:4199/external/v1/workspaces/news-site/ai/completion",
        method: "POST",
        body: JSON.stringify(buildTextSummarizePayload({
          text: "第一段\n\n第二段",
          length: "short",
          format: "bullets",
          selectedChannelId: "main",
          selectedModelId: "gpt-4.1",
        })),
      },
      {
        url: "http://127.0.0.1:4199/external/v1/workspaces/news-site/ai/completion",
        method: "POST",
        body: JSON.stringify(buildReportAnalyzePayload({
          report: "收入下降 10%，退款率上升。",
          focus: "风险与建议动作",
          outputFormat: "sections",
          selectedChannelId: "main",
          selectedModelId: "gpt-4.1",
        })),
      },
    ])
  })

  it("ensures a workspace by creating it only when the workspace is missing", async () => {
    const urls: string[] = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199/external/v1",
      fetch: async (url, init) => {
        urls.push(`${init?.method ?? "GET"} ${String(url)}`)

        if (urls.length === 1) {
          return jsonResponse(
            {
              ok: false,
              code: "NOT_FOUND",
              message: "workspace not found",
            },
            {
              status: 404,
              headers: {
                "Content-Type": "application/json",
              },
            },
          )
        }

        return jsonResponse({
          created: true,
          item: {
            workspaceId: "news-site",
            name: "News Site",
            isPinned: false,
            tags: [],
            status: "available",
            health: "healthy",
            temporary: true,
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        })
      },
    })

    const response = await client.workspaces.ensure("news-site", {
      name: "News Site",
    })

    expect(response.created).toBe(true)
    expect(response.item.workspaceId).toBe("news-site")
    expect(urls).toEqual([
      "GET http://127.0.0.1:4199/external/v1/workspaces/news-site",
      "POST http://127.0.0.1:4199/external/v1/workspaces",
    ])
  })

  it("parses execute stream events from the external sse response", async () => {
    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async () =>
        sseResponse([
          "event: session.ready\n",
          "data: {\"workspaceId\":\"news-site\",\"sessionId\":\"ses-001\",\"sessionCreated\":true,\"session\":{\"sessionId\":\"ses-001\",\"workspaceId\":\"news-site\",\"title\":\"Stream\",\"memoryEnabled\":true,\"messageCount\":0,\"status\":\"idle\",\"createdAt\":\"2026-03-30T10:00:00.000Z\",\"updatedAt\":\"2026-03-30T10:00:00.000Z\",\"messages\":[]}}\n\n",
          "event: message.delta\n",
          "data: {\"workspaceId\":\"news-site\",\"sessionId\":\"ses-001\",\"messageId\":\"msg-assistant-1\",\"part\":{\"type\":\"text\",\"partId\":\"text-1\",\"delta\":\"hello\",\"text\":\"hello\"}}\n\n",
          "event: result\n",
          "data: {\"workspaceId\":\"news-site\",\"sessionId\":\"ses-001\",\"sessionCreated\":true,\"session\":{\"sessionId\":\"ses-001\",\"workspaceId\":\"news-site\",\"title\":\"Stream\",\"memoryEnabled\":true,\"messageCount\":2,\"status\":\"idle\",\"createdAt\":\"2026-03-30T10:00:00.000Z\",\"updatedAt\":\"2026-03-30T10:00:00.000Z\",\"messages\":[]},\"userMessageId\":\"msg-user-1\",\"assistantMessageId\":\"msg-assistant-1\",\"message\":{\"messageId\":\"msg-assistant-1\",\"sessionId\":\"ses-001\",\"role\":\"assistant\",\"status\":\"complete\",\"content\":\"hello\",\"parts\":[{\"type\":\"text\",\"partId\":\"text-1\",\"text\":\"hello\"}],\"createdAt\":\"2026-03-30T10:00:00.000Z\",\"updatedAt\":\"2026-03-30T10:00:00.000Z\"},\"text\":\"hello\",\"usedUpstream\":true}\n\n",
          "event: done\n",
          "data: {\"workspaceId\":\"news-site\",\"sessionId\":\"ses-001\",\"ok\":true,\"failureReason\":null}\n\n",
        ]),
    })

    const events: string[] = []
    let finalText = ""

    for await (const event of client.executeStream("news-site", {
      content: "say hello",
    })) {
      events.push(event.event)

      if (event.event === "message.delta" && event.data.part.type === "text") {
        finalText = event.data.part.text
      }
    }

    expect(events).toEqual([
      "session.ready",
      "message.delta",
      "result",
      "done",
    ])
    expect(finalText).toBe("hello")
  })

  it("parses stateless simple ai stream events from the external sse response", async () => {
    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async () =>
        sseResponse([
          "event: response.delta\n",
          "data: {\"workspaceId\":\"news-site\",\"part\":{\"type\":\"text\",\"partId\":\"text-1\",\"delta\":\"hello\",\"text\":\"hello\"}}\n\n",
          "event: response.completed\n",
          "data: {\"workspaceId\":\"news-site\",\"item\":{\"content\":\"hello\",\"usedUpstream\":true,\"resolvedChannelId\":\"main\",\"resolvedModelId\":\"gpt-4.1\"}}\n\n",
          "event: done\n",
          "data: {\"workspaceId\":\"news-site\",\"ok\":true,\"failureReason\":null}\n\n",
        ]),
    })

    const events: string[] = []
    let finalText = ""

    for await (const event of client.ai.completeStream("news-site", {
      messages: [{
        role: "user",
        content: "say hello",
      }],
    })) {
      events.push(event.event)

      if (event.event === "response.delta" && event.data.part.type === "text") {
        finalText = event.data.part.text
      }
    }

    expect(events).toEqual([
      "response.delta",
      "response.completed",
      "done",
    ])
    expect(finalText).toBe("hello")
  })

  it("dispatches callback handlers when consuming a stream", async () => {
    const called: string[] = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async () =>
        sseResponse([
          "event: message.delta\n",
          "data: {\"workspaceId\":\"news-site\",\"sessionId\":\"ses-001\",\"messageId\":\"msg-assistant-1\",\"part\":{\"type\":\"text\",\"partId\":\"text-1\",\"delta\":\"hello\",\"text\":\"hello\"}}\n\n",
          "event: done\n",
          "data: {\"workspaceId\":\"news-site\",\"sessionId\":\"ses-001\",\"ok\":true,\"failureReason\":null}\n\n",
        ]),
    })

    const summary = await client.consumeExecuteStream(
      "news-site",
      {
        content: "say hello",
      },
      {
        onEvent(event) {
          called.push(`event:${event.event}`)
        },
        onMessageDelta(data) {
          called.push(`delta:${data.part.type}`)
        },
        onDone(data) {
          called.push(`done:${String(data.ok)}`)
        },
      },
    )

    expect(summary.done?.ok).toBe(true)
    expect(called).toEqual([
      "event:message.delta",
      "delta:text",
      "event:done",
      "done:true",
    ])
  })

  it("dispatches callback handlers when consuming a stateless simple ai stream", async () => {
    const called: string[] = []

    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async () =>
        sseResponse([
          "event: response.delta\n",
          "data: {\"workspaceId\":\"news-site\",\"part\":{\"type\":\"text\",\"partId\":\"text-1\",\"delta\":\"hello\",\"text\":\"hello\"}}\n\n",
          "event: done\n",
          "data: {\"workspaceId\":\"news-site\",\"ok\":true,\"failureReason\":null}\n\n",
        ]),
    })

    const summary = await client.ai.consumeCompleteStream(
      "news-site",
      {
        messages: [{
          role: "user",
          content: "say hello",
        }],
      },
      {
        onEvent(event) {
          called.push(`event:${event.event}`)
        },
        onResponseDelta(data) {
          called.push(`delta:${data.part.type}`)
        },
        onDone(data) {
          called.push(`done:${String(data.ok)}`)
        },
      },
    )

    expect(summary.done?.ok).toBe(true)
    expect(called).toEqual([
      "event:response.delta",
      "delta:text",
      "event:done",
      "done:true",
    ])
  })

  it("maps non-2xx responses to MaomiExternalApiError", async () => {
    const client = createMaomiExternalClient({
      baseUrl: "http://127.0.0.1:4199",
      fetch: async () =>
        jsonResponse(
          {
            ok: false,
            code: "UNAUTHORIZED",
            message: "external api key is invalid",
          },
          {
            status: 401,
            statusText: "Unauthorized",
            headers: {
              "Content-Type": "application/json",
              "X-Maomi-Request-Id": "req-123",
            },
          },
        ),
    })

    await expect(client.models.list()).rejects.toBeInstanceOf(MaomiExternalApiError)

    try {
      await client.models.list()
    } catch (error) {
      expect(error).toBeInstanceOf(MaomiExternalApiError)
      expect((error as MaomiExternalApiError).status).toBe(401)
      expect((error as MaomiExternalApiError).code).toBe("UNAUTHORIZED")
      expect((error as MaomiExternalApiError).requestId).toBe("req-123")
    }
  })
})
