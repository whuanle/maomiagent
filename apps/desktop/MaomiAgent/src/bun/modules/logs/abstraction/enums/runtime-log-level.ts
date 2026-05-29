export const LOG_LEVEL_VALUES = ["debug", "info", "warn", "error"] as const;

export type RuntimeLogLevel = (typeof LOG_LEVEL_VALUES)[number];