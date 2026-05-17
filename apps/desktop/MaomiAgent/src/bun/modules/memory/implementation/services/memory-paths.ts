import { constants as fsConstants, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const GLOBAL_MEMORY_CONTEXT_ID = "global";

export type DesktopMemoryPaths = {
  configDir: string;
  memoryDir: string;
  globalDbPath: string;
  legacyMemoryDirs: string[];
};

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveDesktopMemoryPaths(): DesktopMemoryPaths {
  const rawConfigDir = readTrimmedEnv("MAOMI_CONFIG_DIR");
  const configDir = rawConfigDir ? resolve(rawConfigDir) : join(homedir(), ".maomiagent");
  const memoryDir = join(configDir, "memory");

  return {
    configDir,
    memoryDir,
    globalDbPath: join(memoryDir, "global.sqlite"),
    legacyMemoryDirs: [
      join(process.cwd(), ".opencode", "memory"),
      join(process.cwd(), "..", ".opencode", "memory"),
    ],
  };
}

export async function ensureDesktopMemoryLayout(paths: DesktopMemoryPaths): Promise<void> {
  await fs.mkdir(paths.memoryDir, { recursive: true });
}

export async function pathExists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}