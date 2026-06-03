import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workspaceRoot = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8");
}

describe("conversation workspace settings panel copy", () => {
  test("uses task-focused Chinese runtime setting hints", async () => {
    const panel = await source("src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx");

    expect(panel).toContain('thinkingHint: "提供更完整的分析与推理过程，适合拆解复杂问题。",');
    expect(panel).toContain('managedExecutionEnabledHint: "自动接管连续执行任务，适合需要持续推进的工作。",');
    expect(panel).toContain('managedExecutionDisabledHint: "保持普通对话方式，由你按需发起下一步。",');
    expect(panel).toContain('sandboxHint: "提供更受限的执行环境，适合先在隔离环境中完成操作。",');
    expect(panel).toContain('return "提供可直接调用的 MCP 工具能力。";');
    expect(panel).toContain('return "提供按需加载的 Skill 技能指令。";');
    expect(panel).toContain('return "提供飞书相关能力，可直接处理飞书里的内容与操作。";');
    expect(panel).toContain('return "提供桌面记忆检索能力，可在对话中调用已有记忆内容。";');

    expect(panel).not.toContain("将 Thinking 保存为当前工作区默认偏好，并同步到对话运行时偏好。");
    expect(panel).not.toContain("当前工作区新建会话会优先按托管执行入口组织。");
    expect(panel).not.toContain("当前工作区新建会话保持普通对话入口。");
    expect(panel).not.toContain("将沙箱模式保存为当前工作区默认偏好，并同步到对话运行时偏好。");
    expect(panel).not.toContain("允许当前工作区的 AI 对话使用已生效的 MCP 工具集合。");
    expect(panel).not.toContain("允许当前工作区的 AI 对话按需加载已启用技能的 SKILL.md 指令。");
    expect(panel).not.toContain("允许当前工作区的 AI 对话默认使用飞书智能助手能力。");
    expect(panel).not.toContain("允许当前工作区的 AI 对话默认使用桌面记忆检索能力。");
  });

  test("no longer renders avatar settings inside the chat workspace settings panel", async () => {
    const panel = await source("src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx");

    expect(panel).not.toContain("avatarSectionTitle");
    expect(panel).not.toContain("对话头像");
    expect(panel).not.toContain("assistantAvatarDataUrl");
    expect(panel).not.toContain("userAvatarDataUrl");
  });
});
