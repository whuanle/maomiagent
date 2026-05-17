import type { Attributes } from "@opentelemetry/api";

export type DesktopSpanStatus = "ok" | "error" | "unset";

export type DesktopTraceSpan = {
  traceId: string;
  spanId: string;
  setAttribute: (name: string, value: Attributes[string]) => void;
  setAttributes: (attributes: Attributes) => void;
  recordException: (error: unknown) => void;
  setStatus: (status: DesktopSpanStatus, message?: string) => void;
  end: () => void;
};

export type DesktopTraceInput = {
  name: string;
  attributes?: Attributes;
};