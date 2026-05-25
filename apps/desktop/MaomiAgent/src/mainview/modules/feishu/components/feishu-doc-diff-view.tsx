import { Alert, Typography } from "antd"

import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir"

const { Text } = Typography

export function FeishuDocDiffView(props: { base: FeishuDocIR | null; current: FeishuDocIR; mdxDiff: string }) {
  const changed = props.base?.integrity.contentHash !== props.current.integrity.contentHash
  return (
    <div data-testid="feishu-doc-diff-view" className="feishu-doc-diff-view">
      <Alert showIcon type={changed ? "warning" : "success"} message={changed ? "存在本地改动" : "无本地改动"} />
      {props.mdxDiff ? <pre className="feishu-doc-diff-view-content">{props.mdxDiff}</pre> : <Text type="secondary">无差异</Text>}
    </div>
  )
}