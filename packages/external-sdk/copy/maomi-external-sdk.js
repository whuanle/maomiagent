const EXTERNAL_API_ROOT = "/external/v1"

function trimText(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = trimText(baseUrl).replace(/\/+$/, "")
  if (!trimmed) {
    throw new Error("baseUrl is required")
  }

  return trimmed.endsWith(EXTERNAL_API_ROOT)
    ? trimmed
    : `${trimmed}${EXTERNAL_API_ROOT}`
}

function encodePath(value) {
  return encodeURIComponent(String(value))
}

function buildQueryString(input) {
  const params = new URLSearchParams()

  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null || value === "") {
        continue
      }
      params.set(key, String(value))
    }
  }

  const query = params.toString()
  return query ? `?${query}` : ""
}

function toRequestUrl(baseUrl, path, query) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${normalizedPath}${buildQueryString(query)}`
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function stripUndefined(input) {
  if (!isPlainObject(input)) {
    return input
  }

  const output = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value
    }
  }
  return output
}

function normalizeHeaders(input) {
  const headers = new Headers()
  if (!input) {
    return headers
  }

  const source = input instanceof Headers ? input : new Headers(input)
  for (const [key, value] of source.entries()) {
    headers.set(key, value)
  }
  return headers
}

function camelizeStreamHandler(eventName) {
  return eventName
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("")
}

async function parseJsonSafely(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function findSseBoundary(buffer) {
  const index = buffer.indexOf("\n\n")
  return index >= 0 ? index : -1
}

function parseSseBlock(block) {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  let event = "message"
  const dataLines = []

  for (const line of lines) {
    if (line.startsWith(":")) {
      continue
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message"
      continue
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim())
    }
  }

  const rawData = dataLines.join("\n")
  if (!rawData) {
    return {
      event,
      data: {},
    }
  }

  try {
    return {
      event,
      data: JSON.parse(rawData),
    }
  } catch (error) {
    throw new Error(
      `Failed to parse SSE event payload for "${event}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

async function* parseSseResponse(response) {
  if (!response.body) {
    throw new Error("stream response body is empty")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    buffer = buffer.replace(/\r\n/g, "\n")

    while (true) {
      const boundary = findSseBoundary(buffer)
      if (boundary < 0) {
        break
      }

      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      if (!block.trim()) {
        continue
      }

      yield parseSseBlock(block)
    }

    if (done) {
      break
    }
  }

  const remaining = buffer.trim()
  if (remaining) {
    yield parseSseBlock(remaining)
  }
}

function normalizeRecipeText(value) {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : ""
}

export function buildPromptOptimizePayload(input) {
  const prompt = normalizeRecipeText(input?.prompt)
  const userRequirement = trimText(input?.userRequirement)

  const requirementBlock = userRequirement
    ? [
        "--- Additional Requirement Start ---",
        userRequirement,
        "--- Additional Requirement End ---",
        "",
      ]
    : []

  return {
    messages: [
      {
        role: "system",
        content: [
          "You are a senior prompt optimization assistant.",
          "Rewrite the input prompt into a clearer, more executable, and more maintainable system prompt.",
          "Preserve the original structure when the source already uses headings or strong Markdown sections.",
          "Return only the optimized prompt body. Do not add explanation or code fences.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Optimize the following prompt.",
          "",
          ...requirementBlock,
          "--- Prompt Start ---",
          prompt,
          "--- Prompt End ---",
        ].join("\n"),
      },
    ],
    selectedChannelId: trimText(input?.selectedChannelId) || undefined,
    selectedModelId: trimText(input?.selectedModelId) || undefined,
  }
}

