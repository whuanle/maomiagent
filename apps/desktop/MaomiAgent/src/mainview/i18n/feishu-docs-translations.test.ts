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
    expect(t("飞书页.文档.模式.预览")).toBe("Preview");
    expect(t("飞书页.文档.模式.纯文本编辑")).toBe("Plain Text Edit");
    expect(t("飞书页.文档.提示.工作区草稿说明")).toContain("original Markdown");
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

  test("resolves smart assistant copy instead of echoing raw keys", () => {
    const zh = createTranslator("zh-CN");
    const en = createTranslator("en-US");

    expect(zh("飞书页.反馈.智能助手配置已保存")).toBe("飞书智能助手配置已保存");
    expect(zh("飞书页.智能助手.页签.动作目录")).toBe("动作目录");
    expect(zh("飞书页.智能助手.表头.连接方式")).toBe("连接方式");
    expect(zh("飞书页.智能助手.标签.已接入")).toBe("已接入");
    expect(zh("飞书页.智能助手.占位.项目周报")).toBe("例如：项目周报");
    expect(zh("飞书页.智能助手.文案.状态提示.缺少RefreshToken")).toContain("refresh_token");
    expect(en("飞书页.反馈.Token刷新成功")).toBe("Feishu smart assistant token refreshed");
    expect(en("飞书页.智能助手.字段.OAuth回调地址")).toBe("OAuth Callback URL");
    expect(en("飞书页.智能助手.表头.执行入口")).toBe("Execution");
    expect(en("飞书页.智能助手.占位.项目周报")).toContain("Weekly Project Update");
    expect(en("飞书页.智能助手.文案.状态提示.缺少RefreshToken")).toContain("offline_access");
    expect(en("飞书页.智能助手.校验.JSON对象格式错误", { 字段: "Fields JSON" })).toBe(
      "Fields JSON must be a valid JSON object",
    );
  });

  test("resolves bot surface copy instead of echoing raw keys", () => {
    const zh = createTranslator("zh-CN");
    const en = createTranslator("en-US");

    expect(zh("飞书页.机器人.字段分组.工作区")).toBe("工作区");
    expect(zh("飞书页.字段.AppId")).toBe("AppId");
    expect(zh("飞书页.按钮.保存机器人配置")).toBe("保存机器人配置");
    expect(zh("飞书页.值.未收到")).toBe("未收到");
    expect(zh("飞书页.机器人状态.connected")).toBe("已连接");
    expect(zh("飞书页.字段.待确认操作")).toBe("待确认操作");
    expect(en("飞书页.机器人.字段.默认工作区")).toBe("Default Workspace");
    expect(en("飞书页.字段.AppSecret")).toBe("App Secret");
    expect(en("飞书页.按钮.刷新")).toBe("Refresh");
    expect(en("飞书页.值.未选择")).toBe("Not Selected");
    expect(en("飞书页.字段.事件状态")).toBe("Event Status");
    expect(en("飞书页.机器人.提示.缺少图片模型")).toContain("image-capable model");
  });
});
