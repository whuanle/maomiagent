export const BRIDGE_PROTOCOL = "maomi.module.bridge"

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeBridgePayload(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return isRecord(value) ? value : null
}

function normalizeModuleServerPath(path) {
  if (typeof path !== "string") {
    return ""
  }
  const trimmed = path.trim()
  if (!trimmed || trimmed === "/") {
    return ""
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export function createMaomiModuleSdk(options = {}) {
  const protocol = typeof options.protocol === "string" && options.protocol.trim()
    ? options.protocol.trim()
    : BRIDGE_PROTOCOL
  const targetOrigin = typeof options.targetOrigin === "string" && options.targetOrigin.trim()
    ? options.targetOrigin.trim()
    : "*"
  const requestTimeoutMs = typeof options.requestTimeoutMs === "number" && Number.isFinite(options.requestTimeoutMs)
    ? Math.max(1000, Math.trunc(options.requestTimeoutMs))
    : 15000

  let disposed = false
  let currentContext = null
  let readySent = false
  const contextListeners = new Set()
  const pendingRequests = new Map()

  function postMessage(message) {
    if (disposed) {
      return
    }
    window.parent.postMessage(message, targetOrigin)
  }

  function clearPendingRequest(requestId, item) {
    window.clearTimeout(item.timer)
    pendingRequests.delete(requestId)
  }

  function rejectAllPending(error) {
    for (const [requestId, item] of pendingRequests.entries()) {
      clearPendingRequest(requestId, item)
      item.reject(error)
    }
  }

  function handleIncomingMessage(event) {
    const payload = normalizeBridgePayload(event.data)
    if (!payload || payload.protocol !== protocol || typeof payload.type !== "string") {
      return
    }

    if (payload.type === "bootstrap" || payload.type === "context-changed") {
      currentContext = payload.context || null
      for (const listener of contextListeners) {
        listener(currentContext)
      }
      return
    }

    if (payload.type === "response" && typeof payload.requestId === "string") {
      const pending = pendingRequests.get(payload.requestId)
      if (!pending) {
        return
      }
      clearPendingRequest(payload.requestId, pending)
      if (payload.ok) {
        pending.resolve(payload.data)
      } else {
        pending.reject(new Error(payload.error?.message || "Bridge request failed"))
      }
    }
  }

  function ready() {
    if (disposed || readySent) {
      return
    }
    readySent = true
    postMessage({
      protocol,
      type: "ready",
    })
  }

  function request(method, params) {
    if (disposed) {
      return Promise.reject(new Error("SDK has been disposed"))
    }
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error(`Bridge request timed out: ${method}`))
      }, requestTimeoutMs)

      pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
      })

      postMessage({
        protocol,
        type: "request",
        requestId,
        method,
        params,
      })
    })
  }

  function onContextChange(listener) {
    contextListeners.add(listener)
    if (currentContext) {
      listener(currentContext)
    }
    return () => {
      contextListeners.delete(listener)
    }
  }

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true
    window.removeEventListener("message", handleIncomingMessage)
    rejectAllPending(new Error("SDK has been disposed"))
    contextListeners.clear()
  }

  async function resolveContext() {
    return currentContext || await request("context.get")
  }

  async function resolveModuleServerUrl(path) {
    const context = await resolveContext()
    if (!context?.moduleId) {
      throw new Error("Module context is unavailable")
    }
    const baseUrl = context.host?.apiBaseUrl || window.location.origin
    const suffix = normalizeModuleServerPath(path)
    return new URL(
      `/global/modules/${encodeURIComponent(context.moduleId)}/server${suffix}`,
      baseUrl,
    ).toString()
  }

  window.addEventListener("message", handleIncomingMessage)

  if (options.autoReady !== false) {
    ready()
  }

  return {
    protocol,
    ready,
    dispose,
    request,
    async getContext() {
      return await resolveContext()
    },
    onContextChange,
    reportState(state) {
      postMessage({
        protocol,
        type: "report-state",
        state,
      })
    },
    module: {
      async fetch(path = "/", init) {
        const url = await resolveModuleServerUrl(path)
        return fetch(url, init)
      },
    },
    host: {
      workspace: {
        getActive() {
          return request("workspace.getActive")
        },
        list(input = {}) {
          return request("workspace.list", input)
        },
      },
      models: {
        list() {
          return request("models.list")
        },
      },
      conversations: {
        list(input = {}) {
          return request("conversations.list", input)
        },
        getContext(input) {
          return request("conversations.getContext", input)
        },
      },
      storage: {
        get(key) {
          return request("storage.get", { key })
        },
        async set(key, value) {
          await request("storage.set", { key, value })
        },
        async remove(key) {
          await request("storage.remove", { key })
        },
      },
      localSurfaces: {
        list(input = {}) {
          return request("localSurface.list", input)
        },
        open(input) {
          return request("localSurface.open", input)
        },
        get(input) {
          return request("localSurface.get", input)
        },
        getContent(input) {
          return request("localSurface.getContent", input)
        },
        updateContent(input) {
          return request("localSurface.updateContent", input)
        },
        save(input) {
          return request("localSurface.save", input)
        },
        reload(input) {
          return request("localSurface.reload", input)
        },
        close(input) {
          return request("localSurface.close", input)
        },
      },
      tasks: {
        list(input = {}) {
          return request("tasks.list", input)
        },
        get(input) {
          return request("tasks.get", input)
        },
        create(input) {
          return request("tasks.create", input)
        },
        update(input) {
          return request("tasks.update", input)
        },
        runNow(input) {
          return request("tasks.runNow", input)
        },
        runManyNow(input) {
          return request("tasks.runManyNow", input)
        },
        pauseSchedule(input) {
          return request("tasks.pauseSchedule", input)
        },
        pauseManySchedules(input) {
          return request("tasks.pauseManySchedules", input)
        },
        resumeSchedule(input) {
          return request("tasks.resumeSchedule", input)
        },
        resumeManySchedules(input) {
          return request("tasks.resumeManySchedules", input)
        },
      },
      navigation: {
        async openBuiltin(routeKey) {
          await request("navigation.openBuiltin", { routeKey })
        },
        async openModule(moduleId) {
          await request("navigation.openModule", { moduleId })
        },
      },
    },
    ui: {
      async notify(input) {
        await request("ui.notify", input)
      },
    },
  }
}