export function buildTextSummarizePayload(input) {
  const text = normalizeRecipeText(input?.text)
  const instruction = trimText(input?.instruction)
  const length = trimText(input?.length) || "medium"
  const format = trimText(input?.format) || "bullets"

  return {
    messages: [
      {
        role: "system",
        content: [
          "You are a senior summarization assistant.",
          "Compress the input faithfully and only include information supported by the source.",
          "Return only the final summary.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Summarize the following text.",
          `Length: ${length}`,
          `Format: ${format}`,
          ...(instruction ? [`Additional instruction: ${instruction}`] : []),
          "",
          "--- Text Start ---",
          text,
          "--- Text End ---",
        ].join("\n"),
      },
    ],
    selectedChannelId: trimText(input?.selectedChannelId) || undefined,
    selectedModelId: trimText(input?.selectedModelId) || undefined,
  }
}

export function buildReportAnalyzePayload(input) {
  const report = normalizeRecipeText(input?.report)
  const instruction = trimText(input?.instruction)
  const focus = trimText(input?.focus)
  const outputFormat = trimText(input?.outputFormat) || "sections"

  return {
    messages: [
      {
        role: "system",
        content: [
          "You are a senior report analysis assistant.",
          "Identify key findings, major risks or anomalies, and concrete follow-up actions.",
          "Return only the final analysis.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Analyze the following report.",
          `Output format: ${outputFormat}`,
          ...(focus ? [`Focus: ${focus}`] : []),
          ...(instruction ? [`Additional instruction: ${instruction}`] : []),
          "",
          "At minimum cover: conclusions, risks or anomalies, and suggested next steps.",
          "",
          "--- Report Start ---",
          report,
          "--- Report End ---",
        ].join("\n"),
      },
    ],
    selectedChannelId: trimText(input?.selectedChannelId) || undefined,
    selectedModelId: trimText(input?.selectedModelId) || undefined,
  }
}

export class MaomiExternalApiError extends Error {
  constructor(input) {
    super(input.message)
    this.name = "MaomiExternalApiError"
    this.status = input.status
    this.code = input.code
    this.data = input.data
    this.requestId = input.requestId
  }
}

export class MaomiExternalClient {
  constructor(options) {
    const fetchImpl = options?.fetch ?? globalThis.fetch
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch implementation is required")
    }

    this.baseUrl = normalizeBaseUrl(options?.baseUrl)
    this.apiKey = trimText(options?.apiKey)
    this.fetchImpl = fetchImpl
    this.defaultHeaders = options?.headers

    this.models = {
      list: (requestOptions) => this.listModels(requestOptions),
    }

    this.workspaces = {
      list: (query, requestOptions) => this.listWorkspaces(query, requestOptions),
      create: (input, requestOptions) => this.createWorkspace(input, requestOptions),
      ensure: (workspaceId, input, requestOptions) =>
        this.ensureWorkspace(workspaceId, input, requestOptions),
      get: (workspaceId, requestOptions) => this.getWorkspace(workspaceId, requestOptions),
      remove: (workspaceId, requestOptions) => this.removeWorkspace(workspaceId, requestOptions),
    }

    this.sessions = {
      list: (workspaceId, query, requestOptions) =>
        this.listSessions(workspaceId, query, requestOptions),
      create: (workspaceId, input, requestOptions) =>
        this.createSession(workspaceId, input, requestOptions),
      get: (workspaceId, sessionId, requestOptions) =>
        this.getSession(workspaceId, sessionId, requestOptions),
      remove: (workspaceId, sessionId, requestOptions) =>
        this.removeSession(workspaceId, sessionId, requestOptions),
      messages: {
        list: (workspaceId, sessionId, requestOptions) =>
          this.listSessionMessages(workspaceId, sessionId, requestOptions),
      },
    }

