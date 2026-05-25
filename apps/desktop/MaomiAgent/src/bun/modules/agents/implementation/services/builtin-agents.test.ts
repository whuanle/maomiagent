import { expect, test } from "bun:test";

import {
  BUILTIN_MAOMI_AGENTS,
  resolveBuiltinDefaultAgentId,
} from "./builtin-agents";
import {
  CONCISE_AGENT_ID,
  DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
  WECHAT_AGENT_ID,
} from "../../../../../shared/conversation/managed-execution";

test("builtin agent default resolves to concise mode when available", () => {
  expect(DEFAULT_DESKTOP_PRIMARY_AGENT_ID).toBe(CONCISE_AGENT_ID);
  expect(resolveBuiltinDefaultAgentId((agentId) => agentId === CONCISE_AGENT_ID)).toBe(CONCISE_AGENT_ID);
});

test("builtin concise agent uses the concise mode label", () => {
  expect(BUILTIN_MAOMI_AGENTS.find((item) => item.agentId === CONCISE_AGENT_ID)?.name).toBe("简洁模式");
});

test("builtin wechat agent is a visible primary agent with a lightweight executor prompt", () => {
  const item = BUILTIN_MAOMI_AGENTS.find((agent) => agent.agentId === WECHAT_AGENT_ID);

  expect(item).toMatchObject({
    agentId: WECHAT_AGENT_ID,
    name: "微信专用",
    mode: "primary",
    enabled: true,
    source: "builtin-maomi",
  });
  expect(item?.prompt).toContain("微信轻量执行器");
  expect(item?.prompt).toContain("短回复");
  expect(item?.prompt).toContain("桌面截图");
  expect(item?.prompt).toContain("这类任务请到桌面继续");
  expect(item?.prompt).toContain("<tool_call>");
  expect(item?.prompt).toContain("不要输出 reasoning");
});
