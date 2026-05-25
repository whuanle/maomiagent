import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { createSkillsDiscoveryDefinitions } from "./skills-discovery-definitions";

describe("createSkillsDiscoveryDefinitions", () => {
  test("includes both .agent and .agents skill directories for antigravity discovery", () => {
    const userHomeDir = join("C:", "Users", "tester");
    const antigravity = createSkillsDiscoveryDefinitions(userHomeDir)
      .find((definition) => definition.source === "antigravity");

    expect(antigravity).toBeDefined();
    expect(antigravity?.label).toBe("Antigravity (.agent/.agents/skills)");
    expect(antigravity?.envCandidates).toEqual([
      "ANTIGRAVITY_HOME",
      "AGENT_HOME",
      "AGENTS_HOME",
    ]);
    expect(antigravity?.fallbackPaths).toEqual([
      join(userHomeDir, ".agent", "skills"),
      join(userHomeDir, ".agents", "skills"),
    ]);
  });
});
