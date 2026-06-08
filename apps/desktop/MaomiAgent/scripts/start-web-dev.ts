import {
  DEFAULT_DEV_SERVER_PORT,
  DEV_SERVER_HOST,
  DEV_SERVER_PORT_ENV_NAME,
  resolveDevServerPort,
  resolveDevServerPortSource,
} from "./dev-server-port";

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  await runCommand(["bun", "run", "brand:generate"]);

  const devServerPort = resolveDevServerPort();
  const devServerPortSource = resolveDevServerPortSource();
  console.log(
    `Starting MaomiAgent web dev server at http://${DEV_SERVER_HOST}:${devServerPort} `
    + `(${devServerPortSource === "env"
      ? `from ${DEV_SERVER_PORT_ENV_NAME}`
      : `default fixed port ${DEFAULT_DEV_SERVER_PORT}`}).`,
  );

  await runCommand([
    "bun",
    "x",
    "vite",
    "--host",
    DEV_SERVER_HOST,
    "--port",
    String(devServerPort),
    "--strictPort",
  ]);
}

async function runCommand(command: string[]): Promise<void> {
  const processHandle = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await processHandle.exited;
  if (exitCode === 0) {
    return;
  }

  throw new Error(`Command failed with exit code ${exitCode}: ${command.join(" ")}`);
}
