import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { resolveLaunchPath } from "./platform.js";

export async function launchGui({ runtimeRoot, target, dryRun = false }) {
  const launchPath = resolveLaunchPath(runtimeRoot, target);

  if (!existsSync(launchPath)) {
    throw new Error(`Missing launch target: ${launchPath}`);
  }

  if (dryRun || process.env.MAOMI_AGENT_LAUNCH_TEST === "1") {
    console.log(`Dry run: ${launchPath}`);
    return {
      didLaunch: false,
      launchPath,
    };
  }

  const child = target.os === "macos"
    ? spawn("open", [launchPath], {
      detached: true,
      stdio: "ignore",
    })
    : spawn(launchPath, [], {
      cwd: path.dirname(launchPath),
      detached: true,
      stdio: "ignore",
    });

  child.unref();

  return {
    didLaunch: true,
    launchPath,
  };
}
