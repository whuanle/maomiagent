import { expect, test } from "bun:test"

import { CONCISE_AGENT_ID } from "../../../shared/conversation/managed-execution"
import { compareAgentsByName } from "./helpers"

test("compareAgentsByName keeps concise mode at the top", () => {
  const items = [
    { agentId: "dev-coordinator", name: "研发统筹" },
    { agentId: CONCISE_AGENT_ID, name: "简洁模式" },
    { agentId: "managed-autopilot", name: "全托管" },
  ]

  items.sort(compareAgentsByName)

  expect(items[0]?.agentId).toBe(CONCISE_AGENT_ID)
})