import {
  DEFAULT_DEV_SERVER_PORT,
  DEV_SERVER_HOST,
  DEV_SERVER_PORT_ENV_NAME,
  reserveFallbackDevServerPort,
  selectDevServerPort,
  type SelectedDevServerPort,
} from "./dev-server-port";

const DEV_SERVER_START_TIMEOUT_MS = 30_000;
const DEFAULT_DEV_SERVER_START_ATTEMPTS = 3;

type SpawnedCommand = ReturnType<typeof Bun.spawn>;

type StartManagedViteDevServerOptions = {
  label: string;
  cwd?: string;
  env?: Record<string, string>;
};

export type ManagedViteDevServer = {
  devServerProcess: SpawnedCommand;
  devServerUrl: string;
  devServerPort: number;
};

export async function startManagedViteDevServer(
  options: StartManagedViteDevServerOptions,
): Promise<ManagedViteDevServer> {
  let selectedPort = await selectDevServerPort();
  let attempt = 1;

  while (true) {
    const devServerUrl = `http://${DEV_SERVER_HOST}:${selectedPort.port}`;
    logDevServerStart(options.label, selectedPort, devServerUrl);

    const devServerProcess = spawnCommand([
      "bun",
      "x",
      "vite",
      "--host",
      DEV_SERVER_HOST,
      "--port",
      String(selectedPort.port),
      "--strictPort",
    ], options.env, options.cwd);

    let devServerExitCode: number | null = null;
    void devServerProcess.exited.then((exitCode) => {
      devServerExitCode = exitCode;
    });

    try {
      await waitForDevServer(devServerUrl, selectedPort.port, () => devServerExitCode);
      return {
        devServerProcess,
        devServerUrl,
        devServerPort: selectedPort.port,
      };
    } catch (error) {
      stopCommand(devServerProcess);

      if (!shouldRetryDevServerStart(error, selectedPort, attempt)) {
        throw error;
      }

      const fallbackPort = await reserveFallbackDevServerPort(DEV_SERVER_HOST);
      console.warn(
        `${options.label} dev server could not finish binding on ${devServerUrl}; `
        + `retrying at http://${DEV_SERVER_HOST}:${fallbackPort}.`,
      );
      selectedPort = {
        requestedPort: selectedPort.requestedPort,
        port: fallbackPort,
        source: selectedPort.source,
        didFallback: true,
      };
      attempt += 1;
    }
  }
}

export function stopManagedViteDevServer(devServerProcess: SpawnedCommand): void {
  stopCommand(devServerProcess);
}

function shouldRetryDevServerStart(
  error: unknown,
  selectedPort: SelectedDevServerPort,
  attempt: number,
): boolean {
  if (selectedPort.source === "env" || attempt >= DEFAULT_DEV_SERVER_START_ATTEMPTS) {
    return false;
  }

  return error instanceof Error
    && error.message.includes("exited before it became ready");
}

function logDevServerStart(
  label: string,
  selectedPort: SelectedDevServerPort,
  devServerUrl: string,
): void {
  if (selectedPort.didFallback) {
    console.warn(
      `Default MaomiAgent ${label} dev server port ${selectedPort.requestedPort} is already in use; `
      + `starting at ${devServerUrl} instead.`,
    );
    return;
  }

  console.log(
    `Starting MaomiAgent ${label} dev server at ${devServerUrl} `
    + `(${selectedPort.source === "env"
      ? `from ${DEV_SERVER_PORT_ENV_NAME}`
      : `default fixed port ${DEFAULT_DEV_SERVER_PORT}`}).`,
  );
}

async function waitForDevServer(
  devServerUrl: string,
  devServerPort: number,
  getExitCode: () => number | null,
): Promise<void> {
  const deadline = Date.now() + DEV_SERVER_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const exitCode = getExitCode();
    if (exitCode !== null) {
      throw new Error(
        `Vite dev server exited before it became ready on ${DEV_SERVER_HOST}:${devServerPort} (code ${exitCode}). `
        + `If the port is already in use, set ${DEV_SERVER_PORT_ENV_NAME} to another port and retry.`,
      );
    }

    try {
      const response = await fetch(devServerUrl, { method: "HEAD" });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Retry until the managed dev server is reachable or times out.
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for the Vite dev server at ${devServerUrl}. `
    + `If the port is already in use, set ${DEV_SERVER_PORT_ENV_NAME} to another port and retry.`,
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function spawnCommand(
  command: string[],
  env?: Record<string, string>,
  cwd = process.cwd(),
): SpawnedCommand {
  return Bun.spawn({
    cmd: command,
    cwd,
    env: env ? { ...Bun.env, ...env } : undefined,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

function stopCommand(processHandle: SpawnedCommand): void {
  try {
    processHandle.kill();
  } catch {
    // Ignore cleanup failures while the child process is already stopping.
  }
}
