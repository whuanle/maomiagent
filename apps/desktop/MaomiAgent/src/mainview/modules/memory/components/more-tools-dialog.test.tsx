import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createMemoryTranslator } from "../i18n";
import { MemoryMoreToolsDialogContent } from "./more-tools-dialog";

const t = createMemoryTranslator("zh-CN");

describe("MemoryMoreToolsDialog", () => {
  test("understand mode keeps only results content and inline runtime memory context", () => {
    const markup = renderToStaticMarkup(
      <MemoryMoreToolsDialogContent
        activeTool="understand"
        blockedReason={undefined}
        searchLoading={false}
        searchItems={[]}
        runtimeContext={{
          query: "当前会话偏好",
          items: [
            {
              unitId: "runtime-1",
              summary: "用户偏好简洁回答",
              kind: "preference",
              tier: "long",
              sourceScope: "global",
              score: 0.92,
            },
          ],
        }}
        runtimeLoading={false}
        t={t}
      />,
    );

    expect(markup).toContain("输入一句话，看看系统会想起哪些记忆。");
    expect(markup).toContain("当前相关记忆");
    expect(markup).toContain("用户偏好简洁回答");
    expect(markup).toContain("暂无检索结果");
    expect(markup).not.toContain("查看会想起什么");
    expect(markup).not.toContain("检索工作台");
    expect(markup).not.toContain("治理动作");
    expect(markup).not.toContain("整理记忆");
    expect(markup).not.toContain("memory-page-inline-controls");
    expect(markup).not.toContain("运行中的记忆");
    expect(markup).not.toContain("当前上下文");
  });

  test("organize mode keeps explanation with preview output but no inline action controls", () => {
    const markup = renderToStaticMarkup(
      <MemoryMoreToolsDialogContent
        activeTool="organize"
        blockedReason={undefined}
        organizeLoading={false}
        organizeSummary="未发现需要整理的记忆。"
        t={t}
      />,
    );

    expect(markup).toContain("按时间范围预览可以整理的记忆。");
    expect(markup).toContain("未发现需要整理的记忆。");
    expect(markup).not.toContain("开始整理");
    expect(markup).not.toContain("理解记忆");
    expect(markup).not.toContain("memory-page-inline-controls");
    expect(markup).not.toContain("运行中的记忆");
  });
});
