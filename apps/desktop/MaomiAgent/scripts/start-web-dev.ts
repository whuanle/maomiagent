import {
  startManagedViteDevServer,
  stopManagedViteDevServer,
} from "./vite-dev-server";

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  await runCommand(["bun", "run", "brand:generate"]);
  const { devServerProcess } = await startManagedViteDevServer({
    label: "web",
  });
  try {
    await devServerProcess.exited;
  } finally {
    stopManagedViteDevServer(devServerProcess);
  }
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
