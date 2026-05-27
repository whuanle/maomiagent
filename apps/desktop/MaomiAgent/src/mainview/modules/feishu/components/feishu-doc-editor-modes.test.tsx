import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const componentDir = import.meta.dir

describe("Feishu doc editor modes", () => {
  test("declares preview mode and a source edit surface", async () => {
    const [workbench, visual, source] = await Promise.all([
      readFile(join(componentDir, "docs-workbench.tsx"), "utf8"),
      readFile(join(componentDir, "feishu-doc-visual-editor.tsx"), "utf8"),
      readFile(join(componentDir, "feishu-doc-source-editor.tsx"), "utf8"),
    ])

    expect(workbench).toContain('useState<FeishuDocWorkspaceViewMode>("preview")')
    expect(workbench).toContain('props.t("飞书页.文档.模式.预览")')
    expect(workbench).toContain('props.t("飞书页.文档.模式.编辑")')
    expect(workbench).not.toContain('props.t("飞书页.文档.模式.可视化编辑")')
    expect(workbench).not.toContain('props.t("飞书页.文档.模式.纯文本编辑")')
    expect(workbench).not.toContain('props.t("飞书页.文档.提示.工作区草稿说明")')
    expect(workbench).toContain('props.t("飞书页.文档.按钮.保存草稿")')
    expect(workbench).toContain('props.t("飞书页.文档.按钮.取消编辑")')
    expect(workbench).toContain('window.addEventListener("beforeunload", handleBeforeUnload)')
    expect(workbench).toContain('const becameInactive = !props.active && wasPageActiveRef.current')
    expect(workbench).not.toContain('editable={hasWorkspaceContext}')
    expect(workbench).toContain('className="feishu-docs-source-edit-shell"')
    expect(workbench).toContain('saveFeishuWorkspaceDocLocalDraft(')
    expect(workbench).not.toContain('if (props.workspaceId && !item.cache)')
    expect(workbench.indexOf('className="feishu-docs-workspace-actions"')).toBeGreaterThan(-1)
    expect(workbench).not.toContain('className="feishu-docs-workspace-view-switch is-secondary"')
    expect(workbench).not.toContain("FeishuDocDiffView")
    expect(visual).toContain('data-testid="feishu-doc-visual-editor"')
    expect(visual).toContain('className="feishu-doc-visual-outline"')
    expect(visual).toContain('data-feishu-doc-heading-id')
    expect(visual).not.toContain('suppressHtmlProcessing')
    expect(visual).toContain("scrollContainer.scrollTop = Math.max(nextScrollTop, 0)")
    expect(visual).not.toContain('behavior: "smooth"')
    expect(source).toContain('import Editor from "@monaco-editor/react"')
    expect(source).toContain('language={props.language ?? "markdown"}')
    expect(source).toContain('data-testid="feishu-doc-source-editor"')
  })
})