export const LOG_LEVEL_VALUES = ["debug", "info", "warn", "error"] as const;

export type RuntimeLogLevel = (typeof LOG_LEVEL_VALUES)[number];

export type RuntimeLogWriteInput = {
  level: RuntimeLogLevel;
  source: string;
  module: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  workspaceId?: string;
  runId?: string;
  taskId?: string;
  traceId?: string;
};

export type RuntimeLogRecord = {
  id: string;
  at: string;
  level: RuntimeLogLevel;
  source: string;
  module: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  workspaceId?: string;
  runId?: string;
  taskId?: string;
  traceId?: string;
};

export type RuntimeLogsQuery = {
  q?: string;
  level?: RuntimeLogLevel;
  levels?: RuntimeLogLevel[];
  source?: string;
  module?: string;
  from?: string;
  to?: string;
  workspaceId?: string;
  runId?: string;
  taskId?: string;
  traceId?: string;
  limit?: number;
  offset?: number;
};

export type RuntimeLogsListResponse = {
  items: RuntimeLogRecord[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type RuntimeLogsSummary = {
  total: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
  byModule: Record<string, number>;
};

export type RuntimeLogExtra = Omit<
  RuntimeLogWriteInput,
  "level" | "source" | "module" | "message"
> & {
  error?: unknown;
  attributes?: Record<string, unknown>;
  location?: string;
};

export type RuntimeLogger = {
  write: (
    level: RuntimeLogLevel,
    message: string,
    extra?: RuntimeLogExtra,
  ) => Promise<RuntimeLogRecord>;
  debug: (message: string, extra?: RuntimeLogExtra) => Promise<RuntimeLogRecord>;
  info: (message: string, extra?: RuntimeLogExtra) => Promise<RuntimeLogRecord>;
  warn: (message: string, extra?: RuntimeLogExtra) => Promise<RuntimeLogRecord>;
  error: (message: string, extra?: RuntimeLogExtra) => Promise<RuntimeLogRecord>;
};

export type RuntimeLogsDeleteResponse = {
  deleted: number;
};