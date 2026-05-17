export function defineMaomiModuleServer(input) {
  if (typeof input === "function") {
    return {
      fetch: input,
    }
  }
  if (
    input
    && (
      typeof input.fetch === "function"
      || typeof input.activate === "function"
      || typeof input.dispose === "function"
    )
  ) {
    return input
  }
  throw new Error("Module server must provide fetch(request, context), activate(context), or dispose(context)")
}

export function json(data, init) {
  return Response.json(data, init)
}

export function text(value, init = {}) {
  const responseInit = {
    ...init,
    headers: {
      ...(init.headers || {}),
      "content-type": "text/plain; charset=utf-8",
    },
  }
  return new Response(String(value), responseInit)
}

export function notFound(message = "Not found") {
  return Response.json(
    {
      ok: false,
      code: "NOT_FOUND",
      message,
    },
    { status: 404 },
  )
}
