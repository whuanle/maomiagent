import { createHash } from "node:crypto";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";

const ACTIVATION_HOST = "127.0.0.1";
const ACTIVATION_PROTOCOL = "maomiagent.desktop.single-instance.v1";
const ACTIVATION_TIMEOUT_MS = 1500;
const INSTANCE_PORT_BASE = 42000;
const INSTANCE_PORT_SPAN = 12000;

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

export type SingleInstanceController = {
  kind: "primary" | "secondary";
  setActivationHandler(handler: ActivationHandler): void;
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
  const port = options.port ?? deriveSingleInstancePort(options.appKey);
  return requestActivation(options.appKey, port);
}

export async function createSingleInstanceCoordinator(
  options: SingleInstanceOptions,
): Promise<SingleInstanceController> {
  const logger = options.logger ?? console;
  const port = options.port ?? deriveSingleInstancePort(options.appKey);

  if (await activateExistingInstance({ appKey: options.appKey, port })) {
    logger.log(
      `Activated existing ${options.appName} instance on ${ACTIVATION_HOST}:${port}.`,
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
      `Activated existing ${options.appName} instance on ${ACTIVATION_HOST}:${port}.`,
    );
    return createSecondaryController();
  }

  throw new Error(
    `${options.appName} could not establish a single-instance activation channel on ${ACTIVATION_HOST}:${port}.`,
  );
}

function deriveSingleInstancePort(appKey: string): number {
  const hash = createHash("sha256").update(appKey).digest();
  return INSTANCE_PORT_BASE + (hash.readUInt16BE(0) % INSTANCE_PORT_SPAN);
}

function createSecondaryController(): SingleInstanceController {
  return {
    kind: "secondary",
    setActivationHandler() {},
    async dispose() {},
  };
}

async function createPrimaryController(
  options: Required<SingleInstanceOptions>,
): Promise<SingleInstanceController> {
  let activationHandler: ActivationHandler | null = null;
  let pendingActivation = false;

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

  const server = createServer((socket) => {
    void handleActivationSocket(socket, options.appKey, activate);
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
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      await closeServer(server);
    },
  };
}

async function handleActivationSocket(
  socket: Socket,
  appKey: string,
  activate: ActivationHandler,
): Promise<void> {
  socket.setEncoding("utf8");

  let settled = false;
  let buffer = "";

  const finish = (accepted: boolean) => {
    if (settled) {
      return;
    }

    settled = true;
    const response: ActivationResponse = {
      accepted,
      protocol: ACTIVATION_PROTOCOL,
    };
    socket.end(`${JSON.stringify(response)}\n`);
  };

  socket.on("data", (chunk) => {
    if (settled) {
      return;
    }

    buffer += chunk;
    const lineBreakIndex = buffer.indexOf("\n");
    if (lineBreakIndex === -1) {
      return;
    }

    const line = buffer.slice(0, lineBreakIndex);
    void respond(line);
  });

  socket.on("error", () => {
    if (!settled) {
      socket.destroy();
    }
  });

  async function respond(line: string) {
    const request = parseActivationRequest(line);
    if (!request || request.appKey !== appKey) {
      finish(false);
      return;
    }

    await activate();
    finish(true);
  }
}

async function requestActivation(appKey: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = "";

    const socket = createConnection({ host: ACTIVATION_HOST, port });
    socket.setEncoding("utf8");

    const timeout = setTimeout(() => {
      finish(false);
    }, ACTIVATION_TIMEOUT_MS);

    const finish = (accepted: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(accepted);
    };

    socket.on("connect", () => {
      const request: ActivationRequest = {
        action: "activate",
        appKey,
        protocol: ACTIVATION_PROTOCOL,
      };

      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      const lineBreakIndex = buffer.indexOf("\n");
      if (lineBreakIndex === -1) {
        return;
      }

      const response = parseActivationResponse(buffer.slice(0, lineBreakIndex));
      finish(response?.accepted === true);
    });

    socket.on("error", () => {
      finish(false);
    });

    socket.on("close", () => {
      finish(false);
    });
  });
}

function parseActivationRequest(line: string): ActivationRequest | null {
  try {
    const request = JSON.parse(line) as Partial<ActivationRequest>;
    if (
      request.action !== "activate" ||
      request.protocol !== ACTIVATION_PROTOCOL ||
      typeof request.appKey !== "string"
    ) {
      return null;
    }

    return {
      action: request.action,
      appKey: request.appKey,
      protocol: request.protocol,
    };
  } catch {
    return null;
  }
}

function parseActivationResponse(line: string): ActivationResponse | null {
  try {
    const response = JSON.parse(line) as Partial<ActivationResponse>;
    if (
      response.protocol !== ACTIVATION_PROTOCOL ||
      typeof response.accepted !== "boolean"
    ) {
      return null;
    }

    return {
      accepted: response.accepted,
      protocol: response.protocol,
    };
  } catch {
    return null;
  }
}

async function listenOnPort(server: Server, port: number): Promise<void> {
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
    server.listen(port, ACTIVATION_HOST);
  });
}

async function closeServer(server: Server): Promise<void> {
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