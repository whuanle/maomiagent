import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function extractMissingScopes(payload: Record<string, unknown> | undefined): string[] {
  const scopes = new Set<string>();
  const permissionViolations = Array.isArray(payload?.permission_violations)
    ? payload.permission_violations
    : [];

  for (const item of permissionViolations) {
    const violation = asRecord(item);
    const candidates = [
      violation?.scope,
      violation?.required_scope,
      violation?.permission,
    ];
    for (const candidate of candidates) {
      const scope = trimText(candidate);
      if (scope) {
        scopes.add(scope);
      }
    }

    const nestedScopes = Array.isArray(violation?.scopes) ? violation.scopes : [];
    for (const nested of nestedScopes) {
      const scope = trimText(nested);
      if (scope) {
        scopes.add(scope);
      }
    }
  }

  const message = trimText(payload?.msg) ?? trimText(payload?.message);
  const match = message?.match(/\[([^\]]+)\]/);
  if (match?.[1]) {
    for (const item of match[1].split(",")) {
      const scope = trimText(item);
      if (scope) {
        scopes.add(scope);
      }
    }
  }

  return [...scopes];
}

function readPermissionPayload(error: unknown): {
  code?: number;
  scopes: string[];
} | null {
  if (error instanceof DesktopFeishuOpenApiError) {
    const payload = asRecord(parsePermissionResponseText(error.responseText));
    return {
      code: error.code ?? (typeof payload?.code === "number" ? payload.code : undefined),
      scopes: extractMissingScopes(payload),
    };
  }

  const payload = asRecord(asRecord(error)?.responseText);
  if (payload) {
    return {
      code: typeof payload.code === "number" ? payload.code : undefined,
      scopes: extractMissingScopes(payload),
    };
  }

  return null;
}

function parsePermissionResponseText(value: string | undefined): unknown {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeFeishuDocPermissionError(error: unknown): Error {
  const payload = readPermissionPayload(error);
  if (!payload?.code) {
    return error instanceof Error ? error : new Error(String(error ?? "飞书 OpenAPI 调用失败。"));
  }

  const scopeHint = payload.scopes.length > 0
    ? `：${payload.scopes.join(", ")}`
    : "";

  if (payload.code === 99991679) {
    return new Error(
      `当前飞书授权缺少用户权限${scopeHint}。请先在飞书开放平台为智能助手应用开通对应用户权限，再回到 MaomiAgent 点击“重新授权”后重试。`,
    );
  }

  if (payload.code === 99991672) {
    return new Error(
      `当前飞书应用缺少接口权限${scopeHint}。请先在飞书开放平台为智能助手应用开通对应权限并重新发布，再回到 MaomiAgent 点击“重新授权”后重试。`,
    );
  }

  return error instanceof Error ? error : new Error(String(error ?? "飞书 OpenAPI 调用失败。"));
}
