import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type DesktopAppUpdateConfig = {
  provider: "github";
  owner: string;
  repo: string;
  channel: string;
  os: string;
  arch: string;
  includePrerelease: boolean;
};

type DesktopAppUpdatePlatform = {
  os: string;
  arch: string;
};

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
export const DEFAULT_DESKTOP_APP_UPDATE_CHANNEL = "stable";

export function resolveDesktopAppUpdateConfig(input: {
  packagedConfig?: unknown;
  env?: Record<string, string | undefined>;
} = {}): DesktopAppUpdateConfig {
  const packagedConfig = isRecord(input.packagedConfig) ? input.packagedConfig : {};
  const env = input.env ?? process.env;
  const currentPlatform = resolveDesktopAppUpdatePlatform();
  const channel = normalizeDesktopAppUpdateChannel(
    readText(packagedConfig, ["channel"]) ||
      normalizeText(env.MAOMI_RELEASE_CHANNEL),
  );

  return {
    provider: "github",
    owner:
      readText(packagedConfig, ["owner"]) ||
      resolveDesktopAppUpdateGitHubOwner(env),
    repo:
      readText(packagedConfig, ["repo"]) ||
      resolveDesktopAppUpdateGitHubRepo(env),
    channel,
    os:
      normalizeDesktopAppUpdateOs(readText(packagedConfig, ["os"])) ||
      normalizeDesktopAppUpdateOs(env.MAOMI_DESKTOP_UPDATE_OS) ||
      currentPlatform.os,
    arch:
      normalizeDesktopAppUpdateArch(readText(packagedConfig, ["arch"])) ||
      normalizeDesktopAppUpdateArch(env.MAOMI_DESKTOP_UPDATE_ARCH) ||
      currentPlatform.arch,
    includePrerelease:
      readBoolean(packagedConfig, ["includePrerelease"]) ||
      channel === "preview",
  };
}

export async function loadDesktopAppUpdateConfig(
  resourcesRoot: string | undefined,
  env: Record<string, string | undefined> = process.env,
): Promise<DesktopAppUpdateConfig> {
  const configPath = resourcesRoot
    ? path.join(resourcesRoot, "app", "update-config.json")
    : "";

  if (configPath && existsSync(configPath)) {
    const packagedConfig = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    return resolveDesktopAppUpdateConfig({
      packagedConfig,
      env,
    });
  }

  return resolveDesktopAppUpdateConfig({ env });
}

export function createPackagedDesktopAppUpdateConfig(input: {
  channel?: string;
  os?: string;
  arch?: string;
  includePrerelease?: boolean;
  env?: Record<string, string | undefined>;
} = {}): DesktopAppUpdateConfig {
  const env = input.env ?? process.env;
  const currentPlatform = resolveDesktopAppUpdatePlatform();
  const channel = normalizeDesktopAppUpdateChannel(
    input.channel || normalizeText(env.MAOMI_RELEASE_CHANNEL),
  );

  return {
    provider: "github",
    owner: resolveDesktopAppUpdateGitHubOwner(env),
    repo: resolveDesktopAppUpdateGitHubRepo(env),
    channel,
    os: normalizeDesktopAppUpdateOs(input.os) || currentPlatform.os,
    arch: normalizeDesktopAppUpdateArch(input.arch) || currentPlatform.arch,
    includePrerelease:
      typeof input.includePrerelease === "boolean"
        ? input.includePrerelease
        : channel === "preview",
  };
}

export function isDesktopAppUpdateConfigured(
  config: Pick<DesktopAppUpdateConfig, "owner" | "repo">,
): boolean {
  return Boolean(normalizeText(config.owner) && normalizeText(config.repo));
}

export function resolveDesktopAppUpdateGitHubOwner(
  env: Record<string, string | undefined> = process.env,
): string {
  const configuredOwner = normalizeText(env.MAOMI_DESKTOP_GITHUB_OWNER);
  if (configuredOwner) {
    return configuredOwner;
  }

  return parseGitHubRepository(env).owner;
}

export function resolveDesktopAppUpdateGitHubRepo(
  env: Record<string, string | undefined> = process.env,
): string {
  const configuredRepo = normalizeText(env.MAOMI_DESKTOP_GITHUB_REPO);
  if (configuredRepo) {
    return configuredRepo;
  }

  return parseGitHubRepository(env).repo;
}

export function normalizeDesktopAppUpdateChannel(value: unknown): string {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "preview" || normalized === "canary") {
    return "preview";
  }
  if (normalized === "dev") {
    return "dev";
  }
  return DEFAULT_DESKTOP_APP_UPDATE_CHANNEL;
}

export function normalizeDesktopAppUpdateOs(value: unknown): string {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "win32" || normalized === "win" || normalized === "windows") {
    return "win";
  }
  if (normalized === "darwin" || normalized === "mac" || normalized === "macos") {
    return "macos";
  }
  if (normalized === "linux") {
    return "linux";
  }
  return "";
}

export function normalizeDesktopAppUpdateArch(value: unknown): string {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "x64" || normalized === "amd64") {
    return "x64";
  }
  if (normalized === "arm64" || normalized === "aarch64") {
    return "arm64";
  }
  return "";
}

export function resolveDesktopAppUpdatePlatform(
  platform: string = process.platform,
  arch: string = process.arch,
): DesktopAppUpdatePlatform {
  return {
    os: normalizeDesktopAppUpdateOs(platform) || "win",
    arch: normalizeDesktopAppUpdateArch(arch) || "x64",
  };
}

export function buildDesktopGitHubApiUrl(
  config: Pick<DesktopAppUpdateConfig, "owner" | "repo">,
  ...segments: string[]
): string {
  return joinUrl(
    DEFAULT_GITHUB_API_BASE_URL,
    "repos",
    config.owner,
    config.repo,
    ...segments,
  );
}

export function buildDesktopLatestReleaseUrl(
  config: Pick<DesktopAppUpdateConfig, "owner" | "repo">,
): string {
  return buildDesktopGitHubApiUrl(config, "releases", "latest");
}

export function buildDesktopReleasesUrl(
  config: Pick<DesktopAppUpdateConfig, "owner" | "repo">,
): string {
  return buildDesktopGitHubApiUrl(config, "releases");
}

function parseGitHubRepository(env: Record<string, string | undefined>): {
  owner: string;
  repo: string;
} {
  const repository = normalizeText(env.GITHUB_REPOSITORY);
  if (!repository.includes("/")) {
    return {
      owner: "",
      repo: "",
    };
  }

  const [owner = "", repo = ""] = repository
    .split("/", 2)
    .map((segment) => segment.trim());

  return {
    owner,
    repo,
  };
}

function joinUrl(base: string, ...segments: string[]): string {
  const normalizedBase = base.replace(/\/+$/u, "");
  const normalizedSegments = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/gu, ""));
  return [normalizedBase, ...normalizedSegments].join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function readBoolean(value: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    if (typeof value[key] === "boolean") {
      return value[key] as boolean;
    }
  }
  return false;
}
