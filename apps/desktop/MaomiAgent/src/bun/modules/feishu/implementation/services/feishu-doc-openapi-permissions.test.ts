import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";
import { normalizeFeishuDocPermissionError } from "./feishu-doc-openapi-permissions";

describe("normalizeFeishuDocPermissionError", () => {
  test("surfaces missing user scopes with a reauthorize hint", () => {
    const error = new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 400 (code 99991679): Unauthorized",
      status: 400,
      code: 99991679,
      responseText: JSON.stringify({
        code: 99991679,
        msg: "Unauthorized. required one of these privileges under the user identity: [docx:document.block:convert]",
      }),
    });

    expect(normalizeFeishuDocPermissionError(error).message).toBe(
      "当前飞书授权缺少用户权限：docx:document.block:convert。请先在飞书开放平台为智能助手应用开通对应用户权限，再回到 MaomiAgent 点击“重新授权”后重试。",
    );
  });

  test("surfaces missing app scopes with a publish-and-reauthorize hint", () => {
    const error = new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 403 (code 99991672): Access denied",
      status: 403,
      code: 99991672,
      responseText: JSON.stringify({
        code: 99991672,
        msg: "Access denied. One of the following scopes is required: [docx:document.block:write]",
        permission_violations: [{ required_scope: "docx:document.block:write" }],
      }),
    });

    expect(normalizeFeishuDocPermissionError(error).message).toBe(
      "当前飞书应用缺少接口权限：docx:document.block:write。请先在飞书开放平台为智能助手应用开通对应权限并重新发布，再回到 MaomiAgent 点击“重新授权”后重试。",
    );
  });
});
