import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const launcherPath = path.join(path.dirname(process.execPath), "bin", "launcher.exe");

if (!existsSync(launcherPath)) {
  console.error(`Missing portable launcher target: ${launcherPath}`);
  process.exit(1);
}

const child = spawn(launcherPath, process.argv.slice(2), {
  cwd: path.dirname(launcherPath),
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.unref();
