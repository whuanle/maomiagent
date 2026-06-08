export const DEV_SERVER_HOST = "127.0.0.1";
export const DEFAULT_DEV_SERVER_PORT = 35001;
export const DEV_SERVER_PORT_ENV_NAME = "MAOMI_DESKTOP_DEV_SERVER_PORT";

function parseDevServerPortValue(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    return null;
  }

  return parsed;
}

export function resolveDevServerPort(): number {
  if (typeof process === "undefined" || typeof process.env !== "object" || !process.env) {
    return DEFAULT_DEV_SERVER_PORT;
  }

  return parseDevServerPortValue(process.env[DEV_SERVER_PORT_ENV_NAME]) ?? DEFAULT_DEV_SERVER_PORT;
}

export function resolveDevServerPortSource(): "default" | "env" {
  if (typeof process === "undefined" || typeof process.env !== "object" || !process.env) {
    return "default";
  }

  return parseDevServerPortValue(process.env[DEV_SERVER_PORT_ENV_NAME]) === null ? "default" : "env";
}
