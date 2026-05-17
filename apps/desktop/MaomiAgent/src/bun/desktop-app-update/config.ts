import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type DesktopAppUpdateConfig = {
  publicBaseUrl: string;
  softwareCode: string;
  channel: string;
  os: string;
  arch: string;
};

export const DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL = "https://downloads.example.com/maomiagent/public";
export const DEFAULT_DESKTOP_APP_UPDATE_SOFTWARE_CODE = "maomiagent";
export const DEFAULT_DESKTOP_APP_UPDATE_CHANNEL = "stable";

export function resolveDesktopAppUpdateConfig(input: {
  packagedConfig?: unknown;
  env?: Record<string, string | undefined>;
} = {}): DesktopAppUpdateConfig {
  const packagedConfig = isRecord(input.packagedConfig) ? input.packagedConfig : {};
  const packagedPublicBaseUrl = readConfiguredText(packagedConfig, ["publicBaseUrl"]);
  const env = input.env ?? process.env;

  return {
    publicBaseUrl: packagedPublicBaseUrl.found
      ? packagedPublicBaseUrl.value
      : normalizeText(env.MAOMI_DESKTOP_PUBLIC_SOFTWARE_BASE_URL) || DEFAULT_DESKTOP_APP_UPDATE_PUBLIC_BASE_URL,
    softwareCode:
      readText(packagedConfig, ["softwareCode"]) ||
      normalizeText(env.MAOMI_RELEASE_APP_CODE) ||
      DEFAULT_DESKTOP_APP_UPDATE_SOFTWARE_CODE,
    channel:
      readText(packagedConfig, ["channel"]) ||
      normalizeText(env.MAOMI_RELEASE_CHANNEL) ||
      DEFAULT_DESKTOP_APP_UPDATE_CHANNEL,
    os: readText(packagedConfig, ["os"]) || "win",
    arch: readText(packagedConfig, ["arch"]) || "x64",
  };
}

export async function loadDesktopAppUpdateConfig(
  resourcesRoot: string | undefined,
  env: Record<string, string | undefined> = process.env,
): Promise<DesktopAppUpdateConfig> {
  const configPath = resourcesRoot ? path.join(resourcesRoot, "app", "update-config.json") : "";
  if (configPath && existsSync(configPath)) {
    const packagedConfig = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    return resolveDesktopAppUpdateConfig({
      packagedConfig,
      env,
    });
  }

  return resolveDesktopAppUpdateConfig({ env });
}

type ConfiguredTextResult = {
  found: boolean;
  value: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readConfiguredText(value: Record<string, unknown>, keys: string[]): ConfiguredTextResult {
  for (const key of keys) {
    if (Object.hasOwn(value, key) && typeof value[key] === "string") {
      return {
        found: true,
        value: value[key].trim(),
      };
    }
  }

  return {
    found: false,
    value: "",
  };
}

function readText(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}