import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const componentDir = import.meta.dir

describe("Feishu doc editor modes", () => {
  test("declares visual source and diff mode surfaces", async () => {
    const [visual, source, diff] = await Promise.all([
      readFile(join(componentDir, "feishu-doc-visual-editor.tsx"), "utf8"),
      readFile(join(componentDir, "feishu-doc-source-editor.tsx"), "utf8"),
      readFile(join(componentDir, "feishu-doc-diff-view.tsx"), "utf8"),
    ])

    expect(visual).toContain('data-testid="feishu-doc-visual-editor"')
    expect(source).toContain('data-testid="feishu-doc-source-editor"')
    expect(diff).toContain('data-testid="feishu-doc-diff-view"')
  })
})