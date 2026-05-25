import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";

import {
  DESKTOP_LOCAL_CONTROL_HOST,
  DESKTOP_LOCAL_CONTROL_PROTOCOL,
  resolveDesktopLocalControlBaseUrl,
  resolveDesktopLocalControlPort,
} from "../shared/desktop-feishu-oauth";

const ACTIVATION_TIMEOUT_MS = 1_500;
const ACTIVATION_ROUTE_PATH = "/internal/activate";

type ActivationHandler = () => void | Promise<void>;
type Logger = Pick<typeof console, "log" | "warn" | "error">;

type ActivationRequest = {
  action: "activate";
  appKey: string;
  protocol: string;
};

type ActivationResponse = {
  accepted: boolean;
  protocol: string;
};

export type SingleInstanceHttpRequest = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  bodyText: string;
};

export type SingleInstanceHttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  bodyBytes?: Uint8Array;
};

export type SingleInstanceHttpRoute = {
  method: "GET" | "POST";
  path: string;
  handler: (
    request: SingleInstanceHttpRequest,
  ) => SingleInstanceHttpResponse | Promise<SingleInstanceHttpResponse>;
};

export type SingleInstanceController = {
  kind: "primary" | "secondary";
  setActivationHandler(handler: ActivationHandler): void;
  registerHttpRoute(route: SingleInstanceHttpRoute): () => void;
  dispose(): Promise<void>;
};

export type SingleInstanceOptions = {
  appKey: string;
  appName: string;
  logger?: Logger;
  port?: number;
};

export async function activateExistingInstance(
  options: Pick<SingleInstanceOptions, "appKey" | "port">,
): Promise<boolean> {
  const port = resolveDesktopLocalControlPort(options.port);
  const response = await postJson<ActivationResponse>(
    `${resolveDesktopLocalControlBaseUrl(port)}${ACTIVATION_ROUTE_PATH}`,
    {
      action: "activate",
      appKey: options.appKey,
      protocol: DESKTOP_LOCAL_CONTROL_PROTOCOL,
    } satisfies ActivationRequest,
  );

  return response?.accepted === true
    && response.protocol === DESKTOP_LOCAL_CONTROL_PROTOCOL;
}

export async function createSingleInstanceCoordinator(
  options: SingleInstanceOptions,
): Promise<SingleInstanceController> {
  const logger = options.logger ?? console;
  const port = resolveDesktopLocalControlPort(options.port);

  if (await activateExistingInstance({ appKey: options.appKey, port })) {
    logger.log(
      `Activated existing ${options.appName} instance on ${DESKTOP_LOCAL_CONTROL_HOST}:${port}.`,
    );
    return createSecondaryController();
  }

  try {
    return await createPrimaryController({ ...options, logger, port });
  } catch (error) {
    if (!isAddressInUseError(error)) {
      throw error;
    }
  }

  if (await activateExistingInstance({ appKey: options.appKey, port })) {
    logger.log(
      `Activated existing ${options.appName} instance on ${DESKTOP_LOCAL_CONTROL_HOST}:${port}.`,
    );
    return createSecondaryController();
  }

  throw new Error(
    `${options.appName} could not establish a single-instance activation channel on ${DESKTOP_LOCAL_CONTROL_HOST}:${port}.`,
  );
}

function createSecondaryController(): SingleInstanceController {
  return {
    kind: "secondary",
    setActivationHandler() {},
    registerHttpRoute() {
      return () => {};
    },
    async dispose() {},
  };
}

async function createPrimaryController(
  options: Required<SingleInstanceOptions>,
): Promise<SingleInstanceController> {
  let activationHandler: ActivationHandler | null = null;
  let pendingActivation = false;
  const routes = new Map<string, SingleInstanceHttpRoute["handler"]>();

  const activate = async () => {
    if (!activationHandler) {
      pendingActivation = true;
      return;
    }

    try {
      await activationHandler();
    } catch (error) {
      options.logger.warn(
        `Failed to activate existing ${options.appName} window.`,
        error,
      );
    }
  };

  const server = createServer(async (request, response) => {
    try {
      await handleControlPlaneRequest({
        request,
        response,
        appKey: options.appKey,
        port: options.port,
        activate,
        routes,
      });
    } catch {
      if (response.headersSent) {
        response.end();
        return;
      }

      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("internal error");
    }
  });

  await listenOnPort(server, options.port);
  server.unref();

  let disposed = false;

  return {
    kind: "primary",
    setActivationHandler(handler) {
      activationHandler = handler;

      if (!pendingActivation) {
        return;
      }

      pendingActivation = false;
      void activate();
    },
    registerHttpRoute(route) {
      const key = buildRouteKey(route.method, route.path);
      routes.set(key, route.handler);
      return () => {
        routes.delete(key);
      };
    },
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      routes.clear();
      await closeServer(server);
    },
  };
}

