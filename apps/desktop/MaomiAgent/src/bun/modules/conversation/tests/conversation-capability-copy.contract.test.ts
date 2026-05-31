import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workspaceRoot = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8");
}

describe("conversation capability copy", () => {
  test("uses task-focused Chinese descriptions across providers and settings panel", async () => {
    const mcpProvider = await source("src/bun/modules/mcp/implementation/services/desktop-mcp-conversation-capability-provider.ts");
    const skillsProvider = await source("src/bun/modules/skills/implementation/services/desktop-skills-conversation-capability-provider.ts");
    const memoryProvider = await source("src/bun/modules/memory/implementation/services/desktop-memory-conversation-capability-provider.ts");
    const feishuProvider = await source("src/bun/modules/feishu/implementation/services/desktop-feishu-conversation-capability-provider.ts");
    const settingsPanel = await source("src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx");

    expect(mcpProvider).toContain('description: "提供可直接调用的 MCP 工具能力。",');
    expect(skillsProvider).toContain('description: "提供按需加载的 Skill 技能指令。",');
    expect(memoryProvider).toContain('description: "提供桌面记忆检索能力，可在对话中调用已有记忆内容。",');
    expect(feishuProvider).toContain('description: "提供飞书相关能力，可直接处理飞书里的内容与操作。",');

    expect(settingsPanel).toContain('return "提供可直接调用的 MCP 工具能力。";');
    expect(settingsPanel).toContain('return "提供按需加载的 Skill 技能指令。";');
    expect(settingsPanel).toContain('return "提供桌面记忆检索能力，可在对话中调用已有记忆内容。";');
    expect(settingsPanel).toContain('return "提供飞书相关能力，可直接处理飞书里的内容与操作。";');

    expect(mcpProvider).not.toContain("允许当前工作区的 AI 对话使用已生效的 MCP 工具集合。");
    expect(skillsProvider).not.toContain("允许当前工作区的 AI 对话按需加载已启用技能的 SKILL.md 指令。");
    expect(memoryProvider).not.toContain("允许当前工作区的 AI 对话默认使用桌面记忆检索能力。");
    expect(feishuProvider).not.toContain("允许当前工作区的 AI 对话默认使用飞书智能助手能力。");
  });
});
