import { createServer } from "node:net";

export const DEV_SERVER_HOST = "127.0.0.1";
export const DEFAULT_DEV_SERVER_PORT = 35001;
export const DEV_SERVER_PORT_ENV_NAME = "MAOMI_DESKTOP_DEV_SERVER_PORT";
export type DevServerPortSource = "default" | "env";

export type SelectedDevServerPort = {
  requestedPort: number;
  port: number;
  source: DevServerPortSource;
  didFallback: boolean;
};

function parseDevServerPortValue(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    return null;
  }

  return parsed;
}

export function resolveDevServerPort(): number {
  if (typeof process === "undefined" || typeof process.env !== "object" || !process.env) {
    return DEFAULT_DEV_SERVER_PORT;
  }

  return parseDevServerPortValue(process.env[DEV_SERVER_PORT_ENV_NAME]) ?? DEFAULT_DEV_SERVER_PORT;
}

export function resolveDevServerPortSource(): DevServerPortSource {
  if (typeof process === "undefined" || typeof process.env !== "object" || !process.env) {
    return "default";
  }

  return parseDevServerPortValue(process.env[DEV_SERVER_PORT_ENV_NAME]) === null ? "default" : "env";
}

export async function selectDevServerPort(options?: {
  preferredPort?: number;
  source?: DevServerPortSource;
  host?: string;
}): Promise<SelectedDevServerPort> {
  const requestedPort = options?.preferredPort ?? resolveDevServerPort();
  const source = options?.source ?? resolveDevServerPortSource();
  const host = options?.host ?? DEV_SERVER_HOST;

  if (await isPortAvailable(requestedPort, host)) {
    return {
      requestedPort,
      port: requestedPort,
      source,
      didFallback: false,
    };
  }

  if (source === "env") {
    throw new Error(
      `Port ${requestedPort} from ${DEV_SERVER_PORT_ENV_NAME} is already in use. `
      + "Choose a different port and retry.",
    );
  }

  return {
    requestedPort,
    port: await reserveFallbackDevServerPort(host),
    source,
    didFallback: true,
  };
}

export async function reserveFallbackDevServerPort(host = DEV_SERVER_HOST): Promise<number> {
  return reserveEphemeralPort(host);
}

async function isPortAvailable(port: number, host: string): Promise<boolean> {
  const server = createServer();

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port, exclusive: true }, resolve);
    });
    return true;
  } catch (error) {
    if (isPortBusyError(error)) {
      return false;
    }
    throw error;
  } finally {
    await closeServer(server);
  }
}

async function reserveEphemeralPort(host: string): Promise<number> {
  const server = createServer();

  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port: 0, exclusive: true }, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not resolve an available dev server port."));
          return;
        }

        resolve(address.port);
      });
    });
    return port;
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) {
    return;
  }

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

function isPortBusyError(error: unknown): error is { code: string } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown };
  return record.code === "EADDRINUSE" || record.code === "EACCES";
}
