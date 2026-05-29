import type {
  RuntimeLogger,
  RuntimeLogRecord,
  RuntimeLogWriteInput,
  RuntimeLogsListResponse,
  RuntimeLogsQuery,
  RuntimeLogsSummary,
} from "../models/runtime-log.models";

export interface RuntimeLogWriterPort {
  write(input: RuntimeLogWriteInput): RuntimeLogRecord;
}

export interface RuntimeLogsQueryPort {
  query(input?: RuntimeLogsQuery): RuntimeLogsListResponse;
  summary(input?: RuntimeLogsQuery): RuntimeLogsSummary;
  clear(): number;
  deleteByQuery(input?: RuntimeLogsQuery): number;
}

export interface RuntimeLoggerFactoryPort {
  createLogger(input: {
    source: string;
    module: string;
  }): RuntimeLogger;
}