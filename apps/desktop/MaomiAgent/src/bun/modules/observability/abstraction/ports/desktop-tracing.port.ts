import type {
  DesktopTraceInput,
  DesktopTraceSpan,
} from "../models/desktop-tracing.models";

export type DesktopTracePort = {
  startSpan: (input: DesktopTraceInput) => DesktopTraceSpan;
  trace: <T>(
    input: DesktopTraceInput,
    callback: (span: DesktopTraceSpan) => T | Promise<T>,
  ) => T | Promise<T>;
};