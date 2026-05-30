import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const workspaceRoot = process.cwd()

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8")
}

describe("FeishuDocPermissionInspectModal", () => {
  test("renders identity, document probes, whiteboard probes, and latest pull summary", async () => {
    const modal = await source("src/mainview/modules/feishu/components/feishu-doc-permission-inspect-modal.tsx")

    expect(modal).toContain('rootClassName="feishu-doc-permission-inspect-modal"')
    expect(modal).toContain('props.t("飞书页.文档.权限检查.标题")')
    expect(modal).toContain('props.t("飞书页.文档.权限检查.字段.授权状态")')
    expect(modal).toContain('props.t("飞书页.文档.权限检查.字段.Token到期")')
    expect(modal).toContain('props.t("飞书页.文档.权限检查.分组.文档探测")')
    expect(modal).toContain('props.t("飞书页.文档.权限检查.分组.白板探测")')
    expect(modal).toContain('whiteboardRecovery.recoveredCount')
    expect(modal).toContain('whiteboardRecovery.fallbackCount')
    expect(modal).toContain('item.token')
    expect(modal).toContain('String(probe.code)')
  })
})
