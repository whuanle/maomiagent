import { describe, expect, test } from "bun:test";

import { createTranslator } from "./index";

describe("Feishu docs translations", () => {
  test("resolves the document access-status copy instead of echoing raw keys", () => {
    const t = createTranslator("zh-CN");

    expect(t("飞书页.文档.接入状态.未暴露工具.标题")).toBe("当前连接未提供文档工具");
    expect(t("飞书页.文档.接入状态.未暴露工具.描述")).toBe(
      "当前飞书连接没有暴露文档目录或正文工具，请检查接入状态。",
    );
  });

  test("resolves the document workspace copy in English as well", () => {
    const t = createTranslator("en-US");

    expect(t("飞书页.文档.状态标签.已接通")).toBe("Ready");
    expect(t("飞书页.文档.按钮.推送文档")).toBe("Push Document");
    expect(t("飞书页.文档.状态.正在加载")).toBe("Loading");
    expect(t("飞书页.文档.状态.已显示上次结果")).toBe("Showing previous results");
    expect(t("飞书页.文档.状态.加载失败")).toBe("Load failed");
  });

  test("resolves compact tree runtime status copy in Chinese", () => {
    const t = createTranslator("zh-CN");

    expect(t("飞书页.文档.状态.正在加载")).toBe("正在加载");
    expect(t("飞书页.文档.状态.已显示上次结果")).toBe("已显示上次结果");
    expect(t("飞书页.文档.状态.加载失败")).toBe("加载失败");
  });
});
