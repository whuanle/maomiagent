import { describe, expect, test } from "bun:test";

import {
  recoverFeishuDocMarkdownFromGarbledText,
  shouldAttemptRecoverFeishuDocMarkdown,
} from "./feishu-doc-markdown-garbled-recovery";

function createLatin1Mojibake(value: string): string {
  return Buffer.from(value, "utf8").toString("latin1");
}

describe("feishu-doc-markdown-garbled-recovery", () => {
  test("keeps normal utf8 markdown untouched", () => {
    const markdown = "# 飞书文档\n\n这里是正常中文。";

    expect(shouldAttemptRecoverFeishuDocMarkdown(markdown)).toBe(false);
    expect(recoverFeishuDocMarkdownFromGarbledText(markdown)).toBeNull();
  });

  test("does not rewrite regular western accented text", () => {
    const markdown = "# Cafe\n\nCafé résumé naïve déjà vu.";

    expect(shouldAttemptRecoverFeishuDocMarkdown(markdown)).toBe(false);
    expect(recoverFeishuDocMarkdownFromGarbledText(markdown)).toBeNull();
  });

  test("recovers common utf8-decoded-as-latin1 mojibake", () => {
    const markdown = "# 飞书文档\n\n这里是正常中文。";
    const mojibake = createLatin1Mojibake(markdown);

    expect(shouldAttemptRecoverFeishuDocMarkdown(mojibake)).toBe(true);
    expect(recoverFeishuDocMarkdownFromGarbledText(mojibake)).toBe(markdown);
  });
});
