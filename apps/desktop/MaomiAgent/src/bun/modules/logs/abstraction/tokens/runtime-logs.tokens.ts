import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  RuntimeLoggerFactoryPort,
  RuntimeLogsQueryPort,
  RuntimeLogWriterPort,
} from "../ports/runtime-logs.ports";

const logsShared = createServiceNamespace("desktop.logs.shared");

export const RUNTIME_LOG_WRITER_PORT =
  logsShared.token<RuntimeLogWriterPort>("runtime-log-writer");
export const RUNTIME_LOGS_QUERY_PORT =
  logsShared.token<RuntimeLogsQueryPort>("runtime-logs-query");
export const RUNTIME_LOGGER_FACTORY_PORT =
  logsShared.token<RuntimeLoggerFactoryPort>("runtime-logger-factory");