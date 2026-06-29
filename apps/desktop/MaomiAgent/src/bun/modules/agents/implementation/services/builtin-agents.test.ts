import { expect, test } from "bun:test";

import {
  BUILTIN_MAOMI_AGENTS,
  FEISHU_DOC_WRITER_AGENT_ID,
  resolveBuiltinDefaultAgentId,
} from "./builtin-agents";
import {
  CONCISE_AGENT_ID,
  DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
  MAOMI_COORDINATOR_AGENT_ID,
  UI_DESIGNER_AGENT_ID,
  WECHAT_AGENT_ID,
} from "../../../../../shared/conversation/managed-execution";

test("builtin agent default resolves to coordinator mode when available", () => {
  expect(DEFAULT_DESKTOP_PRIMARY_AGENT_ID).toBe(MAOMI_COORDINATOR_AGENT_ID);
  expect(resolveBuiltinDefaultAgentId((agentId) => agentId === MAOMI_COORDINATOR_AGENT_ID)).toBe(MAOMI_COORDINATOR_AGENT_ID);
});

test("builtin concise agent uses the concise mode label", () => {
  expect(BUILTIN_MAOMI_AGENTS.find((item) => item.agentId === CONCISE_AGENT_ID)?.name).toBe("简洁模式");
});

test("builtin concise agent prompt and description allow minimal execution when explicitly requested", () => {
  const item = BUILTIN_MAOMI_AGENTS.find((agent) => agent.agentId === CONCISE_AGENT_ID);

  expect(item?.description).toContain("最小必要动作");
  expect(item?.prompt).toContain("当用户明确要求实现、修复、修改文件、运行命令、验证结果、落盘代码或直接推进时，应立即动手完成");
  expect(item?.prompt).not.toContain("不要默认再去本地落盘、启动程序、补一轮测试或额外委派");
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

test("builtin feishu doc agent is visible in both primary and subagent contexts with doc-safe rules", () => {
  const item = BUILTIN_MAOMI_AGENTS.find((agent) => agent.agentId === FEISHU_DOC_WRITER_AGENT_ID);

  expect(item).toMatchObject({
    agentId: FEISHU_DOC_WRITER_AGENT_ID,
    name: "飞书文档助手",
    mode: "all",
    enabled: true,
    source: "builtin-maomi",
  });
  expect(item?.prompt).toContain("本地草稿");
  expect(item?.prompt).toContain("字面量工作区相对路径");
  expect(item?.prompt).toContain("严格 Markdown");
  expect(item?.prompt).toContain("不直接推送");
  expect(item?.prompt).toContain("`# 标题`");
  expect(item?.prompt).toContain("标题层级");
  expect(item?.prompt).toContain("callout");
  expect(item?.prompt).toContain("`workspace_edit_file`");
  expect(item?.prompt).toContain("`workspace_apply_patch`");
  expect(item?.prompt).toContain("普通局部修改优先使用 `workspace_apply_patch`");
  expect(item?.prompt).toContain("只有在目标章节是单一连续文本块、边界非常清晰时，才优先使用 `workspace_edit_file`");
  expect(item?.prompt).toContain("先重新读取目标区域，再改用 `workspace_apply_patch`");
  expect(item?.prompt).toContain("`content` 字段");
  expect(item?.prompt).toContain("不要先输出大段计划");
  expect(item?.prompt).toContain("同步块");
  expect(item?.prompt).toContain("不臆造资源 token");
});

test("builtin ui designer agent is visible as a primary design assistant", () => {
  const item = BUILTIN_MAOMI_AGENTS.find((agent) => agent.agentId === UI_DESIGNER_AGENT_ID);

  expect(item).toMatchObject({
    agentId: UI_DESIGNER_AGENT_ID,
    name: "UI 设计师",
    mode: "primary",
    enabled: true,
    source: "builtin-maomi",
  });
  expect(item?.prompt).toContain("设计系统");
  expect(item?.prompt).toContain("组件规范体系");
  expect(item?.prompt).toContain("按钮");
  expect(item?.prompt).toContain("表单");
  expect(item?.prompt).toContain("设计稿预览壳");
  expect(item?.prompt).toContain("组件展示壳");
  expect(item?.prompt).toContain("最小业务示例壳");
  expect(item?.prompt).toContain("而不是把重点带到架构和实现细节上");
  expect(item?.prompt).toContain("附件");
  expect(item?.prompt).toContain("真实工具");
  expect(item?.prompt).toContain("不要输出 <tool_call>");
  expect(item?.prompt).not.toContain("可运行模板项目规格");
  expect(item?.prompt).not.toContain("项目骨架");
});