async function handleControlPlaneRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  appKey: string;
  port: number;
  activate: ActivationHandler;
  routes: Map<string, SingleInstanceHttpRoute["handler"]>;
}): Promise<void> {
  const method = normalizeHttpMethod(input.request.method);
  const url = new URL(
    input.request.url ?? "/",
    `${resolveDesktopLocalControlBaseUrl(input.port)}${input.request.url?.startsWith("/") ? "" : "/"}`,
  );
  const requestPayload = await toSingleInstanceHttpRequest(input.request, url, method);

  if (method === "POST" && url.pathname === ACTIVATION_ROUTE_PATH) {
    const activationResponse = await handleActivationRequest(
      requestPayload,
      input.appKey,
      input.activate,
    );
    writeHttpResponse(input.response, activationResponse);
    return;
  }

  const route = input.routes.get(buildRouteKey(method, url.pathname));
  if (!route) {
    writeHttpResponse(input.response, {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      body: "not found",
    });
    return;
  }

  const routeResponse = await route(requestPayload);
  writeHttpResponse(input.response, routeResponse);
}

async function handleActivationRequest(
  request: SingleInstanceHttpRequest,
  appKey: string,
  activate: ActivationHandler,
): Promise<SingleInstanceHttpResponse> {
  const activationRequest = parseActivationRequest(request.bodyText);
  if (!activationRequest || activationRequest.appKey !== appKey) {
    return {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        accepted: false,
        protocol: DESKTOP_LOCAL_CONTROL_PROTOCOL,
      } satisfies ActivationResponse),
    };
  }

  await activate();

  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      accepted: true,
      protocol: DESKTOP_LOCAL_CONTROL_PROTOCOL,
    } satisfies ActivationResponse),
  };
}

function parseActivationRequest(value: string): ActivationRequest | null {
  try {
    const parsed = JSON.parse(value) as Partial<ActivationRequest>;
    if (
      parsed.action !== "activate"
      || parsed.protocol !== DESKTOP_LOCAL_CONTROL_PROTOCOL
      || typeof parsed.appKey !== "string"
    ) {
      return null;
    }

    return {
      action: parsed.action,
      appKey: parsed.appKey,
      protocol: parsed.protocol,
    };
  } catch {
    return null;
  }
}

function normalizeHttpMethod(value?: string | null): string {
  return (value ?? "GET").toUpperCase();
}

function buildRouteKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

async function toSingleInstanceHttpRequest(
  request: IncomingMessage,
  url: URL,
  method: string,
): Promise<SingleInstanceHttpRequest> {
  return {
    method,
    url,
    headers: normalizeHeaders(request.headers),
    bodyText: await readRequestBody(request),
  };
}

function normalizeHeaders(
  headers: IncomingMessage["headers"],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .map(([name, value]) => [
        name,
        Array.isArray(value) ? value.join(", ") : (value ?? ""),
      ])
      .filter(([, value]) => value.length > 0),
  );
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function writeHttpResponse(
  response: ServerResponse,
  payload: SingleInstanceHttpResponse,
): void {
  response.writeHead(payload.status, payload.headers ?? {});
  if (payload.bodyBytes) {
    response.end(payload.bodyBytes);
    return;
  }
  response.end(payload.body ?? "");
}

async function postJson<TResponse>(
  url: string,
  payload: Record<string, unknown>,
): Promise<TResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, ACTIVATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return null;
    }

    return await response.json() as TResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function listenOnPort(server: HttpServer, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, DESKTOP_LOCAL_CONTROL_HOST);
  });
}

async function closeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
