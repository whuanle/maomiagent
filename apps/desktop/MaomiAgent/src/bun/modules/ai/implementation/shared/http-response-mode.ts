export type HttpResponseMode = "stream" | "json";

export function looksLikeJsonPayloadPrefix(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function inferHttpResponseMode(contentType: string | null | undefined): HttpResponseMode {
  const normalized = contentType?.toLowerCase() ?? "";
  if (normalized.includes("text/event-stream")) {
    return "stream";
  }

  return "json";
}
