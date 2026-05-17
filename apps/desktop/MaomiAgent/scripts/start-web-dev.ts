import { DEV_SERVER_HOST, resolveAvailablePort } from "./dev-server-port";

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  await runCommand(["bun", "run", "brand:generate"]);

  const devServerPort = await resolveAvailablePort();
  console.log(`Starting MaomiAgent web dev server at http://${DEV_SERVER_HOST}:${devServerPort}.`);

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