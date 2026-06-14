import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ManagedSkillsService } from "./managed-skills-service";

describe("ManagedSkillsService discovery", () => {
  test("keeps antigravity directories visible even when they are managed roots", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-skills-discovery-"));
    const agentsHome = join(tempRoot, "agents-home");
    const skillsRoot = join(agentsHome, "skills");
    const skillRoot = join(skillsRoot, "sample-skill");
    const configRoot = join(tempRoot, "config");

    const previousAgentsHome = process.env.AGENTS_HOME;
    const previousAgentHome = process.env.AGENT_HOME;
    const previousMaomiConfigDir = process.env.MAOMI_CONFIG_DIR;

    await mkdir(skillRoot, { recursive: true });
    await mkdir(configRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), [
      "---",
      "name: sample-skill",
      "description: sample skill for discovery test",
      "---",
      "",
      "content",
    ].join("\n"), "utf-8");

    process.env.AGENTS_HOME = agentsHome;
    delete process.env.AGENT_HOME;
    process.env.MAOMI_CONFIG_DIR = configRoot;

    try {
      const service = new ManagedSkillsService({
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      } as never);

      const result = await service.discover();
      const antigravity = result.sources.find((source) => source.source === "antigravity");
      const discovered = result.items.find((item) => item.skillId === "sample-skill");

      expect(antigravity?.existingPaths).toContain(skillsRoot);
      expect(discovered).toMatchObject({
        source: "antigravity",
        sourcePath: skillRoot,
        state: "adopted",
      });
    } finally {
      if (previousAgentsHome === undefined) {
        delete process.env.AGENTS_HOME;
      } else {
        process.env.AGENTS_HOME = previousAgentsHome;
      }

      if (previousAgentHome === undefined) {
        delete process.env.AGENT_HOME;
      } else {
        process.env.AGENT_HOME = previousAgentHome;
      }

      if (previousMaomiConfigDir === undefined) {
        delete process.env.MAOMI_CONFIG_DIR;
      } else {
        process.env.MAOMI_CONFIG_DIR = previousMaomiConfigDir;
      }

      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("hydrates installed skill metadata from SKILL frontmatter", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-skills-effective-"));
    const agentsHome = join(tempRoot, "agents-home");
    const skillsRoot = join(agentsHome, "skills");
    const skillRoot = join(skillsRoot, "sample-skill");
    const configRoot = join(tempRoot, "config");

    const previousAgentsHome = process.env.AGENTS_HOME;
    const previousAgentHome = process.env.AGENT_HOME;
    const previousMaomiConfigDir = process.env.MAOMI_CONFIG_DIR;

    await mkdir(skillRoot, { recursive: true });
    await mkdir(configRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), [
      "---",
      "name: Sample Skill",
      "description: Sample description from frontmatter",
      "---",
      "",
      "content",
    ].join("\n"), "utf-8");

    process.env.AGENTS_HOME = agentsHome;
    delete process.env.AGENT_HOME;
    process.env.MAOMI_CONFIG_DIR = configRoot;

    try {
      const service = new ManagedSkillsService({
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      } as never);

      const result = await service.getEffective("workspace-1");
      const row = result.items.find((item) => item.item.skillId === "sample-skill");

      expect(row).toMatchObject({
        included: true,
        decision: "effective",
        item: {
          skillId: "sample-skill",
          name: "Sample Skill",
          description: "Sample description from frontmatter",
        },
      });
    } finally {
      if (previousAgentsHome === undefined) {
        delete process.env.AGENTS_HOME;
      } else {
        process.env.AGENTS_HOME = previousAgentsHome;
      }

      if (previousAgentHome === undefined) {
        delete process.env.AGENT_HOME;
      } else {
        process.env.AGENT_HOME = previousAgentHome;
      }

      if (previousMaomiConfigDir === undefined) {
        delete process.env.MAOMI_CONFIG_DIR;
      } else {
        process.env.MAOMI_CONFIG_DIR = previousMaomiConfigDir;
      }

      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
