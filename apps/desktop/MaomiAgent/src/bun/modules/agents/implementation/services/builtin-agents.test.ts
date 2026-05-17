import { expect, test } from "bun:test";

import {
  BUILTIN_MAOMI_AGENTS,
  resolveBuiltinDefaultAgentId,
} from "./builtin-agents";
import {
  CONCISE_AGENT_ID,
  DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
} from "../../../../../shared/conversation/managed-execution";

test("builtin agent default resolves to concise mode when available", () => {
  expect(DEFAULT_DESKTOP_PRIMARY_AGENT_ID).toBe(CONCISE_AGENT_ID);
  expect(resolveBuiltinDefaultAgentId((agentId) => agentId === CONCISE_AGENT_ID)).toBe(CONCISE_AGENT_ID);
});

test("builtin concise agent uses the concise mode label", () => {
  expect(BUILTIN_MAOMI_AGENTS.find((item) => item.agentId === CONCISE_AGENT_ID)?.name).toBe("简洁模式");
});