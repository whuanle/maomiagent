import type {
  FeishuDocPermissionDiagnosticCategory,
  FeishuDocPermissionDiagnosticEntryView,
  FeishuDocWhiteboardRecoveryDiagnosticsView,
} from "../../../../../shared/desktop-feishu";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import {
  DesktopFeishuOpenApiError,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";

const CONFIRMED_PERMISSION_CODES = new Set<number>([2890005, 131006, 1770032]);
const NETWORK_PATTERNS = [
  "fetch failed",
  "network",
  "timeout",
  "timed out",
  "econnreset",
  "econnrefused",
  "socket hang up",
] as const;

function extractErrorCode(message: string): number | undefined {
  const match = message.match(/\bcode\s+(\d+)\b/i) ?? message.match(/\((\d+)\)/);
  if (!match?.[1]) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function classifyFeishuDocDiagnosticError(error: unknown): {
  category: FeishuDocPermissionDiagnosticCategory;
  code?: number;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown Feishu error");
  const normalized = message.toLowerCase();
  const code = error instanceof DesktopFeishuOpenApiError ? error.code : extractErrorCode(message);

  if (isDesktopFeishuAccessTokenExpiredError(error)) {
    return { category: "auth", code, message };
  }
  if (code != null && CONFIRMED_PERMISSION_CODES.has(code)) {
    return { category: "permission", code, message };
  }
  if (NETWORK_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return { category: "network", code, message };
  }
  return { category: "unknown", code, message };
}

export function summarizeWhiteboardRecoveryDiagnostics(input: {
  recoveredCount: number;
  entries: FeishuDocPermissionDiagnosticEntryView[];
}): FeishuDocWhiteboardRecoveryDiagnosticsView {
  const fallbackCount = input.entries.filter((entry) => entry.fallbackApplied).length;
  const permissionDeniedCount = input.entries.filter((entry) => entry.category === "permission").length;
  return {
    status: fallbackCount === 0 ? "ok" : input.recoveredCount > 0 ? "partial" : "blocked",
    recoveredCount: input.recoveredCount,
    fallbackCount,
    permissionDeniedCount,
    documentPermissionDenied: input.entries.some((entry) =>
      entry.category === "permission" && (entry.stage === "wiki" || entry.stage === "docx")
    ),
    entries: input.entries,
  };
}

export function extractInspectableWhiteboardTokens(ir: FeishuDocIR, limit = 3): string[] {
  const ordered = Object.values(ir.blocks)
    .filter((block) =>
      (block.type === "whiteboard" || block.type === "board" || block.type === "diagram")
      && block.resource?.token
    )
    .map((block) => block.resource!.token);
  return [...new Set(ordered)].slice(0, limit);
}
