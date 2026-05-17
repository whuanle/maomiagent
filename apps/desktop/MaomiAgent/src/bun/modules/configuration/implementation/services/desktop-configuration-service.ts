import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type { DesktopRuntimeContext } from "../../../foundation";
import type {
  DesktopConfigurationInput,
  DesktopConfigurationSnapshot,
  DesktopConfigurationSource,
  DesktopConfigurationValues,
} from "../../abstraction/models/desktop-configuration.models";
import type { DesktopConfigurationPort } from "../../abstraction/ports/desktop-configuration.port";

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJsonObject(value: string | undefined): DesktopConfigurationValues | undefined {
  const trimmed = trimText(value);
  if (!trimmed) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Desktop configuration JSON must be an object.");
  }
  return parsed as DesktopConfigurationValues;
}

function parseHeaders(value: string | undefined): Record<string, string> | undefined {
  const trimmed = trimText(value);
  if (!trimmed) {
    return undefined;
  }

  return Object.fromEntries(trimmed
    .split(",")
    .map((item) => item.split("="))
    .map(([name, ...parts]) => [name?.trim() ?? "", parts.join("=").trim()])
    .filter(([name, headerValue]) => name && headerValue));
}

function isRecord(value: unknown): value is DesktopConfigurationValues {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: DesktopConfigurationValues): DesktopConfigurationValues {
  return JSON.parse(JSON.stringify(value)) as DesktopConfigurationValues;
}

function mergeValues(
  target: DesktopConfigurationValues,
  source: DesktopConfigurationValues | undefined,
): DesktopConfigurationValues {
  if (!source) {
    return target;
  }

  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(target[key])) {
      target[key] = mergeValues({ ...(target[key] as DesktopConfigurationValues) }, value);
      continue;
    }
    target[key] = value;
  }

  return target;
}

function setPathValue(
  target: DesktopConfigurationValues,
  path: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }

  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current = target;
  parts.slice(0, -1).forEach((part) => {
    if (!isRecord(current[part])) {
      current[part] = {};
    }
    current = current[part] as DesktopConfigurationValues;
  });
  const last = parts.at(-1);
  if (last) {
    current[last] = value;
  }
}

function getPathValue(source: DesktopConfigurationValues, key: string): unknown {
  return key
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<unknown>((current, part) => {
      if (!isRecord(current)) {
        return undefined;
      }
      return current[part];
    }, source);
}

function resolveConfigFilePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function splitFiles(value: string | undefined): string[] {
  const trimmed = trimText(value);
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function resolveDefaultConfigFiles(): string[] {
  return [
    join(homedir(), ".maomiagent", "desktop", "config.json"),
    resolve(process.cwd(), "desktop.config.json"),
    resolve(process.cwd(), "desktop.config.local.json"),
  ];
}

function readJsonFile(path: string): DesktopConfigurationValues {
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Desktop configuration file must contain an object: ${path}`);
  }
  return parsed;
}

function buildEnvironmentValues(
  environment: Record<string, string | undefined>,
): DesktopConfigurationValues {
  const values: DesktopConfigurationValues = {};
  const logDbPath =
    trimText(environment.MAOMI_DESKTOP_LOG_DB_PATH)
    ?? trimText(environment.MAOMI_AGENT_LOG_DB_PATH)
    ?? trimText(environment.MAOMI_LOG_DB_PATH);
  const workspaceDbPath = trimText(environment.MAOMI_DESKTOP_WORKSPACE_DB_PATH);
  const conversationDbPath = trimText(environment.MAOMI_DESKTOP_CONVERSATION_DB_PATH);
  const otlpEndpoint =
    trimText(environment.MAOMI_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
    ?? trimText(environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
    ?? trimText(environment.MAOMI_OTEL_EXPORTER_OTLP_ENDPOINT)
    ?? trimText(environment.OTEL_EXPORTER_OTLP_ENDPOINT);

  setPathValue(values, "logs.database.name", trimText(environment.MAOMI_DESKTOP_LOG_DATABASE_NAME));
  setPathValue(values, "logs.database.path", logDbPath);
  setPathValue(values, "database.connections.runtimeLogs.path", logDbPath);
  setPathValue(values, "database.connections.workspace.path", workspaceDbPath);
  setPathValue(values, "database.connections.conversation.path", conversationDbPath);
  setPathValue(values, "observability.serviceName", trimText(environment.OTEL_SERVICE_NAME));
  setPathValue(values, "observability.tracing.otlpEndpoint", otlpEndpoint);
  setPathValue(values, "observability.tracing.consoleExporter", parseBoolean(
    environment.MAOMI_OTEL_CONSOLE_EXPORTER ?? environment.OTEL_CONSOLE_EXPORTER,
  ));
  setPathValue(values, "observability.tracing.headers", parseHeaders(environment.OTEL_EXPORTER_OTLP_HEADERS));

  return values;
}

function buildRuntimeValues(runtimeContext: DesktopRuntimeContext): DesktopConfigurationValues {
  return {
    app: {
      identifier: runtimeContext.appIdentifier,
      name: runtimeContext.appName,
      channel: runtimeContext.channel,
      mainViewUrl: runtimeContext.mainViewUrl,
    },
    logs: {
      database: {
        name: "runtimeLogs",
        path: join(homedir(), ".maomiagent", "desktop", "logs", "logs.sqlite"),
      },
    },
    database: {
      connections: {
        runtimeLogs: {
          path: join(homedir(), ".maomiagent", "desktop", "logs", "logs.sqlite"),
          pragmas: ["PRAGMA journal_mode = WAL;"],
        },
        workspace: {
          path: join(homedir(), ".maomiagent", "desktop", "data", "workspace.sqlite"),
          pragmas: ["PRAGMA journal_mode = WAL;", "PRAGMA foreign_keys = ON;"],
        },
        conversation: {
          path: join(homedir(), ".maomiagent", "desktop", "data", "conversation.sqlite"),
          pragmas: ["PRAGMA journal_mode = WAL;", "PRAGMA foreign_keys = ON;"],
        },
      },
    },
    observability: runtimeContext.observability ?? {},
  };
}

export class DesktopConfigurationService implements DesktopConfigurationPort {
  private readonly values: DesktopConfigurationValues;
  private readonly sources: DesktopConfigurationSource[];

  constructor(runtimeContext: DesktopRuntimeContext) {
    const input: DesktopConfigurationInput = runtimeContext.configuration ?? {};
    const environment = input.environment ?? process.env;
    const sources: DesktopConfigurationSource[] = [{ name: "runtime" }];
    const values = buildRuntimeValues(runtimeContext);

    const inlineJson = parseJsonObject(environment.MAOMI_DESKTOP_CONFIG_JSON);
    if (inlineJson) {
      mergeValues(values, inlineJson);
      sources.push({ name: "env:MAOMI_DESKTOP_CONFIG_JSON" });
    }

    const configuredFiles = [
      ...splitFiles(environment.MAOMI_DESKTOP_CONFIG_FILE),
      ...(input.files ?? []),
    ].map(resolveConfigFilePath);
    const files = configuredFiles.length > 0
      ? configuredFiles
      : resolveDefaultConfigFiles();

    for (const filePath of files) {
      if (!existsSync(filePath)) {
        continue;
      }
      mergeValues(values, readJsonFile(filePath));
      sources.push({ name: "file", path: filePath });
    }

    mergeValues(values, buildEnvironmentValues(environment));
    sources.push({ name: "environment" });

    mergeValues(values, input.values);
    if (input.values) {
      sources.push({ name: "bootstrap" });
    }

    this.values = values;
    this.sources = sources;
  }

  get<TValue = unknown>(key: string): TValue | undefined {
    return getPathValue(this.values, key) as TValue | undefined;
  }

  getString(key: string, fallback?: string): string | undefined {
    const value = this.get(key);
    return trimText(typeof value === "string" ? value : undefined) ?? fallback;
  }

  getBoolean(key: string, fallback?: boolean): boolean | undefined {
    return parseBoolean(this.get(key)) ?? fallback;
  }

  getNumber(key: string, fallback?: number): number | undefined {
    return parseNumber(this.get(key)) ?? fallback;
  }

  getRecord(key: string): DesktopConfigurationValues | undefined {
    const value = this.get(key);
    return isRecord(value) ? value : undefined;
  }

  requireString(key: string): string {
    const value = this.getString(key);
    if (!value) {
      throw new Error(`Missing required desktop configuration value: ${key}`);
    }
    return value;
  }

  snapshot(): DesktopConfigurationSnapshot {
    return {
      values: cloneRecord(this.values),
      sources: this.sources.map((source) => ({ ...source })),
    };
  }
}