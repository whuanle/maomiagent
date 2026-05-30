function normalizeScopeList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(" ").map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  }
  return [];
}

export function readDesktopFeishuAccessTokenScopes(token: string): string[] {
  const payload = token.split(".")[1];
  if (!payload) {
    return [];
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      scope?: string | string[];
    };
    return normalizeScopeList(decoded.scope);
  } catch {
    return [];
  }
}