    this.ai = {
      capabilities: (workspaceId, query, requestOptions) =>
        this.getAiCapabilities(workspaceId, query, requestOptions),
      recipes: {
        buildPromptOptimizePayload,
        buildTextSummarizePayload,
        buildReportAnalyzePayload,
        promptOptimize: (workspaceId, input, requestOptions) =>
          this.completeAi(workspaceId, buildPromptOptimizePayload(input), requestOptions),
        summarizeText: (workspaceId, input, requestOptions) =>
          this.completeAi(workspaceId, buildTextSummarizePayload(input), requestOptions),
        analyzeReport: (workspaceId, input, requestOptions) =>
          this.completeAi(workspaceId, buildReportAnalyzePayload(input), requestOptions),
      },
      complete: (workspaceId, payload, requestOptions) =>
        this.completeAi(workspaceId, payload, requestOptions),
      completeStream: (workspaceId, payload, requestOptions) =>
        this.completeAiStream(workspaceId, payload, requestOptions),
      consumeCompleteStream: (workspaceId, payload, consumer, requestOptions) =>
        this.consumeAiCompleteStream(workspaceId, payload, consumer, requestOptions),
    }
  }

  async health(requestOptions) {
    return this.requestJson("/health", {
      method: "GET",
      requestOptions,
    })
  }

  async listModels(requestOptions) {
    return this.requestJson("/models", {
      method: "GET",
      requestOptions,
    })
  }

  async listWorkspaces(query, requestOptions) {
    return this.requestJson("/workspaces", {
      method: "GET",
      query,
      requestOptions,
    })
  }

  async createWorkspace(input, requestOptions) {
    return this.requestJson("/workspaces", {
      method: "POST",
      body: stripUndefined(input ?? {}),
      requestOptions,
    })
  }

  async ensureWorkspace(workspaceId, input, requestOptions) {
    try {
      const response = await this.getWorkspace(workspaceId, requestOptions)
      return {
        created: false,
        item: response.item,
      }
    } catch (error) {
      if (!(error instanceof MaomiExternalApiError) || error.status !== 404) {
        throw error
      }
    }

    return this.createWorkspace({
      ...stripUndefined(input ?? {}),
      workspaceId,
    }, requestOptions)
  }

  async getWorkspace(workspaceId, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}`, {
      method: "GET",
      requestOptions,
    })
  }

  async removeWorkspace(workspaceId, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}`, {
      method: "DELETE",
      requestOptions,
    })
  }

  async listSessions(workspaceId, query, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}/sessions`, {
      method: "GET",
      query,
      requestOptions,
    })
  }

  async createSession(workspaceId, input, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}/sessions`, {
      method: "POST",
      body: stripUndefined(input ?? {}),
      requestOptions,
    })
  }

  async getSession(workspaceId, sessionId, requestOptions) {
    return this.requestJson(
      `/workspaces/${encodePath(workspaceId)}/sessions/${encodePath(sessionId)}`,
      {
        method: "GET",
        requestOptions,
      },
    )
  }

  async removeSession(workspaceId, sessionId, requestOptions) {
    return this.requestJson(
      `/workspaces/${encodePath(workspaceId)}/sessions/${encodePath(sessionId)}`,
      {
        method: "DELETE",
        requestOptions,
      },
    )
  }

  async listSessionMessages(workspaceId, sessionId, requestOptions) {
    return this.requestJson(
      `/workspaces/${encodePath(workspaceId)}/sessions/${encodePath(sessionId)}/messages`,
      {
        method: "GET",
        requestOptions,
      },
    )
  }

  async getAiCapabilities(workspaceId, query, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}/ai/capabilities`, {
      method: "GET",
      query,
      requestOptions,
    })
  }

  async completeAi(workspaceId, payload, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}/ai/completion`, {
      method: "POST",
      body: stripUndefined(payload ?? {}),
      requestOptions,
    })
  }

  async *completeAiStream(workspaceId, payload, requestOptions) {
    const requestHeaders = normalizeHeaders(requestOptions?.headers)
    requestHeaders.set("Accept", "text/event-stream")

    const response = await this.request(`/workspaces/${encodePath(workspaceId)}/ai/completion/stream`, {
      method: "POST",
      body: stripUndefined(payload ?? {}),
      requestOptions: {
        ...requestOptions,
        headers: requestHeaders,
      },
    })

    for await (const event of parseSseResponse(response)) {
      yield event
    }
  }

  async consumeAiCompleteStream(workspaceId, payload, consumer, requestOptions) {
    let result
    let done

    for await (const event of this.completeAiStream(workspaceId, payload, requestOptions)) {
      consumer?.onEvent?.(event)

      const handlerName = `on${camelizeStreamHandler(event.event)}`
      if (typeof consumer?.[handlerName] === "function") {
        consumer[handlerName](event.data, event)
      }

      if (event.event === "response.completed") {
        result = event.data
      }
      if (event.event === "done") {
        done = event.data
      }
    }

    return { result, done }
  }

  async execute(workspaceId, payload, requestOptions) {
    return this.requestJson(`/workspaces/${encodePath(workspaceId)}/execute`, {
      method: "POST",
      body: stripUndefined(payload ?? {}),
      requestOptions,
    })
  }

  async *executeStream(workspaceId, payload, requestOptions) {
    const requestHeaders = normalizeHeaders(requestOptions?.headers)
    requestHeaders.set("Accept", "text/event-stream")

    const response = await this.request(`/workspaces/${encodePath(workspaceId)}/execute/stream`, {
      method: "POST",
      body: stripUndefined(payload ?? {}),
      requestOptions: {
        ...requestOptions,
        headers: requestHeaders,
      },
    })

    for await (const event of parseSseResponse(response)) {
      yield event
    }
  }

  async consumeExecuteStream(workspaceId, payload, consumer, requestOptions) {
    let result
    let done

    for await (const event of this.executeStream(workspaceId, payload, requestOptions)) {
      consumer?.onEvent?.(event)

      const handlerName = `on${camelizeStreamHandler(event.event)}`
      if (typeof consumer?.[handlerName] === "function") {
        consumer[handlerName](event.data, event)
      }

      if (event.event === "result") {
        result = event.data
      }
      if (event.event === "done") {
        done = event.data
      }
    }

    return { result, done }
  }

  async request(path, input) {
    const url = toRequestUrl(this.baseUrl, path, input?.query)
    const headers = await this.resolveHeaders(input?.requestOptions?.headers)
    const method = input?.method ?? "GET"
    let body = input?.body

    if (
      body !== undefined
      && body !== null
      && !(body instanceof FormData)
      && !(body instanceof URLSearchParams)
      && !(body instanceof Blob)
      && typeof body !== "string"
      && !(body instanceof ArrayBuffer)
      && !ArrayBuffer.isView(body)
    ) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
      }
      body = JSON.stringify(body)
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body,
      signal: input?.requestOptions?.signal,
    })

    if (!response.ok) {
      throw await this.buildError(response)
    }

    return response
  }

  async requestJson(path, input) {
    const response = await this.request(path, input)
    return await response.json()
  }

  async resolveHeaders(requestHeaders) {
    const headers = normalizeHeaders(
      typeof this.defaultHeaders === "function"
        ? await this.defaultHeaders()
        : this.defaultHeaders,
    )

    if (this.apiKey && !headers.has("Authorization") && !headers.has("X-API-Key")) {
      headers.set("Authorization", `Bearer ${this.apiKey}`)
    }

    const scopedHeaders = normalizeHeaders(requestHeaders)
    for (const [key, value] of scopedHeaders.entries()) {
      headers.set(key, value)
    }

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json")
    }

    return headers
  }

  async buildError(response) {
    const requestId = response.headers.get("X-Maomi-Request-Id") || undefined
    const payload = await parseJsonSafely(response)

    if (isPlainObject(payload) && typeof payload.message === "string") {
      return new MaomiExternalApiError({
        status: response.status,
        code: typeof payload.code === "string" ? payload.code : "HTTP_ERROR",
        message: payload.message,
        data: isPlainObject(payload.data) ? payload.data : undefined,
        requestId,
      })
    }

    const statusText = trimText(response.statusText)
    return new MaomiExternalApiError({
      status: response.status,
      code: "HTTP_ERROR",
      message: statusText || `Request failed with status ${response.status}`,
      requestId,
    })
  }
}

export function createMaomiExternalClient(options) {
  return new MaomiExternalClient(options)
}
